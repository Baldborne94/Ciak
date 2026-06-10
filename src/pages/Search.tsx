import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { searchMulti } from '@/lib/tmdb'
import PageHeader from '@/components/PageHeader'
import TitleGrid from '@/components/TitleGrid'
import Spinner from '@/components/Spinner'
import EmptyState from '@/components/EmptyState'

type TypeFilter = 'all' | 'movie' | 'tv'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Tutto' },
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie TV' },
]

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const [input, setInput] = useState(initialQuery)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  // Sincronizza l'input quando arriva un ?q= dalla navbar.
  useEffect(() => {
    setInput(initialQuery)
  }, [initialQuery])

  const query = searchParams.get('q') ?? ''

  const { data, isLoading, isError, error, isFetched } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchMulti(query),
    enabled: query.trim().length > 0,
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = input.trim()
    if (q) setSearchParams({ q })
  }

  const results =
    data?.results.filter((r) => typeFilter === 'all' || r.media_type === typeFilter) ?? []

  return (
    <div>
      <PageHeader
        eyebrow="Catalogo globale"
        title="Cerca nel buio della sala"
        subtitle="Film, serie TV, anime e cartoni. Cerca per titolo e affina con i filtri."
      />

      <form onSubmit={onSubmit} className="mb-6 flex flex-wrap items-center gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Titolo del film o della serie…"
          autoFocus
          className="min-w-[16rem] flex-1 rounded-lg border border-cinema-border bg-cinema-panel/60
            px-4 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:border-gold/60
            focus:outline-none focus:ring-1 focus:ring-gold/40"
        />
        <button type="submit" className="btn-gold">
          Cerca
        </button>
      </form>

      {/* Filtri tipo */}
      <div className="mb-8 flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setTypeFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              typeFilter === f.value
                ? 'bg-gold text-cinema-black'
                : 'border border-cinema-border text-zinc-400 hover:border-gold/50 hover:text-gold'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-zinc-600">
          Filtri avanzati (genere, anno, paese, rating) in arrivo nella Fase 7
        </span>
      </div>

      {!query && (
        <EmptyState
          icon="🔍"
          title="Inizia la ricerca"
          message="Scrivi il titolo di un film o di una serie per esplorare il catalogo TMDB."
        />
      )}

      {isLoading && <Spinner label="Cerco tra i titoli…" />}

      {isError && (
        <EmptyState
          icon="🎬"
          title="Ricerca fallita"
          message={error instanceof Error ? error.message : 'Errore TMDB.'}
        />
      )}

      {query && isFetched && results.length === 0 && !isLoading && (
        <EmptyState
          icon="🍿"
          title="Nessun risultato"
          message={`Nessun titolo trovato per "${query}". Prova con un altro termine.`}
        />
      )}

      {results.length > 0 && <TitleGrid titles={results} />}
    </div>
  )
}
