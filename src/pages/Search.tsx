import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation, useNavigationType } from 'react-router-dom'
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
  getPervertitoAnime,
  getCartoons,
  getTrending,
  resolveStudios,
  resolveSagaIds,
  resolvePeople,
  profileUrl,
  logoUrl,
  posterUrl,
  isTmdbConfigured,
} from '../lib/tmdb'
import { MediaRow } from '../components/MediaRow'
import { FilterBar, FilterGroup, ChipGroup, RatingSlider, filterSelectClass } from '../components/FilterBar'
import { LANGUAGES, YEARS } from '../lib/filters'
import type {
  MediaItem,
  Person,
  Company,
  Collection,
  Genre,
  TmdbType,
} from '../lib/types'
import { getPageState, setPageState } from '../lib/pageStateCache'
import { usePersistedState } from '../lib/usePersistedState'

// Gli strumenti AI (Canzone, Foto) vivono ora nell'hub "/ai"; qui Cerca fa
// solo ricerca nel catalogo: titoli, persone, studi, saghe.
type Mode = 'titles' | 'people' | 'studios' | 'collections'
// "Kind" filter inside the Titoli tab: real media types + the derived
// animation catalogs (anime / cartoons), so they live under Titoli instead of
// taking their own top-level tabs.
type Kind = 'all' | 'movie' | 'tv' | 'anime' | 'cartoons'

const MODES: { value: Mode; label: string; icon: string; placeholder?: string }[] = [
  { value: 'titles', label: 'Titoli', icon: '🎬', placeholder: 'Cerca un film, una serie, un anime… (IT o EN)' },
  { value: 'people', label: 'Persone', icon: '🌟', placeholder: 'Cerca attore, regista, compositore…' },
  { value: 'studios', label: 'Studi', icon: '🏛️', placeholder: 'Cerca uno studio… (es. Pixar, A24, Ghibli)' },
  { value: 'collections', label: 'Saghe', icon: '📚', placeholder: 'Cerca una saga… (es. Harry Potter, Marvel)' },
]

const KIND_FILTERS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie TV' },
  { value: 'anime', label: '⛩️ Anime' },
  { value: 'cartoons', label: '🎨 Cartoni' },
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
// TMDB collection IDs (reliable: name search can match "making of" docs).
// Harry Potter 1241 · Star Wars 10 · LOTR 119 · Avengers 86311 · Jurassic 328
// Fast&Furious 9485 · James Bond 645 · Pirates 295 · Dark Knight 263 · Toy Story 10194
const FAMOUS_SAGAS = [1241, 10, 119, 86311, 328, 9485, 645, 295, 263, 10194]
const FAMOUS_ACTORS = ['Al Pacino', 'Robert De Niro', 'Meryl Streep', 'Leonardo DiCaprio', 'Tom Hanks', 'Denzel Washington', 'Anthony Hopkins', 'Morgan Freeman', 'Cate Blanchett', 'Joaquin Phoenix', 'Christian Bale', 'Daniel Day-Lewis', 'Natalie Portman', 'Gary Oldman', 'Brad Pitt']

// Filter title search results down to anime (Japanese animation) or
// cartoons (non-Japanese animation) using genre + original language.
function filterKind(kind: 'anime' | 'cartoons', items: MediaItem[]): MediaItem[] {
  const isAnimation = (i: MediaItem) => i.genreIds.includes(16)
  if (kind === 'anime') return items.filter((i) => isAnimation(i) && i.originalLanguage === 'ja')
  return items.filter((i) => isAnimation(i) && i.originalLanguage !== 'ja')
}

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

interface BrowseListCache { items: MediaItem[]; page: number; totalPages: number }

