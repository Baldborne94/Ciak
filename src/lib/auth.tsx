import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/auth-js'
import { isSupabaseConfigured, supabase } from './supabase'
import { leggiErroreAccesso, spiegaErroreAccesso } from './erroreAccesso'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  signInWithPassword: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signInWithGoogle: () => Promise<string | null>
  signOut: () => Promise<void>
  // Perché Supabase ha rifiutato l'ultimo accesso con Google, già in italiano.
  erroreAccesso: string | null
  chiudiErroreAccesso: () => void
}

// L'indirizzo con cui Supabase rimanda indietro da Google, letto una volta per
// caricamento della pagina e non dentro un componente: StrictMode monta tutto
// due volte, e la seconda lettura troverebbe l'indirizzo già ripulito.
function leggiErroreAllAvvio(): string | null {
  if (typeof window === 'undefined') return null
  const errore = leggiErroreAccesso(window.location.href)
  if (!errore) return null
  // Tolto dall'indirizzo, così ricaricando la pagina l'avviso non torna.
  window.history.replaceState(window.history.state, '', window.location.pathname)
  return spiegaErroreAccesso(errore)
}
const erroreAllAvvio = leggiErroreAllAvvio()

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [erroreAccesso, setErroreAccesso] = useState(erroreAllAvvio)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured: isSupabaseConfigured,
      async signInWithPassword(email, password) {
        if (!supabase) return 'Supabase non è configurato.'
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
      },
      async signUp(email, password) {
        if (!supabase) return 'Supabase non è configurato.'
        const { error } = await supabase.auth.signUp({ email, password })
        return error?.message ?? null
      },
      async signInWithGoogle() {
        if (!supabase) return 'Supabase non è configurato.'
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        })
        return error?.message ?? null
      },
      async signOut() {
        if (!supabase) return
        await supabase.auth.signOut()
      },
      erroreAccesso,
      chiudiErroreAccesso: () => setErroreAccesso(null),
    }),
    [session, loading, erroreAccesso],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>.')
  return ctx
}
