import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { ScrollRow } from '../components/MediaRow'
import MediaGrid from '../components/MediaGrid'
import { posterUrl, getRecentReleases, getSagaContinuations } from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { listByStatus, listWatchlist, listFavorites, listAll } from '../lib/userTitles'
import { getContinueWatching, type ContinueItem } from '../lib/episodes'
import type { MediaItem, UserTitle } from '../lib/types'

function ContinueCard({ c }: { c: ContinueItem }) {
  const poster = posterUrl(c.posterPath)
  const pct = c.totalEpisodes > 0 ? Math.round((c.watchedCount / c.totalEpisodes) * 100) : 0
  return (
    <Link
      to={`/title/tv/${c.tvId}?season=${c.season}&episode=${c.episode}#episodi`}
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

function MediaScrollRow({ items }: { items: MediaItem[] }) {
  return (
    <ScrollRow>
      {items.map((item) => (
        <Link
          key={item.id}
          to={`/title/${item.mediaType}/${item.id}`}
          className="group w-36 shrink-0 overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40"
        >
          <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
            {posterUrl(item.posterPath) ? (
              <img src={posterUrl(item.posterPath)!} alt={item.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
            )}
          </div>
          <div className="p-2">
            <p className="line-clamp-2 text-xs font-semibold text-zinc-100">{item.title}</p>
            <p className="text-[11px] text-zinc-500">{item.releaseDate?.slice(0, 4)}</p>
          </div>
        </Link>
      ))}
    </ScrollRow>
  )
}

// "Scegli per me": pesca a caso un titolo dalla watchlist per decidere in fretta.
function ChooseForMe({ watchlist }: { watchlist: UserTitle[] }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * watchlist.length))
  const pick = watchlist[index] ?? watchlist[0]

  function reroll() {
    if (watchlist.length < 2) return
    let next = index
    while (next === index) next = Math.floor(Math.random() * watchlist.length)
    setIndex(next)
  }

  if (!pick) return null
  const poster = posterUrl(pick.poster_path)

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-projector/30 bg-gradient-to-br from-projector/10 via-theatre-900/60 to-theatre-900/40 p-5">
      <Link
        to={`/title/${pick.media_type}/${pick.tmdb_id}`}
        className="group h-40 w-28 shrink-0 overflow-hidden rounded-xl border border-theatre-800 bg-theatre-800"
      >
        {poster ? (
          <img src={poster} alt={pick.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wider text-projector/80">Dalla tua lista «Da vedere»</p>
        <Link to={`/title/${pick.media_type}/${pick.tmdb_id}`}>
          <h3 className="mt-1 font-display text-2xl tracking-wide text-zinc-100 hover:text-projector">
            {pick.title}
          </h3>
        </Link>
        <p className="mt-1 text-sm text-zinc-400">
          {pick.media_type === 'tv' ? 'Serie TV' : 'Film'} · in attesa nella tua watchlist
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/title/${pick.media_type}/${pick.tmdb_id}`} className="btn-primary">
            Guardalo →
          </Link>
          {watchlist.length > 1 && (
            <button onClick={reroll} className="btn-ghost">🎲 Rigira</button>
          )}
        </div>
      </div>
    </div>
  )
}

// Genre frequency map (favorites count double) → top genres for "Nuove uscite".
function topGenreIds(titles: UserTitle[], limit = 3): number[] {
  const w = new Map<number, number>()
  for (const t of titles) for (const g of t.genre_ids ?? []) w.set(g, (w.get(g) ?? 0) + 1)
  return [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
}

export default function Dashboard() {
  const { user } = useAuth()
  const [watchlist, setWatchlist] = useState<UserTitle[]>([])
  const [continueList, setContinueList] = useState<ContinueItem[]>([])
  const [sagaNext, setSagaNext] = useState<MediaItem[]>([])
  const [recentMovies, setRecentMovies] = useState<MediaItem[]>([])
  const [recentTv, setRecentTv] = useState<MediaItem[]>([])

  useEffect(() => {
    if (!user) {
      setWatchlist([])
      setContinueList([])
      setSagaNext([])
      setRecentMovies([])
      setRecentTv([])
      return
    }

    listWatchlist(user.id).then(setWatchlist).catch(() => setWatchlist([]))
    getContinueWatching(user.id).then(setContinueList).catch(() => setContinueList([]))

    // Personalized sections from the user's own library.
    Promise.all([
      listFavorites(user.id),
      listByStatus(user.id, 'watched'),
      listAll(user.id),
    ]).then(async ([favs, watched, all]) => {
      const knownIds = new Set(all.map((t) => t.tmdb_id))

      // "Continua la saga": watched movies (most-recent first) → next unwatched
      // film in each collection they belong to.
      const watchedMovieIds = watched
        .filter((t) => t.media_type === 'movie')
        .map((t) => t.tmdb_id)
      if (watchedMovieIds.length > 0) {
        getSagaContinuations(watchedMovieIds, knownIds)
          .then(setSagaNext)
          .catch(() => setSagaNext([]))
      }

      // Recent releases personalized by the user's most-watched genres.
      const genres = topGenreIds([...favs, ...watched])
      const [movies, tv] = await Promise.all([
        getRecentReleases('movie', genres),
        getRecentReleases('tv', genres),
      ])
      setRecentMovies(movies.filter((m) => !knownIds.has(m.id)).slice(0, 20))
      setRecentTv(tv.filter((t) => !knownIds.has(t.id)).slice(0, 20))
    }).catch(() => {})
  }, [user])

  // Merge and interleave recent movies + tv for the "Nuove uscite" grid.
  const recentMixed = useMemo(() => {
    const out: MediaItem[] = []
    const len = Math.max(recentMovies.length, recentTv.length)
    for (let i = 0; i < len; i++) {
      if (recentMovies[i]) out.push(recentMovies[i])
      if (recentTv[i]) out.push(recentTv[i])
    }
    return out.slice(0, 20)
  }, [recentMovies, recentTv])

  const isEmpty =
    watchlist.length === 0 && continueList.length === 0 && sagaNext.length === 0

  return (
    <div>
      <PageHeader
        eyebrow="La tua sala"
        title="Bentornato al cinema"
        subtitle="Il tuo archivio, le tue liste e cosa vedere adesso."
      />

      <div className="space-y-12">
        {/* AI shortcut — prominent banner at top */}
        {user && (
          <section>
            <Link
              to="/ai?tab=tonight"
              className="group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-projector/30 bg-gradient-to-br from-projector/10 via-theatre-900/60 to-theatre-900/40 p-6 transition hover:border-projector/60 hover:from-projector/15"
            >
              <div>
                <p className="font-display text-xl tracking-wide text-zinc-100">✨ Non sai cosa vedere stasera?</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Dimmi umore e tempo: trovo io il film o la serie perfetta per te.
                </p>
              </div>
              <span className="btn-primary shrink-0">Apri «Stasera» →</span>
            </Link>
          </section>
        )}

        {/* Choose for me — quick pick from the watchlist */}
        {user && watchlist.length > 0 && (
          <section>
            <SectionTitle icon="🎲" title="Scegli per me" />
            <ChooseForMe watchlist={watchlist} />
          </section>
        )}

        {/* Resume watching */}
        {user && continueList.length > 0 && (
          <section>
            <SectionTitle icon="📺" title="Riprendi a guardare" />
            <ScrollRow>
              {continueList.map((c) => <ContinueCard key={c.tvId} c={c} />)}
            </ScrollRow>
          </section>
        )}

        {/* Continue the saga — next unwatched film in sagas you've started */}
        {user && sagaNext.length > 0 && (
          <section>
            <SectionTitle icon="🎬" title="Continua la saga" />
            <p className="-mt-3 mb-4 text-sm text-zinc-500">
              Il prossimo capitolo delle saghe che hai iniziato ma non ancora finito.
            </p>
            <MediaScrollRow items={sagaNext} />
          </section>
        )}

        {/* Recent releases personalized by genre */}
        {user && recentMixed.length > 0 && (
          <section>
            <SectionTitle icon="🆕" title="Nuove uscite per te" />
            <MediaGrid items={recentMixed} />
          </section>
        )}

        {/* Empty state */}
        {user && isEmpty && (
          <section className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
            <p className="text-zinc-300">
              La tua sala è ancora vuota. Esplora il catalogo e aggiungi i titoli che vuoi vedere.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link to="/search" className="btn-primary">🔍 Cerca & Esplora</Link>
              <Link to="/guida" className="btn-ghost">❓ Come funziona</Link>
            </div>
          </section>
        )}

        {/* Login prompt */}
        {!user && (
          <section className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
            <p className="text-zinc-300">
              Accedi per creare le tue liste, salvare i preferiti e ricevere suggerimenti AI su misura.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link to="/login" className="btn-primary inline-flex">🎟️ Accedi</Link>
              <Link to="/guida" className="btn-ghost inline-flex">❓ Scopri cosa puoi fare</Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
