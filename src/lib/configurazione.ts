// Le chiavi pubbliche dell'app: Supabase (indirizzo e chiave anon), VAPID per
// le notifiche, il tetto quotidiano dell'AI.
//
// Su Vercel stanno dentro il bundle, scritte alla build (VITE_…). Sul NAS le
// scrive il server in index.html (`window.__CIAK__`, vedi server/ciak.ts):
// l'immagine Docker è la stessa per ogni NAS, e cambiare una chiave vuol dire
// riavviare il container, non ricostruire l'app. Lì Supabase sta sulla stessa
// origine dell'app (il server lo inoltra), quindi l'indirizzo è quello della
// pagina.

export interface ConfigurazioneCiak {
  supabaseUrl?: string
  supabaseAnonKey?: string
  vapidPublicKey?: string
  aiDailyLimit?: number
}

declare global {
  interface Window {
    __CIAK__?: ConfigurazioneCiak
  }
}

export interface Configurazione {
  supabaseUrl: string | undefined
  supabaseAnonKey: string | undefined
  vapidPublicKey: string | undefined
  aiDailyLimit: number
}

interface EnvVite {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  VITE_VAPID_PUBLIC_KEY?: string
  VITE_AI_DAILY_LIMIT?: string
}

export function leggiConfigurazione(
  dalServer: ConfigurazioneCiak | undefined,
  env: EnvVite,
  origine: string | undefined,
): Configurazione {
  // Quella del server vale solo se porta la chiave: senza, è un NAS ancora da
  // configurare, e mescolarla con le chiavi della build darebbe un indirizzo
  // con la chiave di un altro database.
  if (dalServer?.supabaseAnonKey) {
    return {
      supabaseUrl: dalServer.supabaseUrl || origine,
      supabaseAnonKey: dalServer.supabaseAnonKey,
      vapidPublicKey: dalServer.vapidPublicKey ?? env.VITE_VAPID_PUBLIC_KEY,
      aiDailyLimit: dalServer.aiDailyLimit ?? Number(env.VITE_AI_DAILY_LIMIT ?? '3'),
    }
  }
  return {
    supabaseUrl: env.VITE_SUPABASE_URL,
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
    vapidPublicKey: dalServer?.vapidPublicKey ?? env.VITE_VAPID_PUBLIC_KEY,
    aiDailyLimit: dalServer?.aiDailyLimit ?? Number(env.VITE_AI_DAILY_LIMIT ?? '3'),
  }
}

export const configurazione = leggiConfigurazione(
  typeof window !== 'undefined' ? window.__CIAK__ : undefined,
  import.meta.env as EnvVite,
  typeof location !== 'undefined' ? location.origin : undefined,
)
