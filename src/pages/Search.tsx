import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import {
  searchMulti,
  searchPerson,
  searchCompany,
  searchCollection,
  getGenres,
  getAnime,
  getCartoons,
  getTrending,
  resolveStudios,
  resolveSagas,
  resolvePeople,
  profileUrl,
  logoUrl,
  posterUrl,
  isTmdbConfigured,
} from '../lib/tmdb'
import { MediaRow } from '../components/MediaRow'
import type {
  MediaItem,
  Person,
  Company,
  Collection,
  Genre,
  TmdbType,
} from '../lib/types'

type Mode = 'titles' | 'anime' | 'cartoons' | 'people' | 'studios' | 'collections'
type TypeFilter = 'all' | TmdbType

const MODES: { value: Mode; label: string; icon: string; placeholder?: string }[] = [
  { value: 'titles', label: 'Titoli', icon: '🎬', placeholder: 'Cerca un film o una serie… (IT o EN)' },
  { value: 'anime', label: 'Anime', icon: '⛩️' },
  { value: 'cartoons', label: 'Cartoni', icon: '🎨' },
  { value: 'people', label: 'Persone', icon: '🌟', placeholder: 'Cerca attore, regista, compositore…' },
  { value: 'studios', label: 'Studi', icon: '🏛️', placeholder: 'Cerca uno studio… (es. Pixar, A24, Ghibli)' },
  { value: 'collections', label: 'Saghe', icon: '📚', placeholder: 'Cerca una saga… (es. Harry Potter, Marvel)' },
]

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie TV' },
]

// People role filter — maps to TMDB known_for_department.
const ROLES: { value: string; label: string; dept: string | null }[] = [
  { value: 'all', label: 'Tutti', dept: null },
  { value: 'acting', label: 'Attori', dept: 'Acting' },
  { value: 'directing', label: 'Registi', dept: 'Directing' },
  { value: 'composing', label: 'Compositori', dept: 'Sound' },
  { value: 'writing', label: 'Sceneggiatori', dept: 'Writing' },
]

const ROLE_LABEL: Record<string, string> = {
  Acting: 'Attore',
  Directing: 'Regista',
  Sound: 'Compositore',
  Writing: 'Sceneggiatore',
  Production: 'Produttore',
  Camera: 'Direttore della fotografia',
}

// Curated lists resolved to real TMDB entities for the idle "famous" previews.
const FAMOUS_STUDIOS = ['Pixar', 'Studio Ghibli', 'A24', 'Marvel Studios', 'Warner Bros. Pictures', 'DreamWorks Animation', 'Universal Pictures', 'Walt Disney Pictures', 'Lucasfilm', 'Columbia Pictures']
const FAMOUS_SAGAS = ['Harry Potter', 'Star Wars', 'The Lord of the Rings', 'The Avengers', 'Jurassic Park', 'Fast & Furious', 'James Bond', 'Pirates of the Caribbean', 'The Dark Knight', 'Toy Story']
const FAMOUS_ACTORS = ['Al Pacino', 'Robert De Niro', 'Meryl Streep', 'Leonardo DiCaprio', 'Tom Hanks', 'Denzel Washington', 'Anthony Hopkins', 'Morgan Freeman', 'Cate Blanchett', 'Joaquin Phoenix', 'Christian Bale', 'Daniel Day-Lewis', 'Natalie Portman', 'Gary Oldman', 'Brad Pitt']

function PersonCard({ p }: { p: Person }) {
  const photo = profileUrl(p.profilePath)
  return (
    <Link
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
      <p className="line-clamp-1 text-xs text-projector/70">
        {p.department ? ROLE_LABEL[p.department] ?? p.department : ''}
      </p>
      {p.knownFor && <p className="line-clamp-1 text-xs text-zinc-500">{p.knownFor}</p>}
    </Link>
  )
}

function StudioCard({ c }: { c: Company }) {
  const logo = logoUrl(c.logoPath)
  return (
    <Link
      to={`/studio/${c.id}`}
      className="group flex h-32 flex-col items-center justify-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900 p-4 text-center transition hover:-translate-y-1 hover:border-projector/40"
    >
      {logo ? (
        <img src={logo} alt={c.name} loading="lazy" className="max-h-14 max-w-[80%] rounded bg-white/90 px-3 py-2" />
      ) : (
        <span className="text-4xl opacity-40">🏛️</span>
      )}
      <p className="line-clamp-1 text-sm font-medium text-zinc-200">{c.name}</p>
    </Link>
  )
}

