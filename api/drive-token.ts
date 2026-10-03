// Il collegamento a Drive che non scade, passo 3: un token nuovo di un'ora
// per chi è loggato, dal refresh token che il server tiene in Supabase.
// Il browser lo chiede quando il suo sta per scadere, senza che si veda
// niente. DELETE toglie il refresh token: «Scollega» in Ciak vuol dire
// anche questo, se no il server ricollegherebbe da solo.
//
// Risposte: 200 {access_token, expires_in}; 404 se per questo utente non c'è
// un permesso (mai collegato così, o tolto da Google: allora si ricollega);
// 503 se il server non è configurato (il browser torna al vecchio giro).
import { createClient } from '@supabase/supabase-js'
import { ENDPOINT_TOKEN_GOOGLE } from '../src/lib/driveStato'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

interface Req {
  method?: string
  headers?: Record<string, string | string[] | undefined>
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
  setHeader: (nome: string, valore: string) => void
}

function primo(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

async function utenteLoggato(req: Req): Promise<string | null> {
  const valore = primo(req.headers?.authorization ?? req.headers?.Authorization)
  const token = valore ? (/^Bearer\s+(.+)$/i.exec(valore)?.[1] ?? null) : null
  if (!token || !SUPABASE_URL || !ANON_KEY) return null
  const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await supa.auth.getUser(token)
  return error || !data?.user ? null : data.user.id
}

interface RispostaRinnovo {
  access_token?: string
  expires_in?: number
  error?: string
}

// Cosa fare della risposta di Google al rinnovo. `invalid_grant` vuol dire
// che il permesso non c'è più (tolto dall'utente, o scaduto perché non
// usato per sei mesi): il refresh token va buttato, e si ricollega.
export function leggiRinnovo(r: RispostaRinnovo): { token: string; secondi: number } | { revocato: true } | { errore: string } {
  if (r.access_token) return { token: r.access_token, secondi: r.expires_in ?? 3600 }
  if (r.error === 'invalid_grant') return { revocato: true }
  return { errore: r.error || 'Google non ha risposto.' }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Metodo non consentito.' })
    return
  }
  if (!CLIENT_ID || !CLIENT_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(503).json({ error: 'Il rinnovo automatico di Drive non è configurato lato server.' })
    return
  }
  const utente = await utenteLoggato(req)
  if (!utente) {
    res.status(401).json({ error: 'Accedi a Ciak per usare Google Drive.' })
    return
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  if (req.method === 'DELETE') {
    const { error } = await admin.from('drive_tokens').delete().eq('user_id', utente)
    if (error) {
      res.status(500).json({ error: `Il permesso non si è potuto togliere: ${error.message}` })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  const { data, error } = await admin.from('drive_tokens').select('refresh_token').eq('user_id', utente).maybeSingle()
  if (error) {
    res.status(500).json({ error: `Il permesso non si è potuto leggere: ${error.message}` })
    return
  }
  if (!data?.refresh_token) {
    res.status(404).json({ error: 'Google Drive non è collegato con il permesso permanente.' })
    return
  }

  let esito: ReturnType<typeof leggiRinnovo>
  try {
    const risposta = await fetch(ENDPOINT_TOKEN_GOOGLE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: data.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    })
    esito = leggiRinnovo((await risposta.json()) as RispostaRinnovo)
  } catch {
    esito = { errore: 'Google non risponde: riprova fra poco.' }
  }
  if ('revocato' in esito) {
    await admin.from('drive_tokens').delete().eq('user_id', utente)
    res.status(404).json({ error: 'Il permesso di Google non c’è più: ricollega Google Drive.' })
    return
  }
  if ('errore' in esito) {
    res.status(502).json({ error: esito.errore })
    return
  }
  res.status(200).json({ access_token: esito.token, expires_in: esito.secondi })
}
