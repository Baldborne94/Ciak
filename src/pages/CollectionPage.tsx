import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { getCollection, backdropUrl, isTmdbConfigured } from '../lib/tmdb'
import type { CollectionDetail } from '../lib/types'

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>()
  const [collection, setCollection] = useState<CollectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per vedere le saghe.')
      setLoading(false)
      return
    }
    setLoading(true)
    getCollection(Number(id))
      .then(setCollection)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loader label="Carico la saga…" />
  if (error) return <ErrorState title="Saga non disponibile" message={error} />
  if (!collection) return null

  const backdrop = backdropUrl(collection.backdropPath)

  return (
    <div>
      {backdrop && (
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-theatre-800">
          <img src={backdrop} alt="" className="h-48 w-full object-cover opacity-40 sm:h-64" />
          <div className="absolute inset-0 bg-gradient-to-t from-theatre-950 to-transparent" />
        </div>
      )}

      <PageHeader
        eyebrow="Saga / Collezione"
        title={collection.name}
        subtitle={collection.overview ?? `${collection.items.length} film in ordine cronologico.`}
      />

      {collection.items.length === 0 ? (
        <EmptyState title="Nessun film nella saga" message="TMDB non ha titoli per questa collezione." />
      ) : (
        <MediaGrid items={collection.items} />
      )}

      <Link
        to="/search?mode=collections"
        className="mt-8 inline-block text-sm text-projector/80 hover:text-projector"
      >
        ← Torna alla ricerca
      </Link>
    </div>
  )
}
