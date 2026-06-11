import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaCard from '../components/MediaCard'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { getCollection, backdropUrl, isTmdbConfigured } from '../lib/tmdb'
import type { CollectionDetail, MediaItem } from '../lib/types'

type Order = 'release' | 'story'

function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>()
  const [collection, setCollection] = useState<CollectionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [order, setOrder] = useState<Order>('release')
  const [storyNotes, setStoryNotes] = useState<Map<number, string>>(new Map())
  const [storyOrder, setStoryOrder] = useState<number[] | null>(null) // tmdb ids in story order
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per vedere le saghe.')
      setLoading(false)
      return
    }
    setLoading(true)
    setOrder('release')
    setStoryOrder(null)
    setStoryNotes(new Map())
    getCollection(Number(id))
      .then(setCollection)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function loadStoryOrder() {
    if (!collection) return
    if (storyOrder) {
      setOrder('story')
      return
    }
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/saga-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: collection.name,
          films: collection.items.map((i) => ({
            title: i.title,
            year: i.releaseDate?.slice(0, 4),
          })),
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? 'Servizio AI non disponibile.')
      }
      const data = (await res.json()) as { order: { title: string; note: string }[] }
      // Map AI titles back to TMDB items.
      const byTitle = new Map(collection.items.map((i) => [normaliseTitle(i.title), i]))
      const ids: number[] = []
      const notes = new Map<number, string>()
      for (const o of data.order ?? []) {
        const item = byTitle.get(normaliseTitle(o.title))
        if (item && !ids.includes(item.id)) {
          ids.push(item.id)
          if (o.note) notes.set(item.id, o.note)
        }
      }
      // Append any items the AI missed.
      for (const i of collection.items) if (!ids.includes(i.id)) ids.push(i.id)
      setStoryOrder(ids)
      setStoryNotes(notes)
      setOrder('story')
    } catch (e) {
      setAiError((e as Error).message)
    } finally {
      setAiLoading(false)
    }
  }

  const orderedItems = useMemo<MediaItem[]>(() => {
    if (!collection) return []
    if (order === 'story' && storyOrder) {
      const byId = new Map(collection.items.map((i) => [i.id, i]))
      return storyOrder.map((id) => byId.get(id)).filter((x): x is MediaItem => !!x)
    }
    return collection.items
  }, [collection, order, storyOrder])

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
        subtitle={`${collection.items.length} film — scegli l'ordine di visione.`}
      />

      {/* Order toggle */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-zinc-500">Ordine</span>
        <button
          onClick={() => setOrder('release')}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            order === 'release'
              ? 'bg-projector text-theatre-950'
              : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
          }`}
        >
          📅 Di uscita
        </button>
        <button
          onClick={loadStoryOrder}
          disabled={aiLoading}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            order === 'story'
              ? 'bg-projector text-theatre-950'
              : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
          }`}
        >
          {aiLoading ? '🤖 Calcolo…' : '🤖 Secondo la storia'}
        </button>
        {aiError && <span className="text-xs text-curtain-light">{aiError}</span>}
      </div>

      {collection.items.length === 0 ? (
        <EmptyState title="Nessun film nella saga" message="TMDB non ha titoli per questa collezione." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {orderedItems.map((item, i) => (
            <div key={item.id} className="relative">
              <span className="absolute -left-1 -top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-projector text-sm font-bold text-theatre-950 shadow-reel">
                {i + 1}
              </span>
              <MediaCard item={item} />
              {order === 'story' && storyNotes.get(item.id) && (
                <p className="mt-1 px-1 text-xs italic text-zinc-500">{storyNotes.get(item.id)}</p>
              )}
            </div>
          ))}
        </div>
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