function CollectionCard({ c }: { c: Collection }) {
  const poster = posterUrl(c.posterPath)
  return (
    <Link
      to={`/collection/${c.id}`}
      className="group overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
        {poster ? (
          <img src={poster} alt={c.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-30">📚</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-zinc-100">{c.name}</h3>
      </div>
    </Link>
  )
}

// Paginated browse list for anime / cartoons.
function BrowseList({
  fetcher,
}: {
  fetcher: (page: number) => Promise<{ items: MediaItem[]; totalPages: number }>
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setItems([])
    setPage(1)
    fetcher(1)
      .then(({ items: it, totalPages: tp }) => {
        setItems(it)
        setTotalPages(tp)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetcher])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    try {
      const { items: it } = await fetcher(next)
      setItems((prev) => [...prev, ...it])
      setPage(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <Loader label="Carico il catalogo…" />
  if (error) return <ErrorState title="Catalogo non disponibile" message={error} />
  if (items.length === 0) return <EmptyState title="Nessun titolo" message="Riprova più tardi." />

  return (
    <>
      <MediaGrid items={items} />
      {page < totalPages && (
        <div className="mt-8 flex justify-center">
          <button onClick={loadMore} disabled={loadingMore} className="btn-primary">
            {loadingMore ? 'Carico…' : 'Carica altri'}
          </button>
        </div>
      )}
    </>
  )
}

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
  const [collections, setCollections] = useState<Collection[]>([])

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [minRating, setMinRating] = useState(0)
  const [role, setRole] = useState('all')

  const [genreType, setGenreType] = useState<TmdbType>('movie')
  const [genres, setGenres] = useState<Genre[]>([])

  // Idle previews
  const [previewTitles, setPreviewTitles] = useState<MediaItem[]>([])
  const [famousActors, setFamousActors] = useState<Person[]>([])
  const [famousStudios, setFamousStudios] = useState<Company[]>([])
  const [famousSagas, setFamousSagas] = useState<Collection[]>([])

  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0]
  const usesSearch = mode === 'titles' || mode === 'people' || mode === 'studios' || mode === 'collections'

  useEffect(() => {
    if (!usesSearch || !query.trim()) {
      setTitles([]); setPeople([]); setStudios([]); setCollections([])
      return
    }
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per cercare nel catalogo.')
      return
    }
    setLoading(true)
    setError(null)
    const run =
      mode === 'people' ? searchPerson(query).then(setPeople)
      : mode === 'studios' ? searchCompany(query).then(setStudios)
      : mode === 'collections' ? searchCollection(query).then(setCollections)
      : searchMulti(query).then(setTitles)
    run.catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [query, mode, usesSearch])

  useEffect(() => {
    if (mode !== 'titles' || !isTmdbConfigured) return
    getGenres(genreType).then(setGenres).catch(() => setGenres([]))
  }, [genreType, mode])

  // Idle previews — loaded lazily only for the active tab, once.
  useEffect(() => {
    if (!isTmdbConfigured || query.trim()) return
    if (mode === 'titles' && previewTitles.length === 0) {
      getTrending().then(setPreviewTitles).catch(() => {})
    }
    if (mode === 'people' && famousActors.length === 0) {
      resolvePeople(FAMOUS_ACTORS).then(setFamousActors).catch(() => {})
    }
    if (mode === 'studios' && famousStudios.length === 0) {
      resolveStudios(FAMOUS_STUDIOS).then(setFamousStudios).catch(() => {})
    }
    if (mode === 'collections' && famousSagas.length === 0) {
      resolveSagas(FAMOUS_SAGAS).then(setFamousSagas).catch(() => {})
    }
  }, [mode, query])

  const filteredTitles = useMemo(
    () =>
      titles.filter((r) => {
        if (typeFilter !== 'all' && r.mediaType !== typeFilter) return false
        if (r.voteAverage < minRating) return false
        return true
      }),
    [titles, typeFilter, minRating],
  )

  const filteredPeople = useMemo(() => {
    const dept = ROLES.find((r) => r.value === role)?.dept
    if (!dept) return people
    return people.filter((p) => p.department === dept)
  }, [people, role])

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

  // Clear the field and return to the idle preview state.
  function clearSearch() {
    setInput('')
    const next = new URLSearchParams(params)
    next.delete('q')
    setParams(next)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogo"
        title="Cerca & Esplora"
        subtitle="Titoli, anime, cartoni, persone, studi e saghe — tutto in un posto."
      />

      {/* Mode selector */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-theatre-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => switchMode(m.value)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
              mode === m.value
                ? 'border-projector text-projector'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Search bar — only for search-based modes */}
      {usesSearch && (
        <form onSubmit={onSubmit} className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <input
              value={input}
              onChange={(e) => {
                const v = e.target.value
                setInput(v)
                // Emptying the field resets to the idle preview state.
                if (v === '' && query) {
                  const next = new URLSearchParams(params)
                  next.delete('q')
                  setParams(next)
                }
              }}
              placeholder={activeMode.placeholder}
              className="input-cine w-full pr-10"
              autoFocus
            />
            {input && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Pulisci ricerca"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-lg text-zinc-500 transition hover:text-zinc-200"
              >
                ✕
              </button>
            )}
          </div>
          <button type="submit" className="btn-primary whitespace-nowrap">
            🔍 Cerca
          </button>
        </form>
      )}

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
              type="range" min={0} max={9} step={1} value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="accent-projector"
            />
            <span className="w-8 text-sm font-semibold text-projector">
              {minRating > 0 ? `${minRating}+` : '—'}
            </span>
          </div>
        </div>
      )}

      {/* People-mode role filter */}
      {mode === 'people' && query.trim() && people.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Ruolo</span>
          {ROLES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRole(r.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                role === r.value
                  ? 'bg-projector text-theatre-950'
                  : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Browse modes (no search) ── */}
      {mode === 'anime' && <BrowseList fetcher={getAnime} />}
      {mode === 'cartoons' && <BrowseList fetcher={getCartoons} />}

      {/* ── Search modes ── */}
      {usesSearch && (
        loading ? (
          <Loader label="Sfoglio la pellicola…" />
        ) : error ? (
          <ErrorState title="Ricerca non riuscita" message={error} />
        ) : !query.trim() ? (
          mode === 'titles' ? (
            <div className="space-y-10">
              {previewTitles.length > 0 && (
                <div>
                  <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                    🔥 Di tendenza ora
                  </h2>
                  <MediaRow items={previewTitles} />
                </div>
              )}
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
            </div>
          ) : mode === 'people' ? (
            <div>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                🌟 Attori celebri
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {famousActors.map((p) => <PersonCard key={p.id} p={p} />)}
              </div>
            </div>
          ) : mode === 'studios' ? (
            <div>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                🏛️ Studi celebri
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {famousStudios.map((c) => <StudioCard key={c.id} c={c} />)}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                📚 Saghe celebri
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {famousSagas.map((c) => <CollectionCard key={c.id} c={c} />)}
              </div>
            </div>
          )
        ) : mode === 'titles' ? (
          filteredTitles.length === 0 ? (
            <EmptyState title="Nessun risultato" message={`Nessun titolo per "${query}" con i filtri attuali.`} />
          ) : (
            <MediaGrid items={filteredTitles} />
          )
        ) : mode === 'people' ? (
          filteredPeople.length === 0 ? (
            <EmptyState title="Nessuna persona trovata" message={`Nessun risultato per "${query}" in questo ruolo.`} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredPeople.map((p) => <PersonCard key={p.id} p={p} />)}
            </div>
          )
        ) : mode === 'studios' ? (
          studios.length === 0 ? (
            <EmptyState title="Nessuno studio trovato" message={`Nessun risultato per "${query}".`} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {studios.map((c) => <StudioCard key={c.id} c={c} />)}
            </div>
          )
        ) : (
          // collections
          collections.length === 0 ? (
            <EmptyState title="Nessuna saga trovata" message={`Nessun risultato per "${query}".`} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {collections.map((c) => <CollectionCard key={c.id} c={c} />)}
            </div>
          )
        )
      )}
    </div>
  )
}
