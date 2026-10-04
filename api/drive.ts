// Il collegamento a Drive che non scade. Una funzione sola per i tre passi
// (`?azione=`): Vercel conta ogni file di api/ come una funzione, e il piano
// Hobby ne concede dodici.
//
//   auth      POST, con la sessione di Ciak: l'indirizzo del consenso di
//             Google, con uno state firmato.
//   callback  GET, da Google (riscritto da /api/drive-callback, vedi
//             vercel.json): scambia il codice col client secret per il
//             refresh token, che resta in Supabase (drive_tokens, solo per il
//             server), e rimanda il browser alla pagina di partenza col primo
//             token di un'ora nel frammento — la stessa forma del vecchio
//             consenso, che il browser sa già leggere.
//   token     POST: un token nuovo di un'ora dal refresh token. DELETE: via
//             il refresh token («Scollega» vuol dire anche questo).
//
// Senza GOOGLE_CLIENT_SECRET risponde 503 e il browser torna al vecchio giro
// (il token di un'ora, rinnovato con un redirect). La guardia dell'utente è
// inline, come negli altri endpoint (vedi api/identify.ts).
import { createClient } from '@supabase/supabase-js'
import {
  DURATA_STATO_MS,
  ENDPOINT_TOKEN_GOOGLE,
  PERCORSO_CALLBACK,
  firmaStato,
  indirizzoRitorno,
  origineRichiesta,
  percorsoSicuro,
  statoClienteValido,
  urlConsensoServer,
  verificaStato,
} from '../src/lib/driveStato'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
  setHeader: (nome: string, valore: string) => void
  end: () => void
}

