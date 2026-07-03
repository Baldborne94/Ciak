import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import { ScrollRow } from '../components/MediaRow'
import MediaGrid from '../components/MediaGrid'
import { posterUrl, getRecommendations, getRecentReleases, discoverByGenres } from '../lib/tmdb'
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

const ANIME_GENRE_ID = 16

// Genre frequency map: favorites count double (stronger signal), watched once.
function genreWeights(favs: UserTitle[], watched: UserTitle[]): Map<number, number> {
  const w = new Map<number, number>()
  for (const t of favs) for (const g of t.genre_ids ?? []) w.set(g, (w.get(g) ?? 0) + 2)
  for (const t of watched) for (const g of t.genre_ids ?? []) w.set(g, (w.get(g) ?? 0) + 1)
  return w
}

// Score a candidate by genre affinity + quality (vote average as tiebreaker).
function scoreItem(item: MediaItem, weights: Map<number, number>): number {
  return item.genreIds.reduce((s, g) => s + (weights.get(g) ?? 0), 0) + item.voteAverage * 0.5
}

// Top genre IDs weighted by user taste (for recent releases and discover fallback).
function topGenreIds(favs: UserTitle[], watched: UserTitle[], limit = 3): number[] {
  const w = genreWeights(favs, watched)
  return [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
}

// Seeds: favorites + high-rated watched (≥4 stars) for a given media type,
// sorted by composite score, deduplicated, capped at 6 per type.
function buildSeeds(favs: UserTitle[], watched: UserTitle[], type: TmdbType): UserTitle[] {
  const highRated = watched.filter((t) => t.media_type === type && (t.personal_rating ?? 0) >= 4)
  const favsByType = favs.filter((t) => t.media_type === type)
  const seen = new Set<number>()
  const merged: UserTitle[] = []
  for (const t of [...favsByType, ...highRated]) {
    if (!seen.has(t.tmdb_id)) { seen.add(t.tmdb_id); merged.push(t) }
  }
  return merged
    .map((t) => ({ t, score: (t.is_favorite ? 3 : 0) + (t.personal_rating ?? 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ t }) => t)
}

function dedup(items: MediaItem[], seen: Set<number>, watchedIds: Set<number>): MediaItem[] {
  const out: MediaItem[] = []
  for (const item of items) {
    if (!seen.has(item.id) && !watchedIds.has(item.id)) { seen.add(item.id); out.push(item) }
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
      const weights = genreWeights(favs, watched)

      // Seeds: favorites + high-rated watched (≥4★), up to 6 per type.
      const movieSeeds = buildSeeds(favs, watched, 'movie')
      const tvSeeds = buildSeeds(favs, watched, 'tv')

      // Fetch TMDB recommendations for each seed in parallel.
      const [rawMovieRecs, rawTvRecs] = await Promise.all([
        movieSeeds.length > 0
          ? Promise.all(movieSeeds.map((t) => getRecommendations('movie', t.tmdb_id)))
          : Promise.resolve([[] as MediaItem[]]),
        tvSeeds.length > 0
          ? Promise.all(tvSeeds.map((t) => getRecommendations('tv', t.tmdb_id)))
          : Promise.resolve([[] as MediaItem[]]),
      ])

      // Flatten, dedup, filter watched, then sort by genre-affinity score.
      const seenMovies = new Set<number>()
      const topMovies = dedup(rawMovieRecs.flat(), seenMovies, watchedIds)
        .sort((a, b) => scoreItem(b, weights) - scoreItem(a, weights))

      const seenTv = new Set<number>()
      const topTv = dedup(rawTvRecs.flat(), seenTv, watchedIds)
        .sort((a, b) => scoreItem(b, weights) - scoreItem(a, weights))

      // Genre-discover fallback: if seed recs are thin, fill from top genres.
      const topGenres = topGenreIds(favs, watched, 3)
      const MIN = 8

      let films = topMovies.filter((i) => i.mediaType === 'movie')
      if (films.length < MIN && topGenres.length > 0) {
        const fallback = await discoverByGenres('movie', topGenres)
        const extra = dedup(fallback, seenMovies, watchedIds)
          .sort((a, b) => scoreItem(b, weights) - scoreItem(a, weights))
        films = [...films, ...extra]
      }
      setRecFilms(films.slice(0, 20))

      const anime = topTv.filter((i) => i.originalLanguage === 'ja' && i.genreIds.includes(ANIME_GENRE_ID))
      const cartoni = topTv.filter((i) => i.genreIds.includes(ANIME_GENRE_ID) && i.originalLanguage !== 'ja')
      let serie = topTv.filter((i) => !i.genreIds.includes(ANIME_GENRE_ID))

      if (serie.length < MIN && topGenres.length > 0) {
        const fallback = await discoverByGenres('tv', topGenres)
        const extra = dedup(fallback, seenTv, watchedIds)
          .filter((i) => !i.genreIds.includes(ANIME_GENRE_ID))
          .sort((a, b) => scoreItem(b, weights) - scoreItem(a, weights))
        serie = [...serie, ...extra]
      }

      setRecAnime(anime.slice(0, 20))
      setRecCartoni(cartoni.slice(0, 20))
      setRecSerie(serie.slice(0, 20))

      // Recent releases: top genres from favorites + watched.
      const genres = topGenreIds(favs, watched, 3)
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
