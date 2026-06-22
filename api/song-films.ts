// Given a song, ask Claude in which films it was famously used (needle-drops,
// title themes, key scenes). Server-side only (ANTHROPIC_API_KEY).
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
  song?: string
}

const SYSTEM_PROMPT = `Sei un esperto di musica nel cinema. Data una canzone, individua i FILM
(reali ed esistenti) in cui è stata usata in modo memorabile: needle-drop, scena chiave,
tema, sigla o nei titoli di coda. USA LA RICERCA WEB per verificare gli utilizzi reali
(fonti come Tunefind, WhatSong, IMDb soundtracks) invece di affidarti solo alla memoria.

REGOLE FERREE:
- Considera ESCLUSIVAMENTE la canzone esatta indicata (titolo e, se c'è, artista).
- NON sostituirla con un'altra canzone o un altro artista, nemmeno se simili.
- Includi un film SOLO se proprio QUELLA canzone vi è usata, confermato da una fonte.
- Per ogni film: titolo esatto come su IMDb/TMDB, l'anno, e una breve descrizione dell'uso.
- Se non trovi utilizzi affidabili di QUELLA precisa canzone, restituisci lista vuota.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, nella forma:
{"films":[{"title":"Titolo","year":"2005","scene":"descrizione dell'uso"}]}
Se non trovi nulla, rispondi {"films":[]}.`

// Best-effort JSON extraction from a free-form model answer (web search adds
// citation text around the JSON, so we can't use strict structured outputs).
function extractFilms(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) return { films: [] }
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return { films: [] }
  }
}

// Give the web-search round-trips room before Vercel kills the function.
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
  const song = (body.song ?? '').trim()

  if (!song) {
    res.status(200).json({ films: [] })
    return
  }

  try {
    const guard = await guardAi(req as never, res as never)
    if (!guard) return

    const client = new Anthropic({ apiKey })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      {
        role: 'user',
        content: `Canzone: "${song}"\nIn quali film è stata usata? Verifica con la ricerca web e rispondi solo col JSON.`,
      },
    ]

    // Web search is a server-side tool; the API may pause after several rounds.
    // Re-send the assistant turn to let it finish (bounded loop).
    // Fewer searches + maxDuration keep it fast and under the timeout.
    const baseReq = {
      model: 'claude-opus-4-8',
      max_tokens: 1536,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
    }
    let message = await client.messages.create({ ...baseReq, messages })
    let rounds = 0
    while (message.stop_reason === 'pause_turn' && rounds++ < 3) {
      messages.push({ role: 'assistant', content: message.content })
      message = await client.messages.create({ ...baseReq, messages })
    }

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
    const parsed = extractFilms(text) as Record<string, unknown>
    res.status(200).json({ ...parsed, aiCreditsLeft: guard.creditsLeft })
  } catch (err) {
    const msg = (err as Error).message
    if (/credit balance is too low/i.test(msg)) {
      res.status(502).json({ error: 'Crediti AI esauriti: ricarica il saldo su Anthropic (Plans & Billing).' })
      return
    }
    res.status(500).json({ error: `Errore nella ricerca per canzone: ${msg}` })
  }
}
