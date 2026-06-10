import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaCard from '../components/MediaCard'
import { ErrorState, Loader } from '../components/States'
import {
  getTrendingMovies,
  getTrendingTV,
  getAnime,
  getCartoons,
  getLatestMovies,
  getLatestTV,
  getLatestAnime,
  getLatestCartoons,
  isTmdbConfigured,
} from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { getStats, type UserStats } from '../lib/userTitles'
import type { MediaItem } from '../lib/types'

interface Section {
  label: string
  icon: string
  href?: string
  items: MediaItem[]
}

function MediaRow({ items }: { items: MediaItem[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`} className="w-36 shrink-0 sm:w-44">
          <MediaCard item={item} />
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [sections, setSections] = useState<Section[]>([])
  const [latest, setLatest] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)

  useEffect(() => {
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per scoprire i titoli del momento.')
      setLoading(false)
      return
    }
    Promise.all([
      getTrendingMovies(),
      getTrendingTV(),
      getAnime(1),
      getCartoons(1),
      getLatestMovies(),
      getLatestTV(),
      getLatestAnime(),
      getLatestCartoons(),
    ])
      .then(([movies, tv, animeRes, cartoonsRes, latMovies, latTv, latAnime, latCartoons]) => {
        setSections([
          { label: 'Film', icon: '🎬', items: movies },
          { label: 'Serie TV', icon: '📺', items: tv },
          { label: 'Anime', icon: '⛩️', href: '/anime', items: animeRes.items },
          { label: 'Cartoni animati', icon: '🎨', href: '/cartoons', items: cartoonsRes.items },
        ])
        setLatest([
          { label: 'Film', icon: '🎬', items: latMovies },
          { label: 'Serie TV', icon: '📺', items: latTv },
          { label: 'Anime', icon: '⛩️', items: latAnime },
          { label: 'Cartoni animati', icon: '🎨', items: latCartoons },
        ])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) { setStats(null); return }
    getStats(user.id).then(setStats).catch(() => setStats(null))
  }, [user])

  const statCards = [
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

      <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map((stat) => (
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

      {loading ? (
        <Loader label="Accendo il proiettore…" />
      ) : error ? (
        <ErrorState title="Niente proiezione" message={error} />
      ) : (
        <div className="space-y-12">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <h2 className="font-display text-3xl tracking-wide text-projector">
                🔥 Di tendenza
              </h2>
              <span className="text-sm text-zinc-500">Questa settimana</span>
            </div>
            <div className="space-y-10">
              {sections.map((section) => (
                <SectionRow key={section.label} section={section} />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-6 flex items-center gap-3">
              <h2 className="font-display text-3xl tracking-wide text-projector">
                🆕 Ultime uscite
              </h2>
              <span className="text-sm text-zinc-500">Le novità più recenti</span>
            </div>
            <div className="space-y-10">
              {latest.map((section) => (
                <SectionRow key={section.label} section={section} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionRow({ section }: { section: Section }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-2xl tracking-wide text-zinc-100">
          {section.icon} {section.label}
        </h3>
        {section.href && (
          <Link
            to={section.href}
            className="text-sm text-projector/70 transition hover:text-projector"
          >
            Vedi tutti →
          </Link>
        )}
      </div>
      {section.items.length > 0 ? (
        <MediaRow items={section.items} />
      ) : (
        <p className="text-sm text-zinc-600">Nessun titolo disponibile.</p>
      )}
    </div>
  )
}
