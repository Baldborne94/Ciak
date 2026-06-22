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

// Vercel serverless function (Node runtime). maxDuration alto: le chiamate Opus
// possono superare il timeout di default e tornare un 500/504 senza corpo JSON.
export const config = { maxDuration: 60 }

// "Non so cosa vedere stasera": l'utente sceglie umore + tempo a disposizione,
// noi gli passiamo anche i suoi gusti (preferiti/visti) e Claude propone titoli
// che ENTRANO nel tempo disponibile e si adattano all'umore.
// La chiave Anthropic vive SOLO lato server (mai prefisso VITE_).

interface TitleSummary {
  title: string
  mediaType?: string
  year?: string | number
  genres?: string[]
}

interface RequestBody {
  mood?: string
  maxMinutes?: number | null
  wantSeries?: boolean
  favorites?: TitleSummary[]
  watched?: TitleSummary[]
  excludedGenres?: string[]
}

const SYSTEM_PROMPT = `Sei il curatore cinematografico di Ciak, un cinefilo che aiuta a decidere cosa
guardare STASERA, in base all'umore della persona e al tempo che ha a disposizione.
Regole:
- Rispetta il tempo disponibile: se è un film, la durata deve stare comodamente nel
  tempo indicato; se la persona vuole una serie, suggerisci serie con episodi che
  entrano nel tempo (indica quanti episodi può vedere).
- Rispetta l'umore richiesto (es. leggero, adrenalina, romantico, riflessivo…).
- Tieni conto dei suoi gusti (generi, registi, temi) dai titoli preferiti e visti.
- Suggerisci titoli reali ed esistenti. Non ripetere titoli già visti o già preferiti.
- Scrivi spiegazioni brevi, calorose e in italiano.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, nella forma:
{"suggestions":[{"title":"Titolo","year":"2010","length":"≈148 min","reason":"perché stasera è perfetto"}]}`

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

function describe(titles: TitleSummary[] = []): string {
  if (titles.length === 0) return '(nessuno)'
  return titles
    .map((t) => {
      const parts = [t.title]
      if (t.year) parts.push(`(${t.year})`)
      if (t.genres?.length) parts.push(`— ${t.genres.join(', ')}`)
      return parts.join(' ')
    })
    .join('\n')
}

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
    res.status(503).json({
      error: 'La funzione AI non è ancora configurata (manca ANTHROPIC_API_KEY lato server).',
    })
    return
  }

  const body: RequestBody =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})

  const {
    mood = 'qualcosa di bello',
    maxMinutes = null,
    wantSeries = false,
    favorites = [],
    watched = [],
    excludedGenres = [],
  } = body

  const timeLine = wantSeries
    ? maxMinutes
      ? `Ha circa ${maxMinutes} minuti e vuole una SERIE: indica quanti episodi può vedere nel tempo.`
      : `Vuole una SERIE: proponi serie da iniziare stasera.`
    : maxMinutes
      ? `Ha circa ${maxMinutes} minuti: il film deve stare comodamente in questo tempo.`
      : `Non ha un limite di tempo stringente.`

  const userPrompt = [
    `Umore di stasera: ${mood}`,
    timeLine,
    `\nTitoli PREFERITI dell'utente:\n${describe(favorites)}`,
    `\nTitoli GIÀ VISTI:\n${describe(watched)}`,
    excludedGenres.length ? `\nGeneri da ESCLUDERE: ${excludedGenres.join(', ')}` : '',
    `\nProponi da 3 a 5 titoli adatti a stasera, ciascuno con durata e una breve spiegazione.`,
  ].join('\n')

  try {
    const guard = await guardAi(req as never, res as never)
    if (!guard) return

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1536,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
    const parsed = extractJson(text, { suggestions: [] })
    res.status(200).json({ ...parsed, aiCreditsLeft: guard.creditsLeft })
  } catch (err) {
    const msg = (err as Error).message
    if (/credit balance is too low/i.test(msg)) {
      res.status(502).json({ error: 'Crediti AI esauriti: ricarica il saldo su Anthropic (Plans & Billing).' })
      return
    }
    res.status(500).json({ error: `Errore nel generare i suggerimenti: ${msg}` })
  }
}
