// L'avvio del server di Ciak nel container del NAS (vedi nas/LEGGIMI.md).
// Legge le impostazioni dall'ambiente, prepara quelle che le funzioni di api/
// si aspettano da Vercel, e programma il controllo quotidiano delle uscite.

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { creaServer, msAllaProssima, type Funzione } from './ciak'

const env = process.env
const porta = Number(env.PORTA ?? env.PORT ?? 3000)

// Le funzioni parlano a Supabase passando da questo stesso server, che lo
// inoltra: dentro il container l'indirizzo pubblico (quello di Tailscale) non
// si raggiunge. Vanno impostate PRIMA di caricarle: le leggono all'avvio.
const interno = `http://127.0.0.1:${porta}`
env.SUPABASE_URL ||= interno
env.VITE_SUPABASE_URL ||= interno
env.VITE_SUPABASE_ANON_KEY ||= env.ANON_KEY ?? ''
env.SUPABASE_SERVICE_ROLE_KEY ||= env.SERVICE_ROLE_KEY ?? ''

const qui = dirname(fileURLToPath(import.meta.url))
const cartella = resolve(env.CARTELLA_APP ?? resolve(qui, '../dist'))

const { funzioni } = (await import('./funzioni')) as { funzioni: Record<string, Funzione> }

const chiaviApi = [env.VITE_SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY].filter((k): k is string => !!k)

const server = creaServer({
  cartella,
  funzioni,
  supabase: {
    auth: env.SUPABASE_AUTH_URL ?? 'http://auth:9999',
    rest: env.SUPABASE_REST_URL ?? 'http://rest:3000',
  },
  chiaviApi,
  configurazione: {
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || undefined,
    vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY || undefined,
    aiDailyLimit: env.AI_DAILY_LIMIT ? Number(env.AI_DAILY_LIMIT) : undefined,
  },
})

server.listen(porta, () => console.log(`Ciak in ascolto sulla porta ${porta} (app da ${cartella})`))

// Il controllo delle uscite che su Vercel faceva il cron, alle 9 UTC.
// Chiama la funzione come la chiamava Vercel, con CRON_SECRET.
function controllaUscite() {
  if (!env.CRON_SECRET) return console.log('CRON_SECRET non impostato: niente controllo quotidiano delle uscite.')
  fetch(`${interno}/api/check-releases`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })
    .then(async (r) => console.log(`Controllo delle uscite: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`))
    .catch((e) => console.error('Controllo delle uscite fallito:', e))
}
function programma() {
  setTimeout(() => {
    controllaUscite()
    programma()
  }, msAllaProssima(new Date(), 9))
}
programma()

// Docker ferma il container con SIGTERM: si chiude subito, senza aspettare.
for (const segnale of ['SIGTERM', 'SIGINT'] as const) {
  process.on(segnale, () => server.close(() => process.exit(0)).closeAllConnections())
}
