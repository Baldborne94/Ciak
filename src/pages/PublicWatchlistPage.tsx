import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { getPublicWatchlist, type PublicWatchlistItem } from '../lib/userTitles'
import { posterUrl } from '../lib/tmdb'

// Vista pubblica e in sola lettura della watchlist "Da vedere" di un utente.
// Accessibile senza login: la funzione SECURITY DEFINER restituisce i titoli
// solo se il proprietario ha attivato la condivisione.
export default function PublicWatchlistPage() {
  const { userId } = useParams<{ userId: string }>()
  const [items, setItems] = useState<PublicWatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    getPublicWatchlist(userId)
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) return <Loader label="Apro la watchlist…" />
  if (error) return <ErrorState title="Watchlist non disponibile" message={error} />

  return (
    <div>
      <PageHeader
        eyebrow="Watchlist condivisa"
        title="Da vedere"
        subtitle="I film e le serie che questa persona vuole guardare."
      />

      {items.length === 0 ? (
        <EmptyState
          title="Niente da mostrare"
          message="Questa watchlist è vuota oppure non è stata resa pubblica dal proprietario."
          icon="🎟️"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((it) => {
            const poster = posterUrl(it.poster_path)
            const type = it.media_type === 'movie' ? 'movie' : 'tv'
            return (
              <Link
                key={`${it.media_type}:${it.tmdb_id}`}
                to={`/title/${type}/${it.tmdb_id}`}
                className="group overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900"
              >
                <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
                  {poster ? (
                    <img src={poster} alt={it.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl opacity-30">🎞️</div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-1 text-sm font-semibold text-zinc-100">{it.title}</h3>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <Link to="/" className="mt-8 inline-block text-sm text-projector/80 hover:text-projector">
        Scopri Ciak →
      </Link>
    </div>
  )
}
