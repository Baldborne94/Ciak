import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link, useLocation, useNavigationType } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { discoverByGenre, getGenres, resolveKeywordIds } from '../lib/tmdb'
import { subgenresFor } from '../lib/subgenres'
import { LANGUAGES, COUNTRIES, YEARS } from '../lib/filters'
import { getPageState, setPageState } from '../lib/pageStateCache'
import { FilterBar, RatingSlider, filterSelectClass } from '../components/FilterBar'
import type { MediaItem, TmdbType } from '../lib/types'

const SORTS: { value: string; label: string }[] = [
  { value: 'popularity.desc', label: 'Più popolari' },
  { value: 'vote_average.desc', label: 'Più votati' },
  { value: 'primary_release_date.desc', label: 'Più recenti' },
  { value: 'revenue.desc', label: 'Maggiori incassi' },
]

const selectClass = filterSelectClass

interface GenrePageCache {
  items: MediaItem[]
  page: number
  totalPages: number
  sort: string
  year: string
  language: string
  country: string
  minVote: number
  subgenre: string
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
  const [minVote, setMinVote] = useState(cached?.minVote ?? 0)
  // Sottogenere scelto (etichetta, '' = tutto il genere) e le keyword TMDB
  // risolte per esso, tenute come stringa così le dipendenze restano stabili.
  const [subgenre, setSubgenre] = useState(cached?.subgenre ?? '')
  const [keywordKey, setKeywordKey] = useState('')
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
  const subgenres = subgenresFor(gid)
  const keywordIds = keywordKey ? keywordKey.split(',') : undefined
  const filters = {
    year,
    language,
    country,
    minVote: minVote > 0 ? String(minVote) : undefined,
    keywordIds,
  }

  // Il sottogenere scelto va tradotto in id di keyword prima di poter filtrare.
  useEffect(() => {
    if (!subgenre) {
      setKeywordKey('')
      return
    }
    const chosen = subgenres.find((s) => s.label === subgenre)
    if (!chosen) {
      setKeywordKey('')
      return
    }
    let active = true
    resolveKeywordIds(chosen.keywords)
      .then((ids) => { if (active) setKeywordKey(ids.join(',')) })
      .catch(() => { if (active) setKeywordKey('') })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subgenre, gid])

  // Cambiando genere (stessa pagina, id diverso) il sottogenere non è più valido.
  useEffect(() => { setSubgenre('') }, [gid])

  // Persist state to cache whenever it changes so a subsequent POP can restore it.
  useEffect(() => {
    if (items.length === 0) return
    setPageState<GenrePageCache>(location.key, { items, page, totalPages, sort, year, language, country, minVote, subgenre })
  }, [location.key, items, page, totalPages, sort, year, language, country, minVote, subgenre])

  useEffect(() => {
    if (!genreId) return
    getGenres(t)
      .then((genres) => setGenreName(genres.find((g) => g.id === gid)?.name ?? ''))
      .catch(() => setGenreName(''))
  }, [t, gid, genreId])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    setItems([])
    setPage(1)
    discoverByGenre(t, gid, 1, sort, {
      year,
      language,
      country,
      minVote: minVote > 0 ? String(minVote) : undefined,
      keywordIds: keywordKey ? keywordKey.split(',') : undefined,
    })
      .then(({ items: newItems, totalPages: tp }) => {
        setItems(newItems)
        setTotalPages(tp)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [t, gid, sort, year, language, country, minVote, keywordKey])

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

  const hasFilters = year || language || country || minVote > 0

  return (
    <div>
      <PageHeader
        eyebrow={t === 'tv' ? 'Serie TV per genere' : 'Film per genere'}
        title={genreName || 'Genere'}
        subtitle={
          subgenres.length > 0
            ? 'Scegli un sottogenere per restringere il campo, poi affina con i filtri.'
            : 'Sfoglia i titoli e affina con i filtri avanzati.'
        }
      />

      {/* Sottogeneri: restringono il genere via keyword TMDB (es. Guerra →
          Antimilitarista). Presenti solo per i generi che ne hanno di curati. */}
      {subgenres.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Sottogenere</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSubgenre('')}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                subgenre === ''
                  ? 'bg-projector text-theatre-950'
                  : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
              }`}
            >
              Tutti
            </button>
            {subgenres.map((s) => (
              <button
                key={s.label}
                onClick={() => setSubgenre(s.label)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  subgenre === s.label
                    ? 'bg-projector text-theatre-950'
                    : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Advanced filters — sort lives here with the rest, in one row */}
      <FilterBar>
        <RatingSlider value={minVote} onChange={setMinVote} />
        <select aria-label="Filtra per anno" value={year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
          <option value="">Anno: qualsiasi</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select aria-label="Filtra per lingua" value={language} onChange={(e) => setLanguage(e.target.value)} className={selectClass}>
          <option value="">Lingua: qualsiasi</option>
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select aria-label="Filtra per paese" value={country} onChange={(e) => setCountry(e.target.value)} className={selectClass}>
          <option value="">Paese: qualsiasi</option>
          {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select aria-label="Ordina i risultati" value={sort} onChange={(e) => setSort(e.target.value)} className={selectClass}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setYear(''); setLanguage(''); setCountry(''); setMinVote(0) }}
            className="text-sm text-projector/80 hover:text-projector"
          >
            ✕ Azzera
          </button>
        )}
      </FilterBar>

      {loading ? (
        <Loader label="Sfoglio il catalogo…" />
      ) : error ? (
        <ErrorState title="Catalogo non disponibile" message={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nessun titolo"
          message={
            subgenre
              ? `Nessun titolo etichettato «${subgenre}» con questi filtri. Prova un altro sottogenere o torna a «Tutti».`
              : 'Prova a togliere qualche filtro o cambiare ordinamento.'
          }
        />
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
