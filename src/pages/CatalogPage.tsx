import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { isTmdbConfigured } from '../lib/tmdb'
import type { MediaItem } from '../lib/types'

interface Props {
  eyebrow: string
  title: string
  subtitle: string
  fetcher: (page: number) => Promise<{ items: MediaItem[]; totalPages: number }>
}

export default function CatalogPage({ eyebrow, title, subtitle, fetcher }: Props) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per sfogliare il catalogo.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setItems([])
    setPage(1)
    fetcher(1)
      .then(({ items: newItems, totalPages: tp }) => {
        setItems(newItems)
        setTotalPages(tp)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetcher])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    try {
      const { items: newItems, totalPages: tp } = await fetcher(next)
      setItems((prev) => [...prev, ...newItems])
      setPage(next)
      setTotalPages(tp)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />

      {loading ? (
        <Loader label="Carico il catalogo…" />
      ) : error ? (
        <ErrorState title="Catalogo non disponibile" message={error} />
      ) : items.length === 0 ? (
        <EmptyState title="Nessun titolo trovato" message="Riprova più tardi." />
      ) : (
        <>
          <MediaGrid items={items} />
          {page < totalPages && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn-primary"
              >
                {loadingMore ? 'Carico…' : 'Carica altri'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
