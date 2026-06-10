import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { ErrorState } from '../components/States'
import { useAuth } from '../lib/auth'

type Mode = 'signin' | 'signup'

export default function Login() {
  const { signInWithPassword, signUp, signInWithGoogle, configured } = useAuth()
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

  async function onGoogle() {
    setBusy(true)
    setError(null)
    const err = await signInWithGoogle()
    setBusy(false)
    if (err) setError(err)
    // On success the browser is redirected by Supabase.
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

        <div className="flex items-center gap-3 text-xs text-zinc-600">
          <span className="h-px flex-1 bg-theatre-700" />
          oppure
          <span className="h-px flex-1 bg-theatre-700" />
        </div>

        <button type="button" onClick={onGoogle} className="btn-ghost w-full" disabled={busy}>
          Continua con Google
        </button>
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
