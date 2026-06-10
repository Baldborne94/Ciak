import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Avviso esplicito in dev: senza queste variabili l'app non parla col DB.
  console.warn(
    '[CineVault] Variabili Supabase mancanti. Compila VITE_SUPABASE_URL e ' +
      'VITE_SUPABASE_ANON_KEY nel file .env (vedi .env.example).',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
