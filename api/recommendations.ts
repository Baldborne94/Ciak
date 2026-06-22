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

// Vercel serverless function (Node runtime).
// The Anthropic key lives ONLY on the server — never prefixed with VITE_, so it
// is never bundled into the browser. The browser POSTs the user's favorite and
// watched titles; we ask Claude for personalised picks with an explanation each.

interface TitleSummary {
  title: string
  mediaType?: string
  year?: string | number
  genres?: string[]
}

interface RequestBody {
  favorites?: TitleSummary[]
  watched?: TitleSummary[]
  excludedGenres?: string[]
}

const SYSTEM_PROMPT = `Sei il curatore cinematografico di Ciak, un cinefilo appassionato.
Analizzi i titoli preferiti e già visti dall'utente per individuare pattern — generi
ricorrenti, registi amati, temi narrativi, periodi storici — e proponi nuovi titoli.
Per ogni suggerimento scrivi una spiegazione personalizzata e calorosa in italiano,
del tipo "Te lo consiglio perché ami X e Y, e questo titolo condivide…".
Suggerisci titoli reali ed esistenti. Non ripetere titoli già visti o già preferiti.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, nella forma:
{"suggestions":[{"title":"Titolo","reason":"spiegazione personalizzata"}]}`

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

// Minimal Vercel-style handler signature, kept framework-agnostic.
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
      error:
        'Le raccomandazioni AI non sono ancora configurate (manca ANTHROPIC_API_KEY lato server).',
    })
    return
  }

  const body: RequestBody =
    typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})

  const { favorites = [], watched = [], excludedGenres = [] } = body

  if (favorites.length === 0 && watched.length === 0) {
    res.status(200).json({ suggestions: [] })
    return
  }

  const userPrompt = [
    `Titoli PREFERITI dell'utente:\n${describe(favorites)}`,
    `\nTitoli GIÀ VISTI:\n${describe(watched)}`,
    excludedGenres.length
      ? `\nGeneri da ESCLUDERE dai suggerimenti: ${excludedGenres.join(', ')}`
      : '',
    `\nProponi da 5 a 8 titoli nuovi, ciascuno con una spiegazione personalizzata.`,
  ].join('\n')

  try {
    const guard = await guardAi(req as never, res as never)
    if (!guard) return

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
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
    res.status(500).json({ error: `Errore nel generare le raccomandazioni: ${msg}` })
  }
}
