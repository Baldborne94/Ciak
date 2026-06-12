import { createClient } from '@supabase/supabase-js'

// Server-side protection for the AI endpoints. Two layers:
//  1) AUTH — only a logged-in Supabase user (valid JWT) can call the endpoint.
//     This alone blocks anonymous/bot abuse of /api/*, the main cost vector.
//  2) DAILY CAP — a per-user daily counter on the `ai_usage` table, incremented
//     atomically by the service role. Tamper-proof (unlike the client cap).
//
// Files under api/_lib are ignored by Vercel's routing (leading underscore),
// so this is a shared helper, not an endpoint.

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
export const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? '3')

interface GuardRequest {
  headers?: Record<string, string | string[] | undefined>
}
interface GuardResponse {
  status: (code: number) => GuardResponse
  json: (body: unknown) => void
}

function bearerToken(req: GuardRequest): string | null {
  const raw = req.headers?.authorization ?? req.headers?.Authorization
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  const match = /^Bearer\s+(.+)$/i.exec(value)
  return match ? match[1] : null
}

// Validates the caller's Supabase JWT. Returns the user id, or null after
// writing a 401/503 response.
async function requireUser(req: GuardRequest, res: GuardResponse): Promise<string | null> {
  if (!SUPABASE_URL || !ANON_KEY) {
    // Can't verify identity → fail closed rather than leave the endpoint open.
    res.status(503).json({ error: 'Autenticazione non configurata lato server.' })
    return null
  }
  const token = bearerToken(req)
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
  return data.user.id
}

// Atomically reserves one daily AI credit. Returns the remaining credits, or
// null when the DB counter isn't configured (auth-only protection). Writes a
// 429 and returns -1 when the daily limit is already reached.
async function consumeCredit(userId: string, res: GuardResponse): Promise<number | null | -1> {
  if (!SERVICE_ROLE_KEY) return null // hard cap not set up yet; auth gate still applies
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('consume_ai_credit', {
    p_user_id: userId,
    p_limit: AI_DAILY_LIMIT,
  })
  if (error) return null // DB hiccup → don't block a legit user; auth already filtered bots
  const newCount = Number(data)
  if (newCount === -1) {
    res.status(429).json({
      error: `Hai raggiunto il limite di ${AI_DAILY_LIMIT} usi AI per oggi. Riprova domani.`,
      aiCreditsLeft: 0,
    })
    return -1
  }
  return Math.max(0, AI_DAILY_LIMIT - newCount)
}

// Gate an AI endpoint: enforce auth, then reserve one daily credit.
// Returns { userId, creditsLeft } on success, or null if the request was
// already answered with 401/429/503 (the caller should just return).
export async function guardAi(
  req: GuardRequest,
  res: GuardResponse,
): Promise<{ userId: string; creditsLeft: number | null } | null> {
  const userId = await requireUser(req, res)
  if (!userId) return null
  const creditsLeft = await consumeCredit(userId, res)
  if (creditsLeft === -1) return null
  return { userId, creditsLeft }
}
