import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// We don't throw at import time so the app still boots without credentials —
// the relevant screens surface a themed error instead.
export const isSupabaseConfigured = Boolean(url && anonKey)

// Il client di Supabase montato a mano, con i soli due pezzi che Ciak usa: il
// login (auth-js) e le tabelle (postgrest-js). `createClient` porta con sé
// anche realtime, storage e functions, che il costruttore crea sempre e che
// quindi nessun bundler può togliere: circa un terzo del pacchetto più pesante
// del primo caricamento, per funzioni mai chiamate.
//
// Ciò che conta è identico a `createClient` (supabase-js 2.108, SupabaseClient):
// la chiave della sessione `sb-<progetto>-auth-token` (diversa, chi è già
// entrato si ritroverebbe fuori), le intestazioni, e il token della sessione
// su ogni richiesta alle tabelle, rinnovato da auth-js quando scade. Il resto
// di quel costruttore (realtime, storage) qui non serve.
export function creaClient(supabaseUrl: string, chiave: string) {
  const base = new URL(supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`)
  const auth = new AuthClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${chiave}`, apikey: chiave },
    storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  })

  const conToken: typeof fetch = async (input, init) => {
    const { data } = await auth.getSession()
    const headers = new Headers(init?.headers)
    if (!headers.has('apikey')) headers.set('apikey', chiave)
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${data.session?.access_token ?? chiave}`)
    return fetch(input, { ...init, headers })
  }
  const rest = new PostgrestClient(new URL('rest/v1', base).href, { fetch: conToken })

  return {
    auth,
    from: rest.from.bind(rest),
    rpc: rest.rpc.bind(rest),
  }
}

export const supabase = isSupabaseConfigured ? creaClient(url, anonKey) : null
