import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import { MediaRow, ScrollRow } from '../components/MediaRow'
import { Loader } from '../components/States'
import { resolveSuggestions } from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { getStats, listByStatus, listFavorites, type UserStats } from '../lib/userTitles'
import type { MediaItem, UserTitle } from '../lib/types'

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

      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          favorites: favorites.map((f) => ({ title: f.title, mediaType: f.media_type })),
          watched: watched.map((w) => ({ title: w.title, mediaType: w.media_type })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Servizio AI non disponibile.')
      }
      const data = (await res.json()) as { suggestions: Suggestion[] }
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

  // Personal lists from Supabase.
  useEffect(() => {
    if (!user) {
      setStats(null)
      setWatchlist([])
      setInProgress([])
      return
    }
    getStats(user.id).then(setStats).catch(() => setStats(null))
    listByStatus(user.id, 'to_watch').then(setWatchlist).catch(() => setWatchlist([]))
    listByStatus(user.id, 'in_progress').then(setInProgress).catch(() => setInProgress([]))
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
        {/* Continue watching */}
        {user && inProgress.length > 0 && (
          <section>
            <SectionTitle
              icon="▶️"
              title="Continua a guardare"
              action={
                <Link to="/lists/in-progress" className="text-sm text-projector/70 hover:text-projector">
                  Vedi tutti →
                </Link>
              }
            />
            <ScrollRow>
              {inProgress.map((r) => <SavedTitleCard key={r.id} record={r} />)}
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
        {user && watchlist.length === 0 && inProgress.length === 0 && (
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
