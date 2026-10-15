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
  signOut: () => Promise<void>
  // La password dell'account: scelta o cambiata da dentro (Impostazioni), o
  // dal link che arriva per email («Password dimenticata?»).
  cambiaPassword: (password: string) => Promise<string | null>
  inviaReimpostazione: (email: string) => Promise<string | null>
  // Si è appena entrati dal link dell'email: va scelta la password nuova.
  recuperoPassword: boolean
  fineRecuperoPassword: () => void
  // Perché Supabase ha rifiutato l'ultimo link d'accesso, già in italiano.
  erroreAccesso: string | null
  chiudiErroreAccesso: () => void
}

// L'indirizzo con cui Supabase rimanda indietro dal link dell'email, letto una
// volta per caricamento della pagina e non dentro un componente: StrictMode
// monta tutto due volte, e la seconda lettura troverebbe l'indirizzo già
// ripulito.
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
  const [recuperoPassword, setRecuperoPassword] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((evento, next) => {
      setSession(next)
      // Il link di «Password dimenticata?»: Supabase fa entrare e lo dice con
      // questo evento. Senza chiedere subito la password nuova, si resterebbe
      // dentro senza saperla, e alla prossima uscita di nuovo fuori.
      if (evento === 'PASSWORD_RECOVERY') setRecuperoPassword(true)
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
      async cambiaPassword(password) {
        if (!supabase) return 'Supabase non è configurato.'
        const { error } = await supabase.auth.updateUser({ password })
        return error?.message ?? null
      },
      async inviaReimpostazione(email) {
        if (!supabase) return 'Supabase non è configurato.'
        // Si torna alla radice del sito, l'indirizzo che Supabase accetta già:
        // un percorso nuovo andrebbe aggiunto a mano fra i Redirect URLs, e
        // senza Supabase rimanderebbe comunque alla radice.
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        return error?.message ?? null
      },
      recuperoPassword,
      fineRecuperoPassword: () => setRecuperoPassword(false),
      async signOut() {
        if (!supabase) return
        await supabase.auth.signOut()
      },
      erroreAccesso,
      chiudiErroreAccesso: () => setErroreAccesso(null),
    }),
    [session, loading, erroreAccesso, recuperoPassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>.')
  return ctx
}
