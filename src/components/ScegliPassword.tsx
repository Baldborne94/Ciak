import { useState } from 'react'

// Il minimo di Supabase: una password più corta la rifiuta con un errore in
// inglese, meglio dirlo prima.
const MINIMO = 6

// Scegliere la password dell'account: due volte, perché sbagliarla scrivendo
// vuol dire restare fuori al prossimo accesso. `onSalva` torna l'errore di
// Supabase, o null.
export default function ScegliPassword({
  etichetta = 'Salva la password',
  onSalva,
  onFatto,
}: {
  etichetta?: string
  onSalva: (password: string) => Promise<string | null>
  onFatto?: () => void
}) {
  const [password, setPassword] = useState('')
  const [ripetuta, setRipetuta] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [fatto, setFatto] = useState(false)

  async function salva(e: React.FormEvent) {
    e.preventDefault()
    setFatto(false)
    if (password.length < MINIMO) return setErrore(`Almeno ${MINIMO} caratteri.`)
    if (password !== ripetuta) return setErrore('Le due password non sono uguali.')
    setErrore(null)
    setSalvando(true)
    const problema = await onSalva(password)
    setSalvando(false)
    if (problema) return setErrore(`Password non salvata: ${problema}`)
    setPassword('')
    setRipetuta('')
    setFatto(true)
    onFatto?.()
  }

  return (
    <form onSubmit={salva} className="space-y-3" noValidate>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Nuova password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-cine"
          autoComplete="new-password"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">Ripetila</span>
        <input
          type="password"
          value={ripetuta}
          onChange={(e) => setRipetuta(e.target.value)}
          className="input-cine"
          autoComplete="new-password"
        />
      </label>
      {errore && (
        <p role="alert" className="rounded-lg bg-curtain-dark/20 px-3 py-2 text-sm text-curtain-light">
          {errore}
        </p>
      )}
      {fatto && (
        <p role="status" className="rounded-lg bg-projector/15 px-3 py-2 text-sm text-projector">
          ✓ Password salvata: d’ora in poi entri con la tua email e questa password.
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={salvando}>
        {salvando ? 'Salvo…' : etichetta}
      </button>
    </form>
  )
}
