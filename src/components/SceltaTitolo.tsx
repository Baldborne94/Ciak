import { useState, type ReactNode } from 'react'
import { altriTitoli, posterUrl, searchMulti } from '../lib/tmdb'
import { logFailure } from '../lib/logFailure'
import type { MediaItem } from '../lib/types'

// La ricerca di un titolo su TMDB per abbinarlo a mano: dal lettore per un
// file, dalla videoteca per una serie o un film intero. Accanto al titolo
// italiano anche quello inglese e l'originale, che sono i nomi dei file.
export default function SceltaTitolo({
  ricercaIniziale,
  onScegli,
  children,
}: {
  ricercaIniziale: string
  onScegli: (item: MediaItem) => Promise<void> | void
  // Campi in più sotto la ricerca (stagione ed episodio, nel lettore).
  children?: ReactNode
}) {
  const [ricerca, setRicerca] = useState(ricercaIniziale)
  const [risultati, setRisultati] = useState<MediaItem[] | null>(null)
  const [cercando, setCercando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  async function cerca() {
    setCercando(true)
    try {
      setRisultati((await searchMulti(ricerca)).slice(0, 8))
    } catch (e) {
      logFailure('Ricerca del titolo per il film di Drive')(e)
      setRisultati([])
    } finally {
      setCercando(false)
    }
  }

  async function scegli(item: MediaItem) {
    setSalvando(true)
    try {
      await onScegli(item)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-3 text-sm">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void cerca()
        }}
      >
        <label className="sr-only" htmlFor="cerca-titolo-drive">
          Titolo da cercare
        </label>
        <input
          id="cerca-titolo-drive"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-theatre-700 bg-theatre-950 px-3 py-1.5 text-zinc-100"
        />
        <button type="submit" disabled={cercando} className="btn-primary px-3 py-1.5">
          {cercando ? 'Cerco…' : 'Cerca'}
        </button>
      </form>
      {children}
      {risultati && risultati.length === 0 && <p className="text-zinc-400">Nessun risultato.</p>}
      {risultati && risultati.length > 0 && (
        <ul className="divide-y divide-theatre-800">
          {risultati.map((r) => (
            <li key={`${r.mediaType}-${r.id}`}>
              <button
                type="button"
                disabled={salvando}
                onClick={() => void scegli(r)}
                className="flex w-full items-center gap-3 py-2 text-left hover:bg-theatre-800/60 disabled:opacity-60"
              >
                {r.posterPath ? (
                  <img src={posterUrl(r.posterPath, 'w185') ?? undefined} alt="" className="h-12 w-8 rounded object-cover" />
                ) : (
                  <span className="h-12 w-8 rounded bg-theatre-800" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-zinc-100">{r.title}</span>
                  {altriTitoli(r).length > 0 && <span className="block truncate text-sm text-zinc-300">{altriTitoli(r).join(' · ')}</span>}
                  <span className="block text-xs text-zinc-500">
                    {r.mediaType === 'tv' ? 'Serie' : 'Film'}
                    {r.releaseDate ? ` · ${r.releaseDate.slice(0, 4)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
