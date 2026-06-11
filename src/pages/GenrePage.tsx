import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { discoverByGenre, getGenres, isTmdbConfigured } from '../lib/tmdb'
import type { MediaItem, TmdbType } from '../lib/types'

const SORTS: { value: string; label: string }[] = [
  { value: 'popularity.desc', label: 'Più popolari' },
  { value: 'vote_average.desc', label: 'Più votati' },
  { value: 'primary_release_date.desc', label: 'Più recenti' },
  { value: 'revenue.desc', label: 'Maggiori incassi' },
]

export default function GenrePage() {
  const { type, genreId } = useParams<{ type: TmdbType; genreId: string }>()
  const [items, setItems] = useState<MediaItem[]>([])
  const [genreName, setGenreName] = useState('')
  const [sort, setSort] = useState('popularity.desc')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const t = (type ?? 'movie') as TmdbType
  const gid = Number(genreId)

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
    discoverByGenre(t, gid, 1, sort)
      .then(({ items: newItems, totalPages: tp }) => {
        setItems(newItems)
        setTotalPages(tp)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [t, gid, sort])

  useEffect(() => {
    load()
  }, [load])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    try {
      const { items: newItems } = await discoverByGenre(t, gid, next, sort)
      setItems((prev) => [...prev, ...newItems])
      setPage(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t === 'tv' ? 'Serie TV per genere' : 'Film per genere'}
        title={genreName || 'Genere'}
        subtitle="Sfoglia i titoli ordinati come preferisci."
      >
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="input-cine w-auto"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </PageHeader>

      {loading ? (
        <Loader label="Sfoglio il catalogo…" />
      ) : error ? (
        <ErrorState title="Catalogo non disponibile" message={error} />
      ) : items.length === 0 ? (
        <EmptyState title="Nessun titolo" message="Prova un altro ordinamento." />
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

      <Link
        to="/search"
        className="mt-8 inline-block text-sm text-projector/80 hover:text-projector"
      >
        ← Torna alla ricerca
      </Link>
    </div>
  )
}
