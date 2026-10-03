// Il collegamento a Drive che non scade, passo 2: Google torna qui col codice.
// Lo si scambia col client secret per un refresh token, che resta in Supabase
// (tabella drive_tokens, solo per il server), e si rimanda il browser alla
// pagina da cui era partito col primo token di un'ora nel frammento — la
// stessa forma del vecchio consenso, che il browser sa già leggere.
import { createClient } from '@supabase/supabase-js'
import { ENDPOINT_TOKEN_GOOGLE, PERCORSO_CALLBACK, indirizzoRitorno, verificaStato } from '../src/lib/driveStato'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID ?? ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
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

interface RispostaToken {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

// Il codice di Google diventa un token di un'ora e, la prima volta, il
// refresh token. Esportata per i test.
export function leggiScambio(r: RispostaToken): { token: string; refresh: string | null; secondi: number } | { errore: string } {
  if (r.error || !r.access_token) return { errore: r.error_description || r.error || 'Google non ha risposto.' }
  return { token: r.access_token, refresh: r.refresh_token ?? null, secondi: r.expires_in ?? 3600 }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Metodo non consentito.' })
    return
  }
  const dati = verificaStato(primo(req.query?.state), CLIENT_SECRET, Date.now())
  if (!dati) {
    // Senza uno state nostro non si sa dove tornare: si dice e basta.
    res.status(400).json({ error: 'Risposta di Google non riconosciuta: riprova a collegare Drive da Ciak.' })
    return
  }
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
    const risposta = await fetch(ENDPOINT_TOKEN_GOOGLE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codice,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: dati.o + PERCORSO_CALLBACK,
        grant_type: 'authorization_code',
      }),
    })
    esito = leggiScambio((await risposta.json()) as RispostaToken)
  } catch {
    esito = { errore: 'Google non risponde: riprova fra poco.' }
  }
  if ('errore' in esito) return rimanda(esito)
  if (!esito.refresh) return rimanda({ errore: 'Google non ha dato il permesso permanente: riprova a collegare Drive.' })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { error } = await admin
    .from('drive_tokens')
    .upsert({ user_id: dati.u, refresh_token: esito.refresh, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) return rimanda({ errore: `Il permesso non si è potuto salvare: ${error.message}` })
  rimanda({ token: esito.token, secondi: esito.secondi })
}