function primo(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

// Quale passo: dal parametro, o dalla forma della richiesta se la riscrittura
// non l'ha passato (Google torna con `code` o `error` e lo `state`).
export function azioneRichiesta(query: Record<string, string | string[] | undefined> | undefined): 'auth' | 'callback' | 'token' | null {
  const a = primo(query?.azione)
  if (a === 'auth' || a === 'callback' || a === 'token') return a
  if (primo(query?.state) && (primo(query?.code) || primo(query?.error))) return 'callback'
  return null
}

async function utenteLoggato(req: Req): Promise<string | null> {
  const valore = primo(req.headers?.authorization ?? req.headers?.Authorization)
  const token = valore ? (/^Bearer\s+(.+)$/i.exec(valore)?.[1] ?? null) : null
  if (!token || !SUPABASE_URL || !ANON_KEY) return null
  const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await supa.auth.getUser(token)
  return error || !data?.user ? null : data.user.id
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

interface RispostaGoogle {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function chiediAGoogle(parametri: Record<string, string>): Promise<RispostaGoogle> {
  const risposta = await fetch(ENDPOINT_TOKEN_GOOGLE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...parametri, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  })
  return (await risposta.json()) as RispostaGoogle
}

// Il codice di Google diventa un token di un'ora e, la prima volta, il
// refresh token. Esportata per i test.
export function leggiScambio(r: RispostaGoogle): { token: string; refresh: string | null; secondi: number } | { errore: string } {
  if (r.error || !r.access_token) return { errore: r.error_description || r.error || 'Google non ha risposto.' }
  return { token: r.access_token, refresh: r.refresh_token ?? null, secondi: r.expires_in ?? 3600 }
}

// Cosa fare della risposta di Google al rinnovo. `invalid_grant` vuol dire
// che il permesso non c'è più (tolto dall'utente, o scaduto perché non usato
// per sei mesi): il refresh token va buttato, e si ricollega.
export function leggiRinnovo(r: RispostaGoogle): { token: string; secondi: number } | { revocato: true } | { errore: string } {
  if (r.access_token) return { token: r.access_token, secondi: r.expires_in ?? 3600 }
  if (r.error === 'invalid_grant') return { revocato: true }
  return { errore: r.error || 'Google non ha risposto.' }
}

async function auth(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' })
  const origine = origineRichiesta(req.headers)
  const origin = primo(req.headers?.origin)
  if (!origine || (origin && origin !== origine)) return res.status(403).json({ error: 'Origine non consentita.' })
  const utente = await utenteLoggato(req)
  if (!utente) return res.status(401).json({ error: 'Accedi a Ciak per collegare Google Drive.' })
  const corpo = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { stato?: unknown; ritorno?: unknown } | null
  if (!statoClienteValido(corpo?.stato)) return res.status(400).json({ error: 'Richiesta non riconosciuta.' })
  const stato = firmaStato(
    { u: utente, c: corpo.stato, r: percorsoSicuro(corpo?.ritorno), o: origine, e: Date.now() + DURATA_STATO_MS },
    CLIENT_SECRET,
  )
  res.status(200).json({ url: urlConsensoServer(CLIENT_ID, origine, stato) })
}

async function callback(req: Req, res: Res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non consentito.' })
  const dati = verificaStato(primo(req.query?.state), CLIENT_SECRET, Date.now())
  // Senza uno state nostro non si sa dove tornare: si dice e basta.
  if (!dati) return res.status(400).json({ error: 'Risposta di Google non riconosciuta: riprova a collegare Drive da Ciak.' })
  const rimanda = (esito: Parameters<typeof indirizzoRitorno>[1]) => {
    res.setHeader('Location', indirizzoRitorno(dati, esito))
    res.status(302)
    res.end()
  }
  const errore = primo(req.query?.error)
  if (errore) return rimanda({ errore })
  const codice = primo(req.query?.code)
  if (!codice) return rimanda({ errore: 'Google non ha mandato il codice.' })
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return rimanda({ errore: 'Il server di Ciak non può tenere il permesso (manca SUPABASE_SERVICE_ROLE_KEY).' })

  let esito: ReturnType<typeof leggiScambio>
  try {
    esito = leggiScambio(await chiediAGoogle({ code: codice, redirect_uri: dati.o + PERCORSO_CALLBACK, grant_type: 'authorization_code' }))
  } catch {
    esito = { errore: 'Google non risponde: riprova fra poco.' }
  }
  if ('errore' in esito) return rimanda(esito)
  if (!esito.refresh) return rimanda({ errore: 'Google non ha dato il permesso permanente: riprova a collegare Drive.' })

  const { error } = await admin()
    .from('drive_tokens')
    .upsert({ user_id: dati.u, refresh_token: esito.refresh, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) return rimanda({ errore: `Il permesso non si è potuto salvare: ${error.message}` })
  rimanda({ token: esito.token, secondi: esito.secondi })
}

async function token(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ error: 'Metodo non consentito.' })
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Il rinnovo automatico di Drive non è configurato lato server.' })
  const utente = await utenteLoggato(req)
  if (!utente) return res.status(401).json({ error: 'Accedi a Ciak per usare Google Drive.' })
  const db = admin()

  if (req.method === 'DELETE') {
    const { error } = await db.from('drive_tokens').delete().eq('user_id', utente)
    if (error) return res.status(500).json({ error: `Il permesso non si è potuto togliere: ${error.message}` })
    return res.status(200).json({ ok: true })
  }

  const { data, error } = await db.from('drive_tokens').select('refresh_token').eq('user_id', utente).maybeSingle()
  if (error) return res.status(500).json({ error: `Il permesso non si è potuto leggere: ${error.message}` })
  if (!data?.refresh_token) return res.status(404).json({ error: 'Google Drive non è collegato con il permesso permanente.' })

  let esito: ReturnType<typeof leggiRinnovo>
  try {
    esito = leggiRinnovo(await chiediAGoogle({ refresh_token: data.refresh_token, grant_type: 'refresh_token' }))
  } catch {
    esito = { errore: 'Google non risponde: riprova fra poco.' }
  }
  if ('revocato' in esito) {
    await db.from('drive_tokens').delete().eq('user_id', utente)
    return res.status(404).json({ error: 'Il permesso di Google non c’è più: ricollega Google Drive.' })
  }
  if ('errore' in esito) return res.status(502).json({ error: esito.errore })
  res.status(200).json({ access_token: esito.token, expires_in: esito.secondi })
}

export default async function handler(req: Req, res: Res) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(503).json({ error: 'Il rinnovo automatico di Drive non è configurato (manca GOOGLE_CLIENT_SECRET lato server).' })
    return
  }
  const azione = azioneRichiesta(req.query)
  if (azione === 'auth') return auth(req, res)
  if (azione === 'callback') return callback(req, res)
  if (azione === 'token') return token(req, res)
  res.status(400).json({ error: 'Azione non riconosciuta.' })
}
