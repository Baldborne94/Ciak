// Il collegamento a Drive che non scade, passo 1: l'indirizzo del consenso di
// Google per chi è loggato in Ciak. Il browser ci va, Google torna su
// api/drive-callback con un codice, e da lì in poi il permesso lo rinnova
// il server (api/drive-token). Senza GOOGLE_CLIENT_SECRET risponde 503 e il
// browser torna al vecchio giro (il token di un'ora, rinnovato con un redirect).
//
// La guardia dell'utente è inline, come negli altri endpoint (vedi
// api/identify.ts): i moduli condivisi dentro api/ non finivano nel deploy.
import { createClient } from '@supabase/supabase-js'
import { DURATA_STATO_MS, firmaStato, origineRichiesta, percorsoSicuro, statoClienteValido, urlConsensoServer } from '../src/lib/driveStato'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

interface Req {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
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

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo non consentito. Usa POST.' })
    return
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(503).json({ error: 'Il rinnovo automatico di Drive non è configurato (manca GOOGLE_CLIENT_SECRET lato server).' })
    return
  }
  const origine = origineRichiesta(req.headers)
  const origin = primo(req.headers?.origin)
  if (!origine || (origin && origin !== origine)) {
    res.status(403).json({ error: 'Origine non consentita.' })
    return
  }
  const utente = await utenteLoggato(req)
  if (!utente) {
    res.status(401).json({ error: 'Accedi a Ciak per collegare Google Drive.' })
    return
  }
  const corpo = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { stato?: unknown; ritorno?: unknown } | null
  if (!statoClienteValido(corpo?.stato)) {
    res.status(400).json({ error: 'Richiesta non riconosciuta.' })
    return
  }
  const stato = firmaStato(
    { u: utente, c: corpo.stato, r: percorsoSicuro(corpo?.ritorno), o: origine, e: Date.now() + DURATA_STATO_MS },
    CLIENT_SECRET,
  )
  res.status(200).json({ url: urlConsensoServer(CLIENT_ID, origine, stato) })
}
