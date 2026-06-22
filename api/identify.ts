// Identify a film/series/anime from an uploaded image (scene, poster, character)
// using Claude's vision. Server-side only (ANTHROPIC_API_KEY).
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// La guardia AI è INLINE in ogni endpoint (non importata da un modulo condiviso
// ./_lib): così il codice finisce SEMPRE nel bundle della singola funzione
// serverless di Vercel. Un modulo condiviso non veniva incluso nel deploy →
// "Cannot find module aiGuard" (import dinamico) o 500 generico (import statico).
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? '3')

interface GuardReq {
  headers?: Record<string, string | string[] | undefined>
}
interface GuardRes {
  status: (code: number) => GuardRes
  json: (body: unknown) => void
}

// Auth (JWT Supabase) + tetto giornaliero per utente (tabella ai_usage, RPC
// consume_ai_credit). Ritorna { creditsLeft } se ok, oppure null dopo aver già
// risposto con 401/429/503/500 (il chiamante deve solo fare return).
async function guardAi(req: GuardReq, res: GuardRes): Promise<{ creditsLeft: number | null } | null> {
  try {
    if (!SUPABASE_URL || !ANON_KEY) {
      res.status(503).json({ error: 'Autenticazione non configurata lato server.' })
      return null
    }
    const raw = req.headers?.authorization ?? req.headers?.Authorization
    const value = Array.isArray(raw) ? raw[0] : raw
    const token = value ? /^Bearer\s+(.+)$/i.exec(value)?.[1] ?? null : null
    if (!token) {
      res.status(401).json({ error: 'Accedi per usare le funzioni AI.' })
      return null
    }
    const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    const { data, error } = await supa.auth.getUser(token)
    if (error || !data?.user) {
      res.status(401).json({ error: 'Sessione non valida. Accedi di nuovo.' })
      return null
    }
    if (!SERVICE_ROLE_KEY) return { creditsLeft: null } // auth-only: tetto non configurato
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data: count, error: rpcErr } = await admin.rpc('consume_ai_credit', {
      p_user_id: data.user.id,
      p_limit: AI_DAILY_LIMIT,
    })
    if (rpcErr) return { creditsLeft: null } // DB ko → non bloccare un utente legittimo
    const used = Number(count)
    if (used === -1) {
      res.status(429).json({
        error: `Hai raggiunto il limite di ${AI_DAILY_LIMIT} usi AI per oggi. Riprova domani.`,
        aiCreditsLeft: 0,
      })
      return null
    }
    return { creditsLeft: Math.max(0, AI_DAILY_LIMIT - used) }
  } catch (err) {
    res.status(500).json({ error: `Errore nel controllo accessi AI: ${(err as Error).message}` })
    return null
  }
}

interface RequestBody {
  image?: string // base64 (no data: prefix)
  mediaType?: string // image/jpeg | image/png | image/webp
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const SYSTEM_PROMPT = `Sei un esperto di cinema, serie TV e anime con enorme memoria visiva.
Ti viene mostrata un'immagine (fotogramma, locandina, personaggio, screenshot o un COLLAGE
con più titoli). Analizzala e restituisci:
1) "titles": TUTTI i film/serie/anime distinti che riconosci. Se è un collage con più opere,
   elencale tutte (una voce ciascuna). Se è una sola scena ambigua, metti fino a 3 ipotesi.
   Per ognuna: titolo (nome più conosciuto), anno se noto, tipo ("movie" o "tv"),
   confidenza ("alta"|"media"|"bassa"), e una motivazione brevissima (cosa riconosci).
2) "people": eventuali PERSONE riconoscibili (attori, registi). Per ognuna: nome,
   ruolo se evidente (es. "attore", "regista"), confidenza, e una motivazione.
Se non riconosci nulla in una categoria, restituisci lista vuota. Non inventare nomi/titoli.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, nella forma:
{"titles":[{"title":"Titolo","year":"2005","type":"movie","confidence":"alta","reason":"cosa riconosci"}],"people":[{"name":"Nome","role":"attore","confidence":"media","reason":"motivazione"}]}
dove "type" è "movie" o "tv" e "confidence" è "alta", "media" o "bassa".`

// Estrae il primo oggetto JSON dalla risposta (tollerante a testo/markdown extra).
function extractJson<T>(text: string, fallback: T): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) return fallback
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    return fallback
  }
}

export const config = { maxDuration: 60 }

interface ApiRequest {
  method?: string
  body?: RequestBody | string
}
interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo non consentito. Usa POST.' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'AI non configurata (manca ANTHROPIC_API_KEY lato server).' })
    return
  }

  const body: RequestBody =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const image = body.image ?? ''
  const mediaType = body.mediaType ?? 'image/jpeg'

  if (!image) {
    res.status(400).json({ error: 'Nessuna immagine ricevuta.' })
    return
  }
  if (!ALLOWED.has(mediaType)) {
    res.status(400).json({ error: 'Formato immagine non supportato.' })
    return
  }

  try {
    const guard = await guardAi(req as never, res as never)
    if (!guard) return

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1536,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: image },
            },
            { type: 'text', text: 'Identifica tutti i titoli e le persone riconoscibili nell\'immagine.' },
          ],
        },
      ],
    })
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
    const parsed = extractJson(text, { titles: [], people: [] })
    res.status(200).json({ ...parsed, aiCreditsLeft: guard.creditsLeft })
  } catch (err) {
    const msg = (err as Error).message
    if (/credit balance is too low/i.test(msg)) {
      res.status(502).json({ error: 'Crediti AI esauriti: ricarica il saldo su Anthropic (Plans & Billing).' })
      return
    }
    res.status(500).json({ error: `Errore nell'identificare l'immagine: ${msg}` })
  }
}
