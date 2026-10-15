import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { ErrorState } from '../components/States'
import { useAuth } from '../lib/auth'

type Mode = 'signin' | 'signup'

export default function Login() {
  const { signInWithPassword, signUp, inviaReimpostazione, configured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (!configured) {
    return (
      <ErrorState
        title="Supabase non configurato"
        message="Imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nel file .env per abilitare l'accesso e le liste personali."
        icon="🔌"
      />
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)

    const err =
      mode === 'signin'
        ? await signInWithPassword(email, password)
        : await signUp(email, password)

    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    if (mode === 'signup') {
      setInfo('Account creato! Se è richiesta la conferma via email, controlla la casella, poi accedi.')
      setMode('signin')
      return
    }
    navigate(from, { replace: true })
  }

  // L'accesso è solo con email e password: chi non la ricorda (o non l'ha mai
  // scelta, perché entrava con Google) se ne fa mandare una nuova per email.
  // Supabase manda un link che fa entrare; lì si sceglie la password
  // (RecuperoPassword, in ogni pagina).
  async function passwordDimenticata() {
    setError(null)
    setInfo(null)
    if (!email) return setError('Scrivi la tua email qui sopra, poi premi di nuovo «Password dimenticata?».')
    setBusy(true)
    const err = await inviaReimpostazione(email)
    setBusy(false)
    if (err) return setError(`Email non inviata: ${err}`)
    setInfo(`Ti ho mandato un'email a ${email}: apri il link e scegli la password nuova. Se non arriva, guarda nello spam.`)
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow="Il tuo posto in sala"
        title={mode === 'signin' ? 'Accedi' : 'Registrati'}
        subtitle="Salva le tue liste, i preferiti e i voti personali."
      />

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-theatre-800 bg-theatre-900/60 p-6">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@esempio.com"
            className="input-cine"
            autoComplete="email"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input-cine"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-curtain-dark/20 px-3 py-2 text-sm text-curtain-light">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-lg bg-projector/15 px-3 py-2 text-sm text-projector">
            {info}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? '🎟️ Accedi' : '✨ Crea account'}
        </button>

        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => void passwordDimenticata()}
            className="w-full text-center text-sm text-zinc-400 transition hover:text-projector"
            disabled={busy}
          >
            Password dimenticata?
          </button>
        )}
      </form>

      <p className="mt-4 text-center text-sm text-zinc-400">
        {mode === 'signin' ? 'Non hai un account?' : 'Hai già un account?'}{' '}
        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setInfo(null)
          }}
          className="text-projector hover:underline"
        >
          {mode === 'signin' ? 'Registrati' : 'Accedi'}
        </button>
      </p>
    </div>
  )
}
