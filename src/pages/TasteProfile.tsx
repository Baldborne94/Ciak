import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { listAll } from '../lib/userTitles'
import { listDiary } from '../lib/diary'
import { getGenres, posterUrl } from '../lib/tmdb'
import type { DiaryEntry, MediaType, UserTitle } from '../lib/types'

const TYPE_LABELS: Record<string, string> = {
  movie: 'Film',
  tv: 'Serie TV',
  anime: 'Anime',
  cartoon: 'Cartoni',
}

function Bar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-sm text-zinc-300" title={label}>{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-theatre-800">
        <div className="h-full rounded-full bg-projector" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-semibold text-projector">
        {value}{suffix ?? ''}
      </span>
    </div>
  )
}

export default function TasteProfile() {
  const { user } = useAuth()
  const [rows, setRows] = useState<UserTitle[]>([])
  const [diary, setDiary] = useState<DiaryEntry[]>([])
  const [genreMap, setGenreMap] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([
      listAll(user.id),
      listDiary(user.id).catch(() => [] as DiaryEntry[]),
      getGenres('movie'),
      getGenres('tv'),
    ])
      .then(([titles, diaryEntries, gm, gt]) => {
        setRows(titles)
        setDiary(diaryEntries)
        const map = new Map<number, string>()
        for (const g of [...gm, ...gt]) map.set(g.id, g.name)
        setGenreMap(map)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  const stats = useMemo(() => {
    const watched = rows.filter((r) => r.status === 'watched')
    const favs = rows.filter((r) => r.is_favorite)

    // I voti vivono in due posti: user_titles (scheda titolo) e user_diary
    // (visioni registrate). Li uniamo per titolo: vale il voto della scheda,
    // altrimenti il voto del diario più recente.
    interface RatedItem {
      id: string
      tmdb_id: number
      media_type: MediaType
      title: string
      poster_path: string | null
      rating: number
    }
    const ratedByTitle = new Map<string, RatedItem>()
    const keyOf = (tmdbId: number, mediaType: string) => `${mediaType}:${tmdbId}`
    for (const e of diary) {
      // listDiary è ordinato dal più recente: la prima occorrenza vince.
      if (e.rating == null) continue
      const k = keyOf(e.tmdb_id, e.media_type)
      if (!ratedByTitle.has(k)) {
        ratedByTitle.set(k, {
          id: `diary-${e.id}`,
          tmdb_id: e.tmdb_id,
          media_type: e.media_type,
          title: e.title,
          poster_path: e.poster_path,
          rating: e.rating,
        })
      }
    }
    for (const r of rows) {
      if (r.personal_rating == null) continue
      ratedByTitle.set(keyOf(r.tmdb_id, r.media_type), {
        id: r.id,
        tmdb_id: r.tmdb_id,
        media_type: r.media_type,
        title: r.title,
        poster_path: r.poster_path,
        rating: r.personal_rating,
      })
    }
    const rated = [...ratedByTitle.values()]
    // Taste = watched + favorites
    const taste = rows.filter((r) => r.status === 'watched' || r.is_favorite)

    const genreCounts = new Map<number, number>()
    for (const r of taste) {
      for (const id of r.genre_ids ?? []) {
        genreCounts.set(id, (genreCounts.get(id) ?? 0) + 1)
      }
    }
    const topGenres = [...genreCounts.entries()]
      .map(([id, count]) => ({ name: genreMap.get(id) ?? `#${id}`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    const typeCounts = new Map<string, number>()
    for (const r of taste) typeCounts.set(r.media_type, (typeCounts.get(r.media_type) ?? 0) + 1)
    const types = [...typeCounts.entries()]
      .map(([t, count]) => ({ label: TYPE_LABELS[t] ?? t, count }))
      .sort((a, b) => b.count - a.count)

    const ratingDist = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: rated.filter((r) => r.rating === star).length,
    }))
    const avg =
      rated.length > 0 ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0

    const topRated = [...rated].sort((a, b) => b.rating - a.rating).slice(0, 10)

    return { watched, rated, favs, topGenres, types, ratingDist, avg, topRated }
  }, [rows, diary, genreMap])

  if (loading) return <Loader label="Analizzo i tuoi gusti…" />
  if (error) return <ErrorState title="Profilo non disponibile" message={error} />

  if (rows.length === 0 && diary.length === 0)
    return (
      <div>
        <PageHeader eyebrow="Su di te" title="Profilo di gusto" />
        <EmptyState
          title="Ancora nessun dato"
          message="Segna qualche titolo come visto e dai dei voti: qui costruirò il tuo profilo cinefilo."
          icon="📊"
        />
      </div>
    )

  const maxGenre = stats.topGenres[0]?.count ?? 1
  const maxType = stats.types[0]?.count ?? 1
  const maxRating = Math.max(1, ...stats.ratingDist.map((r) => r.count))

  return (
    <div>
      <PageHeader
        eyebrow="Su di te"
        title="Profilo di gusto"
        subtitle="Cosa raccontano i tuoi voti e i titoli che hai visto."
      />

      {/* Headline numbers */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Visti', value: stats.watched.length, icon: '🎬' },
          { label: 'Votati', value: stats.rated.length, icon: '⭐' },
          { label: 'Preferiti', value: stats.favs.length, icon: '❤️' },
          { label: 'Voto medio', value: stats.avg ? stats.avg.toFixed(1) : '—', icon: '📈' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-4">
            <div className="text-2xl">{s.icon}</div>
            <div className="mt-2 font-display text-3xl tracking-wide text-projector">{s.value}</div>
            <div className="text-xs text-zinc-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Top genres */}
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">🎭 Generi preferiti</h2>
          {stats.topGenres.length === 0 ? (
            <p className="text-sm text-zinc-500">Aggiungi titoli per scoprire i tuoi generi.</p>
          ) : (
            <div className="space-y-3">
              {stats.topGenres.map((g) => (
                <Bar key={g.name} label={g.name} value={g.count} max={maxGenre} />
              ))}
            </div>
          )}
        </section>

        {/* Content types */}
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">🍿 Cosa guardi</h2>
          <div className="space-y-3">
            {stats.types.map((t) => (
              <Bar key={t.label} label={t.label} value={t.count} max={maxType} />
            ))}
          </div>
        </section>

        {/* Rating distribution */}
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">⭐ Come voti</h2>
          <div className="space-y-3">
            {stats.ratingDist.map((r) => (
              <Bar key={r.star} label={'★'.repeat(r.star)} value={r.count} max={maxRating} />
            ))}
          </div>
        </section>
      </div>

      {/* Top rated titles */}
      {stats.topRated.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
            🏅 I tuoi titoli col voto più alto
          </h2>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {stats.topRated.map((r) => {
              const poster = posterUrl(r.poster_path)
              const type = r.media_type === 'movie' ? 'movie' : 'tv'
              return (
                <Link
                  key={r.id}
                  to={`/title/${type}/${r.tmdb_id}`}
                  className="group overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40"
                >
                  <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
                    {poster ? (
                      <img src={poster} alt={r.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-1 text-xs font-semibold text-zinc-100">{r.title}</p>
                    <p className="text-xs text-projector">{'★'.repeat(r.rating)}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
