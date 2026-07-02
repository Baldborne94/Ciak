import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link, useLocation, useNavigationType } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { discoverByGenre, getGenres, isTmdbConfigured } from '../lib/tmdb'
import { LANGUAGES, COUNTRIES, YEARS } from '../lib/filters'
import { getPageState, setPageState } from '../lib/pageStateCache'
import type { MediaItem, TmdbType } from '../lib/types'

const SORTS: { value: string; label: string }[] = [
  { value: 'popularity.desc', label: 'Più popolari' },
  { value: 'vote_average.desc', label: 'Più votati' },
  { value: 'primary_release_date.desc', label: 'Più recenti' },
  { value: 'revenue.desc', label: 'Maggiori incassi' },
]

const selectClass = 'input-cine w-auto py-2 text-sm'

interface GenrePageCache {
  items: MediaItem[]
  page: number
  totalPages: number
  sort: string
  year: string
  language: string
  country: string
}

export default function GenrePage() {
  const { type, genreId } = useParams<{ type: TmdbType; genreId: string }>()
  const location = useLocation()
  const navType = useNavigationType()

  // Restore from cache when navigating back, so items are immediately available
  // for ScrollManager to restore the scroll position without a fresh API fetch.
  const cached = navType === 'POP' ? getPageState<GenrePageCache>(location.key) : undefined

  const [items, setItems] = useState<MediaItem[]>(cached?.items ?? [])
  const [genreName, setGenreName] = useState('')
  const [sort, setSort] = useState(cached?.sort ?? 'popularity.desc')
  const [year, setYear] = useState(cached?.year ?? '')
  const [language, setLanguage] = useState(cached?.language ?? '')
  const [country, setCountry] = useState(cached?.country ?? '')
  const [page, setPage] = useState(cached?.page ?? 1)
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1)
  const [loading, setLoading] = useState(!cached)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // True only for the very first render cycle when we restored from cache.
  // After that, filter changes must trigger fresh API calls.
  const restoredFromCache = useRef(!!cached)

  const t = (type ?? 'movie') as TmdbType
  const gid = Number(genreId)
  const filters = { year, language, country }

  // Persist state to cache whenever it changes so a subsequent POP can restore it.
  useEffect(() => {
    if (items.length === 0) return
    setPageState<GenrePageCache>(location.key, { items, page, totalPages, sort, year, language, country })
  }, [location.key, items, page, totalPages, sort, year, language, country])

  useEffect(() => {
    if (!isTmdbConfigured || !genreId) return
    getGenres(t)
      .then((genres) => setGenreName(genres.find((g) => g.id === gid)?.name ?? ''))
      .catch(() => setGenreName(''))
  }, [t, gid, genreId])

  const load = useCallback(() => {
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per esplorare il catalogo.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setItems([])
    setPage(1)
    discoverByGenre(t, gid, 1, sort, { year, language, country })
      .then(({ items: newItems, totalPages: tp }) => {
        setItems(newItems)
        setTotalPages(tp)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [t, gid, sort, year, language, country])

  useEffect(() => {
    // Skip the very first fetch when we restored from cache (back navigation).
    // Subsequent calls (filter changes) must still go through.
    if (restoredFromCache.current) {
      restoredFromCache.current = false
      return
    }
    load()
  }, [load])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    try {
      const { items: newItems } = await discoverByGenre(t, gid, next, sort, filters)
      setItems((prev) => [...prev, ...newItems])
      setPage(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  const hasFilters = year || language || country

  return (
    <div>
      <PageHeader
        eyebrow={t === 'tv' ? 'Serie TV per genere' : 'Film per genere'}
        title={genreName || 'Genere'}
        subtitle="Sfoglia i titoli e affina con i filtri avanzati."
      >
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </PageHeader>

      {/* Advanced filters */}
      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
        <span className="text-xs uppercase tracking-wider text-zinc-500">Filtri</span>
        <select value={year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
          <option value="">Anno: qualsiasi</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={selectClass}>
          <option value="">Lingua: qualsiasi</option>
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectClass}>
          <option value="">Paese: qualsiasi</option>
          {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setYear(''); setLanguage(''); setCountry('') }}
            className="text-sm text-projector/80 hover:text-projector"
          >
            ✕ Azzera
          </button>
        )}
      </div>

      {loading ? (
        <Loader label="Sfoglio il catalogo…" />
      ) : error ? (
        <ErrorState title="Catalogo non disponibile" message={error} />
      ) : items.length === 0 ? (
        <EmptyState title="Nessun titolo" message="Prova a togliere qualche filtro o cambiare ordinamento." />
      ) : (
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
      )}

      <Link to="/search" className="mt-8 inline-block text-sm text-projector/80 hover:text-projector">
        ← Torna alla ricerca
      </Link>
    </div>
  )
}