// Paginated browse list for anime / cartoons.
function BrowseList({
  fetcher,
  cacheKey,
  filterFn,
}: {
  fetcher: (page: number) => Promise<{ items: MediaItem[]; totalPages: number }>
  cacheKey: string
  filterFn?: (items: MediaItem[]) => MediaItem[]
}) {
  const location = useLocation()
  const navType = useNavigationType()
  const fullKey = `${location.key}:${cacheKey}`
  const cached = navType === 'POP' ? getPageState<BrowseListCache>(fullKey) : undefined
  const restoredFromCache = useRef(!!cached)

  const [items, setItems] = useState<MediaItem[]>(cached?.items ?? [])
  const [page, setPage] = useState(cached?.page ?? 1)
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1)
  const [loading, setLoading] = useState(!cached)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (items.length === 0) return
    setPageState<BrowseListCache>(fullKey, { items, page, totalPages })
  }, [fullKey, items, page, totalPages])

  useEffect(() => {
    if (restoredFromCache.current) {
      restoredFromCache.current = false
      return
    }
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

  const visible = filterFn ? filterFn(items) : items

  return (
    <>
      {visible.length === 0
        ? <EmptyState title="Nessun titolo" message="Nessun risultato con i filtri attuali." />
        : <MediaGrid items={visible} />
      }
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

interface SearchCache {
  titles: MediaItem[]
  people: Person[]
  studios: Company[]
  collections: Collection[]
}

export default function Search() {
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const rawMode = params.get('mode')
  // Old links used mode=anime / mode=cartoons; those now live under Titoli.
  const mode: Mode = MODES.some((m) => m.value === rawMode) ? (rawMode as Mode) : 'titles'

  // Vecchi link agli strumenti AI (un tempo schede di Cerca) → hub /ai.
  useEffect(() => {
    if (rawMode === 'song') navigate('/ai?tab=song', { replace: true })
    else if (rawMode === 'image') navigate('/ai?tab=image', { replace: true })
  }, [rawMode, navigate])

  // Restore search results from cache on back navigation so items are
  // immediately available for ScrollManager to restore the scroll position.
  const cached = navType === 'POP' ? getPageState<SearchCache>(location.key) : undefined
  const restoredFromCache = useRef(!!cached)

  const [input, setInput] = useState(query)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [titles, setTitles] = useState<MediaItem[]>(cached?.titles ?? [])
  const [people, setPeople] = useState<Person[]>(cached?.people ?? [])
  const [studios, setStudios] = useState<Company[]>(cached?.studios ?? [])
  const [collections, setCollections] = useState<Collection[]>(cached?.collections ?? [])

  const [kind, setKind] = useState<Kind>(
    rawMode === 'anime' || rawMode === 'cartoons' ? rawMode : 'all',
  )
  const [minRating, setMinRating] = useState(0)
  const [titleYear, setTitleYear] = useState('')
  const [titleLang, setTitleLang] = useState('')
  const [sortBy, setSortBy] = useState<'relevance' | 'date_desc' | 'date_asc' | 'rating_desc'>('relevance')
  const [role, setRole] = useState('all')

  const [genres, setGenres] = useState<Genre[]>([])
  // Genre to browse anime/cartoons by (null = all). TV genres, minus Animation.
  const [tvGenres, setTvGenres] = useState<Genre[]>([])
  const [browseGenre, setBrowseGenre] = useState<number | null>(null)
  // Recent search terms (persisted), shown as quick chips when the field is empty.
  const [recentSearches, setRecentSearches] = usePersistedState<string[]>('ciak.search.recents', [])

  // Idle previews
  const [previewTitles, setPreviewTitles] = useState<MediaItem[]>([])
  const [famousActors, setFamousActors] = useState<Person[]>([])
  const [famousStudios, setFamousStudios] = useState<Company[]>([])
  const [famousSagas, setFamousSagas] = useState<Collection[]>([])

  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0]
  const isAnimationKind = kind === 'anime' || kind === 'cartoons'
  // "Sfoglia per genere" follows the Tipo selector (no separate Film/Serie toggle):
  // Serie TV → tv genres, everything else (Tutti/Film) → movie genres.
  const genreBrowseType: TmdbType = kind === 'tv' ? 'tv' : 'movie'

  // Debounced auto-search: update URL params 400ms after the user stops typing.
  useEffect(() => {
    const trimmed = input.trim()
    if (trimmed === query) return // no actual change
    const timer = setTimeout(() => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (trimmed) next.set('q', trimmed)
        else next.delete('q')
        return next
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [input, query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Remember committed searches (most recent first, deduped, capped at 8).
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    setRecentSearches((prev) => [q, ...prev.filter((t) => t.toLowerCase() !== q.toLowerCase())].slice(0, 8))
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist search results to cache whenever they change.
  useEffect(() => {
    if (!titles.length && !people.length && !studios.length && !collections.length) return
    setPageState<SearchCache>(location.key, { titles, people, studios, collections })
  }, [location.key, titles, people, studios, collections])

  useEffect(() => {
    // Skip the initial fetch when we just restored results from cache.
    if (restoredFromCache.current) {
      restoredFromCache.current = false
      return
    }
    if (!query.trim()) {
      setTitles([]); setPeople([]); setStudios([]); setCollections([])
      return
    }
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per cercare nel catalogo.')
      return
    }
    setLoading(true)
    setError(null)
    // Flag di cancellazione: digitando in fretta più richieste partono in
    // parallelo; senza questo, una risposta lenta di una query vecchia potrebbe
    // sovrascrivere i risultati di quella corrente.
    let cancelled = false
    const run =
      mode === 'people' ? searchPerson(query).then((r) => { if (!cancelled) setPeople(r) })
      : mode === 'studios' ? searchCompany(query).then((r) => { if (!cancelled) setStudios(r) })
      : mode === 'collections' ? searchCollection(query).then((r) => { if (!cancelled) setCollections(r) })
      // Titoli (anche anime/cartoni): cerca per nome; il filtro "kind" è applicato lato client.
      : searchMulti(query).then((r) => { if (!cancelled) setTitles(r) })
    run
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, mode])

  useEffect(() => {
    if (mode !== 'titles' || isAnimationKind || !isTmdbConfigured) return
    getGenres(genreBrowseType).then(setGenres).catch(() => setGenres([]))
  }, [genreBrowseType, isAnimationKind, mode])

  // TV genres for the anime/cartoons "Sfoglia per genere" row (Animation implied).
  useEffect(() => {
    if (!isAnimationKind || !isTmdbConfigured || tvGenres.length > 0) return
    getGenres('tv').then((gs) => setTvGenres(gs.filter((g) => g.id !== 16))).catch(() => {})
  }, [isAnimationKind, tvGenres.length])

  // Reset the chosen anime/cartoon genre when leaving that browse mode.
  useEffect(() => { if (!isAnimationKind) setBrowseGenre(null) }, [isAnimationKind])

  // Fetchers that carry the selected genre; memoized so BrowseList only refetches
  // when the genre actually changes.
  const animeFetcher = useCallback(
    (page: number) => getAnime(page, browseGenre ?? undefined),
    [browseGenre],
  )
  const cartoonFetcher = useCallback(
    (page: number) => getCartoons(page, browseGenre ?? undefined),
    [browseGenre],
  )

  // Genre chips for the anime/cartoons browse (filter the list in place).
  const animeGenreChips = (
    <div className="mb-6 flex flex-wrap gap-2">
      <button
        onClick={() => setBrowseGenre(null)}
        className={`rounded-md px-3 py-1.5 text-sm transition ${
          browseGenre === null ? 'bg-projector text-theatre-950' : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
        }`}
      >
        Tutti
      </button>
      {tvGenres.map((g) => (
        <button
          key={g.id}
          onClick={() => setBrowseGenre(g.id)}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            browseGenre === g.id ? 'bg-projector text-theatre-950' : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
          }`}
        >
          {g.name}
        </button>
      ))}
    </div>
  )

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
      resolveSagaIds(FAMOUS_SAGAS).then(setFamousSagas).catch(() => {})
    }
  }, [mode, query, previewTitles.length, famousActors.length, famousStudios.length, famousSagas.length])

  // Trending row respects the Tipo filter (Film / Serie TV).
  const trendingPreview = useMemo(
    () =>
      kind === 'movie' || kind === 'tv'
        ? previewTitles.filter((i) => i.mediaType === kind)
        : previewTitles,
    [previewTitles, kind],
  )

  // Shared filter + sort logic — applied to both search results and idle previews.
  function applyFilters(items: MediaItem[]): MediaItem[] {
    const list = items.filter((r) => {
      if ((kind === 'movie' || kind === 'tv') && r.mediaType !== kind) return false
      if (r.voteAverage < minRating) return false
      if (titleYear && r.releaseDate?.slice(0, 4) !== titleYear) return false
      if (titleLang && r.originalLanguage !== titleLang) return false
      return true
    })
    // Sort: relevance keeps the API order; date/rating sort explicitly (no-date last).
    const byDate = (a: MediaItem, b: MediaItem, dir: 'asc' | 'desc') => {
      if (!a.releaseDate && !b.releaseDate) return 0
      if (!a.releaseDate) return 1
      if (!b.releaseDate) return -1
      return dir === 'asc'
        ? a.releaseDate.localeCompare(b.releaseDate)
        : b.releaseDate.localeCompare(a.releaseDate)
    }
    if (sortBy === 'date_desc') return [...list].sort((a, b) => byDate(a, b, 'desc'))
    if (sortBy === 'date_asc') return [...list].sort((a, b) => byDate(a, b, 'asc'))
    if (sortBy === 'rating_desc') return [...list].sort((a, b) => b.voteAverage - a.voteAverage)
    return list
  }

  const filteredTitles = useMemo(() => {
    const base = isAnimationKind ? filterKind(kind as 'anime' | 'cartoons', titles) : titles
    return applyFilters(base)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titles, kind, isAnimationKind, minRating, titleYear, titleLang, sortBy])

  const filteredTrending = useMemo(
    () => applyFilters(trendingPreview),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trendingPreview, kind, minRating, titleYear, titleLang, sortBy],
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

  // Re-run a saved recent search immediately.
  function runRecent(term: string) {
    setInput(term)
    const next = new URLSearchParams(params)
    next.set('q', term)
    setParams(next)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogo"
        title="Cerca & Esplora"
        subtitle="Titoli, anime, cartoni, persone, studi e saghe."
      />

      {/* Mode selector — catalog/entity tabs */}
      <div className="mb-4 flex items-stretch gap-1 overflow-x-auto border-b border-theatre-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      {/* Search bar */}
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
        <button type="submit" className="btn-ghost whitespace-nowrap px-4">
          🔍
        </button>
      </form>

      {/* Recent searches — quick chips when the field is empty */}
      {!query.trim() && recentSearches.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Ricerche recenti</span>
          {recentSearches.map((term) => (
            <button
              key={term}
              onClick={() => runRecent(term)}
              className="rounded-full border border-theatre-700 bg-theatre-900/60 px-3 py-1 text-sm text-zinc-300 transition hover:border-projector/40 hover:text-projector"
            >
              {term}
            </button>
          ))}
          <button
            onClick={() => setRecentSearches([])}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ✕ Cancella
          </button>
        </div>
      )}

      {/* Title-mode filters. Tipo is always available (also lets you switch to
          Anime/Cartoni browse); the refinement filters only show when there's
          something to filter — an active search, or the anime/cartoons lists —
          so the idle "Di tendenza" view stays clean. */}
      {mode === 'titles' && (
        <FilterBar>
          <FilterGroup label="Tipo">
            <ChipGroup options={KIND_FILTERS} value={kind} onChange={setKind} />
          </FilterGroup>
          {(query.trim() !== '' || isAnimationKind) && (
            <>
              <RatingSlider value={minRating} onChange={setMinRating} />
              <select
                value={titleYear}
                onChange={(e) => setTitleYear(e.target.value)}
                className={filterSelectClass}
              >
                <option value="">Anno: qualsiasi</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={titleLang}
                onChange={(e) => setTitleLang(e.target.value)}
                className={filterSelectClass}
              >
                <option value="">Lingua: qualsiasi</option>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className={filterSelectClass}
              >
                <option value="relevance">Ordina: popolarità</option>
                <option value="date_desc">Più recenti</option>
                <option value="date_asc">Più vecchi</option>
                <option value="rating_desc">Voto più alto</option>
              </select>
              {(minRating > 0 || titleYear || titleLang || sortBy !== 'relevance') && (
                <button
                  onClick={() => { setMinRating(0); setTitleYear(''); setTitleLang(''); setSortBy('relevance') }}
                  className="text-sm text-projector/80 hover:text-projector"
                >
                  ✕ Azzera
                </button>
              )}
            </>
          )}
        </FilterBar>
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

      {/* ── Search modes (titoli, persone, studi, saghe) ── */}
      {loading ? (
        <Loader label="Sfoglio la pellicola…" />
      ) : error ? (
        <ErrorState title="Ricerca non riuscita" message={error} />
      ) : !query.trim() ? (
        mode === 'titles' ? (
          isAnimationKind ? (
            // Anime / Cartoni: browse by genre (chips filter the list in place).
            <div className="space-y-12">
              <div>
                <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                  🎭 Sfoglia per genere
                </h2>
                {animeGenreChips}
                {kind === 'anime' ? (
                  <BrowseList fetcher={animeFetcher} cacheKey={`anime:${browseGenre ?? 'all'}`} filterFn={applyFilters} />
                ) : (
                  <BrowseList fetcher={cartoonFetcher} cacheKey={`cartoons:${browseGenre ?? 'all'}`} filterFn={applyFilters} />
                )}
              </div>
              {kind === 'anime' && (
                <div>
                  <h2 className="mb-1 font-display text-2xl tracking-wide text-zinc-100">
                    😏 Pervertito
                  </h2>
                  <p className="mb-4 text-sm text-zinc-500">
                    Ecchi, fan-service, harem e hentai: tutto ciò che è «sus», nel suo angolo.
                  </p>
                  <BrowseList fetcher={getPervertitoAnime} cacheKey="anime-pervertito" filterFn={applyFilters} />
                </div>
              )}
            </div>
          ) : (
          <div className="space-y-10">
            {filteredTrending.length > 0 && (
              <div>
                <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                  🔥 Di tendenza ora
                  {kind === 'movie' ? ' · Film' : kind === 'tv' ? ' · Serie TV' : ''}
                </h2>
                <MediaRow items={filteredTrending} />
              </div>
            )}
            <div>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                🎭 Sfoglia per genere
                <span className="ml-2 text-sm font-normal text-zinc-500">
                  {genreBrowseType === 'tv' ? 'Serie TV' : 'Film'}
                </span>
              </h2>
              <div className="flex flex-wrap gap-3">
                {genres.map((g) => (
                  <Link
                    key={g.id}
                    to={`/genre/${genreBrowseType}/${g.id}`}
                    className="rounded-xl border border-theatre-700 bg-theatre-900/60 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:-translate-y-0.5 hover:border-projector/40 hover:text-projector"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          )
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
      )}
    </div>
  )
}
