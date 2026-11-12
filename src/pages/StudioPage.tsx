import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { discoverByCompany, getCompany, logoUrl, studioOmonimoPiuGrande } from '../lib/tmdb'
import { logFailure } from '../lib/logFailure'
import EntityFavoriteButton from '../components/EntityFavoriteButton'
import type { Company, MediaItem } from '../lib/types'

export default function StudioPage() {
  const { id } = useParams<{ id: string }>()
  const [company, setCompany] = useState<Company | null>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Lo studio vero quando questo è un doppione col suo stesso nome (vedi
  // ordinaOmonimi): un «A24» con un film solo, mentre quello vero ne ha 148.
  const [omonimo, setOmonimo] = useState<Company | null>(null)

  const cid = Number(id)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    setItems([])
    setPage(1)
    setOmonimo(null)
    getCompany(cid)
      .then((c) => {
        setCompany(c)
        return studioOmonimoPiuGrande(c).then(setOmonimo, logFailure('Omonimi dello studio'))
      })
      .catch(() => setCompany(null))
    discoverByCompany(cid, 1)
      .then(({ items: newItems, totalPages: tp }) => {
        setItems(newItems)
        setTotalPages(tp)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [cid, id])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    try {
      const { items: newItems } = await discoverByCompany(cid, next)
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
        eyebrow="Studio di produzione"
        title={company?.name ?? 'Film dello studio'}
        subtitle="Tutti i titoli prodotti, dai più popolari."
      >
        {company && logoUrl(company.logoPath) && (
          <img
            src={logoUrl(company.logoPath)!}
            alt={company.name}
            className="max-h-12 rounded bg-white/90 px-3 py-2"
          />
        )}
      </PageHeader>

      {company && (
        <EntityFavoriteButton
          entity={{
            entityType: 'company',
            entityId: company.id,
            name: company.name,
            imagePath: company.logoPath,
            subtitle: null,
          }}
        />
      )}

      {omonimo && company && (
        <p role="note" className="mt-6 rounded-xl border border-projector/40 bg-projector/10 p-4 text-sm text-zinc-200">
          Su TMDB ci sono più studi chiamati «{company.name}», e questo ha pochi titoli.{' '}
          <Link to={`/studio/${omonimo.id}`} className="font-semibold text-projector hover:underline">
            Apri quello con {omonimo.film} film →
          </Link>
        </p>
      )}

      <div className="mt-8" />

      {loading ? (
        <Loader label="Carico la produzione…" />
      ) : error ? (
        <ErrorState title="Studio non disponibile" message={error} />
      ) : items.length === 0 ? (
        <EmptyState title="Nessun titolo trovato" message="Questo studio non ha film indicizzati." />
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
