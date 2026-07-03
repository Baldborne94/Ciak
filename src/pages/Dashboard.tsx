import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import { ScrollRow } from '../components/MediaRow'
import MediaGrid from '../components/MediaGrid'
import { posterUrl, getRecommendations, getRecentReleases } from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { listByStatus, listWatchlist, listFavorites } from '../lib/userTitles'
import { getContinueWatching, type ContinueItem } from '../lib/episodes'
import type { MediaItem, TmdbType, UserTitle } from '../lib/types'

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

function RecRow({ items }: { items: MediaItem[] }) {
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

// Picks the most frequent genre IDs from a list of user titles.
function topGenreIds(titles: UserTitle[], limit = 3): number[] {
  const counts = new Map<number, number>()
  for (const t of titles) {
    for (const g of t.genre_ids ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
}

const ANIME_GENRE_ID = 16 // Animation genre on TMDB

function dedup(items: MediaItem[], seen: Set<number>, watchedIds: Set<number>): MediaItem[] {
  const out: MediaItem[] = []
  for (const item of items) {
    if (!seen.has(item.id) && !watchedIds.has(item.id)) {
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}

export default function Dashboard() {
  const { user } = useAuth()
  const [watchlist, setWatchlist] = useState<UserTitle[]>([])
  const [continueList, setContinueList] = useState<ContinueItem[]>([])
  const [recFilms, setRecFilms] = useState<MediaItem[]>([])
  const [recSerie, setRecSerie] = useState<MediaItem[]>([])
  const [recAnime, setRecAnime] = useState<MediaItem[]>([])
  const [recCartoni, setRecCartoni] = useState<MediaItem[]>([])
  const [recentMovies, setRecentMovies] = useState<MediaItem[]>([])
  const [recentTv, setRecentTv] = useState<MediaItem[]>([])

  useEffect(() => {
    if (!user) {
      setWatchlist([])
      setContinueList([])
      setRecFilms([])
      setRecSerie([])
      setRecAnime([])
      setRecCartoni([])
      setRecentMovies([])
      setRecentTv([])
      return
    }

    listWatchlist(user.id).then(setWatchlist).catch(() => setWatchlist([]))
    getContinueWatching(user.id).then(setContinueList).catch(() => setContinueList([]))

    // Build personalized sections from favorites + watched.
    Promise.all([
      listFavorites(user.id),
      listByStatus(user.id, 'watched'),
    ]).then(async ([favs, watched]) => {
      const watchedIds = new Set(watched.map((t) => t.tmdb_id))

      // Recommendations: fetch from top 3 favorites for each media type separately.
      const movieFavs = favs.filter((t) => t.media_type === 'movie').slice(0, 3)
      const tvFavs = favs.filter((t) => t.media_type === 'tv').slice(0, 3)
      // If no TV favorites, fall back to top 2 from any type.
      const tvSources = tvFavs.length > 0 ? tvFavs : favs.slice(0, 2)
      const movieSources = movieFavs.length > 0 ? movieFavs : favs.slice(0, 2)

      const [movieRecs, tvRecs] = await Promise.all([
        movieSources.length > 0
          ? Promise.all(movieSources.map((t) => getRecommendations(t.media_type as TmdbType, t.tmdb_id)))
          : Promise.resolve([]),
        tvSources.length > 0
          ? Promise.all(tvSources.map((t) => getRecommendations('tv', t.tmdb_id)))
          : Promise.resolve([]),
      ])

      const seenMovies = new Set<number>()
      const allMovieRecs = dedup((movieRecs as MediaItem[][]).flat(), seenMovies, watchedIds)
      setRecFilms(allMovieRecs.filter((i) => i.mediaType === 'movie').slice(0, 20))

      const seenTv = new Set<number>()
      const allTvRecs = dedup((tvRecs as MediaItem[][]).flat(), seenTv, watchedIds)

      // Anime: Japanese animation (genre 16 + originalLanguage ja)
      const anime = allTvRecs.filter(
        (i) => i.originalLanguage === 'ja' && i.genreIds.includes(ANIME_GENRE_ID),
      )
      // Cartoni: non-Japanese animation (genre 16, other languages)
      const cartoni = allTvRecs.filter(
        (i) => i.genreIds.includes(ANIME_GENRE_ID) && i.originalLanguage !== 'ja',
      )
      // Serie: remaining TV (no animation genre)
      const serie = allTvRecs.filter((i) => !i.genreIds.includes(ANIME_GENRE_ID))

      setRecAnime(anime.slice(0, 20))
      setRecCartoni(cartoni.slice(0, 20))
      setRecSerie(serie.slice(0, 20))

      // Recent releases: use top genres from favorites + watched for personalization.
      const allTitles = [...favs, ...watched]
      const genres = topGenreIds(allTitles)
      const [movies, tv] = await Promise.all([
        getRecentReleases('movie', genres),
        getRecentReleases('tv', genres),
      ])
      setRecentMovies(movies.filter((m) => !watchedIds.has(m.id)).slice(0, 20))
      setRecentTv(tv.filter((t) => !watchedIds.has(t.id)).slice(0, 20))
    }).catch(() => {})
  }, [user])

  // Merge and interleave recent movies + tv for the "Nuove uscite" grid.
  const recentMixed = (() => {
    const out: MediaItem[] = []
    const len = Math.max(recentMovies.length, recentTv.length)
    for (let i = 0; i < len; i++) {
      if (recentMovies[i]) out.push(recentMovies[i])
      if (recentTv[i]) out.push(recentTv[i])
    }
    return out.slice(0, 20)
  })()

  return (
    <div>
      <PageHeader
        eyebrow="La tua sala"
        title="Bentornato al cinema"
        subtitle="I tuoi titoli e i suggerimenti su misura per te."
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

        {/* Resume watching */}
        {user && continueList.length > 0 && (
          <section>
            <SectionTitle icon="📺" title="Riprendi a guardare" />
            <ScrollRow>
              {continueList.map((c) => <ContinueCard key={c.tvId} c={c} />)}
            </ScrollRow>
          </section>
        )}

        {/* Personalized recommendations — split by type */}
        {user && recFilms.length > 0 && (
          <section>
            <SectionTitle icon="🎯" title="Film consigliati" />
            <RecRow items={recFilms} />
          </section>
        )}
        {user && recSerie.length > 0 && (
          <section>
            <SectionTitle icon="📺" title="Serie consigliate" />
            <RecRow items={recSerie} />
          </section>
        )}
        {user && recAnime.length > 0 && (
          <section>
            <SectionTitle icon="⛩️" title="Anime consigliati" />
            <RecRow items={recAnime} />
          </section>
        )}
        {user && recCartoni.length > 0 && (
          <section>
            <SectionTitle icon="🎨" title="Cartoni consigliati" />
            <RecRow items={recCartoni} />
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

        {/* Recent releases personalized by genre */}
        {user && recentMixed.length > 0 && (
          <section>
            <SectionTitle icon="🆕" title="Nuove uscite per te" />
            <MediaGrid items={recentMixed} />
          </section>
        )}

        {/* Empty state */}
        {user && watchlist.length === 0 && continueList.length === 0 && recFilms.length === 0 && recSerie.length === 0 && recAnime.length === 0 && recCartoni.length === 0 && (
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
