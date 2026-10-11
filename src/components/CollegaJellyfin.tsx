import { useState, type FormEvent } from 'react'
import { collegaJellyfin } from '../lib/jellyfin'

// Il collegamento al server di casa (Jellyfin sul PC col disco dei film).
// Utente e password si scrivono una volta per dispositivo: Ciak tiene solo il
// token che Jellyfin gli dà.

interface Props {
  onCollegato: () => void
  onAnnulla?: () => void
}

export default function CollegaJellyfin({ onCollegato, onAnnulla }: Props) {
  const [indirizzo, setIndirizzo] = useState('')
  const [utente, setUtente] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  async function invia(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setInvio(true)
    try {
      await collegaJellyfin(indirizzo, utente, password)
      onCollegato()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Collegamento non riuscito.')
    } finally {
      setInvio(false)
    }
  }

  return (
    <form onSubmit={invia} aria-label="Collega il server di casa" className="mx-auto flex max-w-sm flex-col gap-3 text-left">
      <label className="flex flex-col gap-1 text-sm text-zinc-300">
        Indirizzo del server
        <input
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          required
          value={indirizzo}
          onChange={(e) => setIndirizzo(e.target.value)}
          placeholder="https://pc-di-casa.tuarete.ts.net"
          className="input-cine w-full"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-300">
        Utente di Jellyfin
        <input type="text" autoCapitalize="off" autoComplete="username" required value={utente} onChange={(e) => setUtente(e.target.value)} className="input-cine w-full" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-300">
        Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-cine w-full" />
      </label>
      {errore && (
        <p role="alert" className="text-sm text-red-300">
          {errore}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={invio} className="btn-primary flex-1">
          {invio ? 'Collego…' : '🏠 Collega il server di casa'}
        </button>
        {onAnnulla && (
          <button type="button" onClick={onAnnulla} className="btn-ghost">
            Annulla
          </button>
        )}
      </div>
    </form>
  )
}
