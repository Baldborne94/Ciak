import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { getTrending, isTmdbConfigured } from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { getStats, type UserStats } from '../lib/userTitles'
import type { MediaItem } from '../lib/types'

export default function Dashboard() {
  const { user } = useAuth()
  const [trending, setTrending] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)

  useEffect(() => {
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per scoprire i titoli del momento.')
      setLoading(false)
      return
    }
    getTrending()
      .then(setTrending)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) {
      setStats(null)
      return
    }
    getStats(user.id)
      .then(setStats)
      .catch(() => setStats(null))
  }, [user])

  const cards = [
    { label: 'Titoli visti', value: stats?.watched, icon: '🎬' },
    { label: 'Da vedere', value: stats?.toWatch, icon: '🎟️' },
    { label: 'In corso', value: stats?.inProgress, icon: '▶️' },
    { label: 'Preferiti', value: stats?.favorites, icon: '❤️' },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="La tua sala"
        title="Bentornato al cinema"
        subtitle="Le tue statistiche e i titoli che stanno spopolando oggi."
      />

      {/* Personal stats from Supabase (— when not signed in). */}
      <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-4"
          >
            <div className="text-2xl">{stat.icon}</div>
            <div className="mt-2 font-display text-3xl tracking-wide text-projector">
              {user && stat.value !== undefined ? stat.value : '—'}
            </div>
            <div className="text-xs text-zinc-500">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3">
        <h2 className="font-display text-2xl tracking-wide text-zinc-100">
          🍿 Scopri oggi
        </h2>
        <span className="text-sm text-zinc-500">Trending della settimana</span>
      </div>

      {loading ? (
        <Loader label="Accendo il proiettore…" />
      ) : error ? (
        <ErrorState title="Niente proiezione" message={error} />
      ) : trending.length === 0 ? (
        <EmptyState
          title="Nessun titolo di tendenza"
          message="Riprova più tardi."
        />
      ) : (
        <MediaGrid items={trending} />
      )}
    </div>
  )
}
