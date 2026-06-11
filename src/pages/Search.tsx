import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import {
  searchMulti,
  searchPerson,
  searchCompany,
  getGenres,
  profileUrl,
  logoUrl,
  isTmdbConfigured,
} from '../lib/tmdb'
import type {
  MediaItem,
  Person,
  Company,
  Genre,
  TmdbType,
} from '../lib/types'

type Mode = 'titles' | 'actors' | 'studios'
type TypeFilter = 'all' | TmdbType

const MODES: { value: Mode; label: string; icon: string; placeholder: string }[] = [
  { value: 'titles', label: 'Titoli', icon: '🎬', placeholder: 'Cerca un film o una serie… (IT o EN)' },
  { value: 'actors', label: 'Attori', icon: '🌟', placeholder: 'Cerca un attore o regista… (es. Al Pacino)' },
  { value: 'studios', label: 'Studi', icon: '🏛️', placeholder: 'Cerca uno studio… (es. Pixar, A24, Ghibli)' },
]

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie TV' },
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const mode = (params.get('mode') as Mode) || 'titles'

  const [input, setInput] = useState(query)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [titles, setTitles] = useState<MediaItem[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [studios, setStudios] = useState<Company[]>([])

  // Title-mode filters
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [minRating, setMinRating] = useState(0)

  // Genre chips shown when browsing without a query (titles mode)
  const [genreType, setGenreType] = useState<TmdbType>('movie')
  const [genres, setGenres] = useState<Genre[]>([])

  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0]

  // Run search when query/mode changes
  useEffect(() => {
    if (!query.trim()) {
      setTitles([])
      setPeople([])
      setStudios([])
      return
    }
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per cercare nel catalogo.')
      return
    }
    setLoading(true)
    setError(null)
    const run =
      mode === 'actors'
        ? searchPerson(query).then(setPeople)
        : mode === 'studios'
          ? searchCompany(query).then(setStudios)
          : searchMulti(query).then(setTitles)
    run.catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [query, mode])

  // Load genres for the browse-by-genre default (titles mode, no query)
  useEffect(() => {
    if (mode !== 'titles' || !isTmdbConfigured) return
    getGenres(genreType).then(setGenres).catch(() => setGenres([]))
  }, [genreType, mode])

  const filteredTitles = useMemo(
    () =>
      titles.filter((r) => {
        if (typeFilter !== 'all' && r.mediaType !== typeFilter) return false
        if (r.voteAverage < minRating) return false
        return true
      }),
    [titles, typeFilter, minRating],
  )

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = new URLSearchParams(params)
    if (input.trim()) next.set('q', input.trim())
    else next.delete('q')
    next.set('mode', mode)
    setParams(next)
  }

  function switchMode(m: Mode) {
    const next = new URLSearchParams(params)
    next.set('mode', m)
    setParams(next)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogo"
        title="Cerca & Esplora"
        subtitle="Trova un titolo, sfoglia per genere, o scopri attori e studi di produzione."
      />

      {/* Mode selector */}
      <div className="mb-4 flex gap-2 border-b border-theatre-800">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => switchMode(m.value)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition ${
              mode === m.value
                ? 'border-projector text-projector'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <form onSubmit={onSubmit} className="mb-6 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeMode.placeholder}
          className="input-cine"
          autoFocus
        />
        <button type="submit" className="btn-primary whitespace-nowrap">
          🔍 Cerca
        </button>
      </form>

      {/* Title-mode filters */}
      {mode === 'titles' && query.trim() && (
        <div className="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Tipo</span>
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
            <span className="text-xs uppercase tracking-wider text-zinc-500">Voto minimo</span>
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
      )}

      {/* Results */}
      {loading ? (
        <Loader label="Sfoglio la pellicola…" />
      ) : error ? (
        <ErrorState title="Ricerca non riuscita" message={error} />
      ) : !query.trim() ? (
        // Idle state: browse by genre (titles) or a hint (people/studios)
        mode === 'titles' ? (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="font-display text-xl tracking-wide text-zinc-100">
                🎭 Sfoglia per genere
              </span>
              <div className="ml-auto flex gap-1">
                {(['movie', 'tv'] as TmdbType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setGenreType(t)}
                    className={`rounded-md px-3 py-1.5 text-sm transition ${
                      genreType === t
                        ? 'bg-projector text-theatre-950'
                        : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
                    }`}
                  >
                    {t === 'movie' ? 'Film' : 'Serie TV'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {genres.map((g) => (
                <Link
                  key={g.id}
                  to={`/genre/${genreType}/${g.id}`}
                  className="rounded-xl border border-theatre-700 bg-theatre-900/60 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:-translate-y-0.5 hover:border-projector/40 hover:text-projector"
                >
                  {g.name}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title={mode === 'actors' ? 'Cerca una persona' : 'Cerca uno studio'}
            message={
              mode === 'actors'
                ? 'Digita il nome di un attore o regista per vedere la sua filmografia.'
                : 'Digita il nome di uno studio per vedere i suoi film.'
            }
            icon={mode === 'actors' ? '🌟' : '🏛️'}
          />
        )
      ) : mode === 'titles' ? (
        filteredTitles.length === 0 ? (
          <EmptyState
            title="Nessun risultato"
            message={`Nessun titolo per "${query}" con i filtri attuali.`}
          />
        ) : (
          <MediaGrid items={filteredTitles} />
        )
      ) : mode === 'actors' ? (
        people.length === 0 ? (
          <EmptyState title="Nessuna persona trovata" message={`Nessun risultato per "${query}".`} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {people.map((p) => {
              const photo = profileUrl(p.profilePath)
              return (
                <Link
                  key={p.id}
                  to={`/person/${p.id}`}
                  className="group rounded-xl border border-theatre-800 bg-theatre-900 p-3 text-center transition hover:-translate-y-1 hover:border-projector/40"
                >
                  <div className="mx-auto aspect-square w-full overflow-hidden rounded-full border border-theatre-700 bg-theatre-800">
                    {photo ? (
                      <img src={photo} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">👤</div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm font-semibold text-zinc-100">{p.name}</p>
                  {p.knownFor && <p className="line-clamp-1 text-xs text-zinc-500">{p.knownFor}</p>}
                </Link>
              )
            })}
          </div>
        )
      ) : studios.length === 0 ? (
        <EmptyState title="Nessuno studio trovato" message={`Nessun risultato per "${query}".`} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {studios.map((c) => {
            const logo = logoUrl(c.logoPath)
            return (
              <Link
                key={c.id}
                to={`/studio/${c.id}`}
                className="group flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-theatre-800 bg-theatre-900 p-4 text-center transition hover:-translate-y-1 hover:border-projector/40"
              >
                {logo ? (
                  <img src={logo} alt={c.name} loading="lazy" className="max-h-12 max-w-full bg-white/90 px-2 py-1" />
                ) : (
                  <span className="text-3xl opacity-40">🏛️</span>
                )}
                <p className="line-clamp-1 text-sm font-medium text-zinc-200">{c.name}</p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
