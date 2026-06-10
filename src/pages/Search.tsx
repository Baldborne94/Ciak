import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { isTmdbConfigured, searchMulti } from '../lib/tmdb'
import type { MediaItem, TmdbType } from '../lib/types'

type TypeFilter = 'all' | TmdbType

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie TV' },
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''

  const [input, setInput] = useState(query)
  const [results, setResults] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [minRating, setMinRating] = useState(0)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per cercare nel catalogo.')
      return
    }
    setLoading(true)
    setError(null)
    searchMulti(query)
      .then(setResults)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [query])

  const filtered = useMemo(
    () =>
      results.filter((r) => {
        if (typeFilter !== 'all' && r.mediaType !== typeFilter) return false
        if (r.voteAverage < minRating) return false
        return true
      }),
    [results, typeFilter, minRating],
  )

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = new URLSearchParams(params)
    if (input.trim()) next.set('q', input.trim())
    else next.delete('q')
    setParams(next)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogo"
        title="Cerca un titolo"
        subtitle="Film, serie TV, anime e cartoni — sempre aggiornati da TMDB."
      />

      <form onSubmit={onSubmit} className="mb-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Cerca per titolo, attore, regista…"
          className="input-cine"
          autoFocus
        />
        <button type="submit" className="btn-primary whitespace-nowrap">
          🔍 Cerca
        </button>
      </form>

      {/* Combinable filters */}
      <div className="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            Tipo
          </span>
          <div className="flex gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  typeFilter === f.value
                    ? 'bg-projector text-theatre-950'
                    : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            Voto minimo
          </span>
          <input
            type="range"
            min={0}
            max={9}
            step={1}
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
            className="accent-projector"
          />
          <span className="w-8 text-sm font-semibold text-projector">
            {minRating > 0 ? `${minRating}+` : '—'}
          </span>
        </div>
      </div>

      {loading ? (
        <Loader label="Sfoglio la pellicola…" />
      ) : error ? (
        <ErrorState title="Ricerca non riuscita" message={error} />
      ) : !query.trim() ? (
        <EmptyState
          title="Inizia una ricerca"
          message="Digita il titolo di un film o di una serie per esplorare il catalogo."
          icon="🎞️"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nessun risultato"
          message={`Nessun titolo trovato per "${query}" con i filtri attuali.`}
        />
      ) : (
        <MediaGrid items={filtered} />
      )}
    </div>
  )
}
