import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import { MediaRow, ScrollRow } from '../components/MediaRow'
import { Loader } from '../components/States'
import { resolveSuggestions, posterUrl } from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { getStats, listByStatus, listFavorites, type UserStats } from '../lib/userTitles'
import { getContinueWatching, type ContinueItem } from '../lib/episodes'
import { aiFetch } from '../lib/aiClient'
import type { MediaItem, UserTitle } from '../lib/types'

function ContinueCard({ c }: { c: ContinueItem }) {
  const poster = posterUrl(c.posterPath)
  const pct = c.totalEpisodes > 0 ? Math.round((c.watchedCount / c.totalEpisodes) * 100) : 0
  return (
    <Link
      to={`/title/tv/${c.tvId}`}
      className="group w-40 shrink-0 overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
        {poster ? (
          <img src={poster} alt={c.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
        )}
      </div>
      <div className="p-2">
        <p className="line-clamp-1 text-sm font-semibold text-zinc-100">{c.title}</p>
        <p className="text-xs text-projector">▶ S{c.season} · E{c.episode}</p>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-theatre-800">
          <div className="h-full rounded-full bg-projector" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-500">{c.watchedCount}/{c.totalEpisodes} episodi</p>
      </div>
    </Link>
  )
}

interface Suggestion {
  title: string
  reason: string
}

function SectionTitle({ icon, title, action }: { icon: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="font-display text-2xl tracking-wide text-zinc-100">
        {icon} {title}
      </h2>
      {action}
    </div>
  )
}

function AiSuggestions({ user }: { user: ReturnType<typeof useAuth>['user'] }) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const [favorites, watched] = user
        ? await Promise.all([listFavorites(user.id), listByStatus(user.id, 'watched')])
        : [[], []]

      const data = await aiFetch<{ suggestions: Suggestion[] }>('/api/recommendations', {
        favorites: favorites.map((f) => ({ title: f.title, mediaType: f.media_type })),
        watched: watched.map((w) => ({ title: w.title, mediaType: w.media_type })),
      })
      const resolved = await resolveSuggestions((data.suggestions ?? []).map((s) => s.title))
      setItems(resolved)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <SectionTitle
        icon="✨"
        title="Suggeriti per te"
        action={
          <button onClick={generate} disabled={loading} className="btn-ghost px-3 py-1.5 text-sm">
            {loading ? 'Genero…' : items ? '↻ Rigenera' : 'Genera con l’AI'}
          </button>
        }
      />
      {error ? (
        <p className="text-sm text-curtain-light">{error}</p>
      ) : loading ? (
        <Loader label="L’AI sta scegliendo per te…" />
      ) : items === null ? (
        <p className="text-sm text-zinc-500">
          Premi «Genera con l’AI»: analizza i tuoi preferiti e i visti per proporti il prossimo titolo.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Servono più dati: aggiungi qualche titolo ai preferiti e ai visti, poi rigenera.
        </p>
      ) : (
        <MediaRow items={items} />
      )}
    </section>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [watchlist, setWatchlist] = useState<UserTitle[]>([])
  const [inProgress, setInProgress] = useState<UserTitle[]>([])
  const [continueList, setContinueList] = useState<ContinueItem[]>([])

  // Personal lists from Supabase.
  useEffect(() => {
    if (!user) {
      setStats(null)
      setWatchlist([])
      setInProgress([])
      setContinueList([])
      return
    }
    getStats(user.id).then(setStats).catch(() => setStats(null))
    listByStatus(user.id, 'to_watch').then(setWatchlist).catch(() => setWatchlist([]))
    listByStatus(user.id, 'in_progress').then(setInProgress).catch(() => setInProgress([]))
    getContinueWatching(user.id).then(setContinueList).catch(() => setContinueList([]))
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
        subtitle="I tuoi titoli e i suggerimenti su misura per te."
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

      <div className="space-y-12">
        {/* Resume by episode — next unwatched episode of tracked series */}
        {user && continueList.length > 0 && (
          <section>
            <SectionTitle icon="📺" title="Riprendi a guardare" />
            <ScrollRow>
              {continueList.map((c) => <ContinueCard key={c.tvId} c={c} />)}
            </ScrollRow>
          </section>
        )}

        {/* Watchlist */}
        {user && watchlist.length > 0 && (
          <section>
            <SectionTitle
              icon="🎟️"
              title="Da vedere"
              action={
                <Link to="/lists/watchlist" className="text-sm text-projector/70 hover:text-projector">
                  Vedi tutti →
                </Link>
              }
            />
            <ScrollRow>
              {watchlist.map((r) => <SavedTitleCard key={r.id} record={r} />)}
            </ScrollRow>
          </section>
        )}

        {/* AI suggestions */}
        {user && <AiSuggestions user={user} />}

        {/* Empty state for signed-in users with nothing yet */}
        {user && watchlist.length === 0 && inProgress.length === 0 && continueList.length === 0 && (
          <section className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
            <p className="text-zinc-300">
              La tua sala è ancora vuota. Esplora il catalogo e aggiungi i titoli che vuoi vedere.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link to="/search" className="btn-primary">🔍 Cerca & Esplora</Link>
              <Link to="/search?mode=anime" className="btn-ghost">Sfoglia gli anime</Link>
            </div>
          </section>
        )}

        {/* Login prompt for guests */}
        {!user && (
          <section className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
            <p className="text-zinc-300">
              Accedi per creare le tue liste, salvare i preferiti e ricevere suggerimenti AI su misura.
            </p>
            <Link to="/login" className="btn-primary mt-4 inline-flex">🎟️ Accedi</Link>
          </section>
        )}
      </div>
    </div>
  )
}
