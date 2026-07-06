import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import AlertButton from '../components/AlertButton'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { alertIds, personalizedUpcoming, upcomingFromFollowedPeople, type PersonUpcoming } from '../lib/alerts'
import { posterUrl, displayTitle, isTmdbConfigured } from '../lib/tmdb'
import type { MediaItem } from '../lib/types'

function formatDate(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()
  return Math.round(ms / 86400000)
}

function UpcomingCard({ item, alerted, people }: { item: MediaItem; alerted: boolean; people?: string[] }) {
  const poster = posterUrl(item.posterPath)
  const type = item.mediaType === 'movie' ? 'movie' : 'tv'
  const d = daysUntil(item.releaseDate)
  return (
    <div className="overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900">
      <Link to={`/title/${type}/${item.id}`} className="group block">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-theatre-800">
          {poster ? (
            <img src={poster} alt={item.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
          )}
          {d !== null && d >= 0 && (
            <span className="absolute right-1 top-1 rounded-md bg-theatre-950/85 px-1.5 py-0.5 text-[11px] font-semibold text-projector">
              {d === 0 ? 'oggi' : `tra ${d}g`}
            </span>
          )}
        </div>
        <div className="px-2 pt-2">
          <p className="line-clamp-1 text-sm font-semibold text-zinc-100">{displayTitle(item)}</p>
          <p className="text-xs text-zinc-500">{formatDate(item.releaseDate)}</p>
          {people && people.length > 0 && (
            <p className="line-clamp-1 text-[11px] text-projector/80" title={people.join(', ')}>
              👤 {people.join(', ')}
            </p>
          )}
        </div>
      </Link>
      <div className="p-2 pt-1">
        <AlertButton
          item={{
            tmdbId: item.id,
            mediaType: item.mediaType,
            title: item.title,
            posterPath: item.posterPath,
            releaseDate: item.releaseDate,
          }}
          active={alerted}
        />
      </div>
    </div>
  )
}

export default function UpcomingPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<MediaItem[]>([])
  const [followed, setFollowed] = useState<PersonUpcoming[]>([])
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per vedere le uscite.')
      setLoading(false)
      return
    }
    setLoading(true)
    // Followed-people releases load in parallel but don't block/error the page.
    upcomingFromFollowedPeople(user.id).then(setFollowed).catch(() => setFollowed([]))
    Promise.all([personalizedUpcoming(user.id), alertIds(user.id)])
      .then(([up, set]) => {
        setItems(up)
        setIds(set)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  const key = useMemo(() => (i: MediaItem) => `${i.mediaType}-${i.id}`, [])

  return (
    <div>
      <PageHeader
        eyebrow="Sta per uscire"
        title="In arrivo per te"
        subtitle="Film, serie, anime e cartoni in uscita, scelti in base a cosa guardi. Tocca «Avvisami» per essere allertato all'uscita."
      />

      {!user ? (
        <EmptyState
          title="Accedi per le uscite su misura"
          message="Con il tuo account analizzo i tuoi generi preferiti e ti mostro cosa sta per uscire."
          icon="🔮"
        />
      ) : loading ? (
        <Loader label="Cerco le prossime uscite…" />
      ) : error ? (
        <ErrorState title="Uscite non disponibili" message={error} />
      ) : (
        <div className="space-y-12">
          {/* Releases from directors/actors the user follows */}
          {followed.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
                🌟 Dai registi e attori che segui
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {followed.map(({ item, people }) => (
                  <UpcomingCard key={key(item)} item={item} alerted={ids.has(key(item))} people={people} />
                ))}
              </div>
            </section>
          )}

          {/* Personalized by genre */}
          <section>
            {followed.length > 0 && (
              <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
                🔮 Su misura per i tuoi generi
              </h2>
            )}
            {items.length === 0 ? (
              <EmptyState
                title="Nessuna uscita su misura"
                message="Segna qualche titolo come visto o preferito: userò i tuoi generi per trovare le uscite più adatte."
                icon="🔮"
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {items.map((item) => (
                  <UpcomingCard key={key(item)} item={item} alerted={ids.has(key(item))} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
