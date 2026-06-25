import { supabase } from './supabase'
import { getDetail } from './tmdb'
import type { MediaDetail, TmdbType } from './types'

// Statistiche cinefile: aggregano ciò che hai guardato (user_titles "watched" +
// user_diary) arricchendolo con i dettagli TMDB (durata, anno, generi, regista,
// cast). I conteggi grezzi vengono dal DB; il resto dai dettagli, che mettiamo
// in cache in memoria per non rifare le chiamate ad ogni apertura della pagina.

function client() {
  if (!supabase) {
    throw new Error('Supabase non è configurato. Imposta le chiavi nel file .env.')
  }
  return supabase
}

export interface CountItem {
  name: string
  count: number
}

export interface DecadeBucket {
  decade: number // es. 1990
  count: number
}

export interface YearInFilm {
  year: number
  count: number
  avgRating: number | null
  movies: number
  series: number
  fiveStars: number // quanti capolavori personali (voto pieno) quell'anno
}

export interface CinemaStats {
  totalTitles: number
  movies: number
  series: number
  filmHours: number // ore stimate solo dai film (durata affidabile)
  ratedCount: number
  avgRating: number | null
  ratingHistogram: { half: number; count: number }[] // 0.5 → 5
  topGenres: CountItem[]
  topDirectors: CountItem[]
  topActors: CountItem[]
  decades: DecadeBucket[]
  yearsInFilm: YearInFilm[]
  enrichedCount: number // quanti titoli sono stati arricchiti via TMDB
  cappedAt: number | null // se abbiamo limitato i titoli arricchiti
}

interface WatchedRef {
  tmdbId: number
  type: TmdbType
  title: string
  rating: number | null
  // anno di visione (dal diario) se disponibile, per "il tuo anno in film"
  watchedYear: number | null
}

// Cache dei dettagli TMDB per id+tipo, condivisa tra le aperture della pagina.
const detailCache = new Map<string, MediaDetail | null>()

async function detailOf(type: TmdbType, id: number): Promise<MediaDetail | null> {
  const key = `${type}:${id}`
  if (detailCache.has(key)) return detailCache.get(key)!
  try {
    const d = await getDetail(type, id)
    detailCache.set(key, d)
    return d
  } catch {
    detailCache.set(key, null)
    return null
  }
}

// Limite di titoli da arricchire via TMDB: protegge da raffiche di richieste su
// librerie enormi. I conteggi grezzi (film/serie/voti) restano completi.
const ENRICH_CAP = 200

function toTmdbType(media: string): TmdbType {
  return media === 'movie' ? 'movie' : 'tv'
}

export async function computeStats(userId: string): Promise<CinemaStats> {
  const db = client()

  const [titlesRes, diaryRes] = await Promise.all([
    db
      .from('user_titles')
      .select('tmdb_id, media_type, title, personal_rating')
      .eq('user_id', userId)
      .eq('status', 'watched'),
    db
      .from('user_diary')
      .select('tmdb_id, media_type, title, rating, watched_on')
      .eq('user_id', userId),
  ])
  if (titlesRes.error) throw new Error(titlesRes.error.message)
  if (diaryRes.error) throw new Error(diaryRes.error.message)

  const titles = (titlesRes.data ?? []) as {
    tmdb_id: number
    media_type: string
    title: string
    personal_rating: number | null
  }[]
  const diary = (diaryRes.data ?? []) as {
    tmdb_id: number
    media_type: string
    title: string
    rating: number | null
    watched_on: string
  }[]

  // Unisci diario + visti in un set di riferimenti unici (chiave id:tipo). Per il
  // voto preferiamo il diario (più recente e specifico per visione); l'anno di
  // visione viene dalla data del diario.
  const byKey = new Map<string, WatchedRef>()
  for (const t of titles) {
    const type = toTmdbType(t.media_type)
    byKey.set(`${type}:${t.tmdb_id}`, {
      tmdbId: t.tmdb_id,
      type,
      title: t.title,
      rating: t.personal_rating,
      watchedYear: null,
    })
  }
  for (const d of diary) {
    const type = toTmdbType(d.media_type)
    const key = `${type}:${d.tmdb_id}`
    const year = Number(d.watched_on.slice(0, 4)) || null
    const existing = byKey.get(key)
    if (existing) {
      if (d.rating != null) existing.rating = d.rating
      // tieni l'anno di visione più recente
      if (year && (!existing.watchedYear || year > existing.watchedYear)) {
        existing.watchedYear = year
      }
    } else {
      byKey.set(key, { tmdbId: d.tmdb_id, type, title: d.title, rating: d.rating, watchedYear: year })
    }
  }

  const refs = [...byKey.values()]
  const movies = refs.filter((r) => r.type === 'movie').length
  const series = refs.length - movies

  // Istogramma voti + media (su tutti i titoli che hanno un voto).
  const rated = refs.filter((r) => r.rating != null) as (WatchedRef & { rating: number })[]
  const ratingHistogram = Array.from({ length: 10 }, (_, i) => {
    const half = (i + 1) * 0.5
    return { half, count: rated.filter((r) => r.rating === half).length }
  })
  const avgRating = rated.length
    ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 100) / 100
    : null

  // Arricchimento via TMDB (con cap). I titoli oltre il cap restano nei conteggi
  // grezzi ma non in generi/registi/decenni/ore.
  const toEnrich = refs.slice(0, ENRICH_CAP)
  const details = await Promise.all(toEnrich.map((r) => detailOf(r.type, r.tmdbId)))

  const genreCount = new Map<string, number>()
  const directorCount = new Map<string, number>()
  const actorCount = new Map<string, number>()
  const decadeCount = new Map<number, number>()
  let filmMinutes = 0
  let enrichedCount = 0

  details.forEach((d, i) => {
    if (!d) return
    enrichedCount++
    const ref = toEnrich[i]
    for (const g of d.genres) genreCount.set(g.name, (genreCount.get(g.name) ?? 0) + 1)
    for (const name of d.directors) directorCount.set(name, (directorCount.get(name) ?? 0) + 1)
    for (const c of d.cast.slice(0, 5)) actorCount.set(c.name, (actorCount.get(c.name) ?? 0) + 1)
    if (ref.type === 'movie' && d.runtime) filmMinutes += d.runtime
    const year = d.releaseDate ? Number(d.releaseDate.slice(0, 4)) : NaN
    if (!Number.isNaN(year) && year > 1870) {
      const decade = Math.floor(year / 10) * 10
      decadeCount.set(decade, (decadeCount.get(decade) ?? 0) + 1)
    }
  })

  const topN = (m: Map<string, number>, n: number): CountItem[] =>
    [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, n)

  const decades = [...decadeCount.entries()]
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => a.decade - b.decade)

  // "Il tuo anno in film": recap per anno di visione (non duplica l'istogramma
  // globale dei voti, ma riassume volume e composizione dell'anno).
  const yearMap = new Map<
    number,
    { count: number; sum: number; rated: number; movies: number; series: number; fives: number }
  >()
  for (const r of refs) {
    if (!r.watchedYear) continue
    const y = yearMap.get(r.watchedYear) ?? { count: 0, sum: 0, rated: 0, movies: 0, series: 0, fives: 0 }
    y.count++
    if (r.type === 'movie') y.movies++
    else y.series++
    if (r.rating != null) {
      y.sum += r.rating
      y.rated++
      if (r.rating === 5) y.fives++
    }
    yearMap.set(r.watchedYear, y)
  }
  const yearsInFilm: YearInFilm[] = [...yearMap.entries()]
    .map(([year, v]) => ({
      year,
      count: v.count,
      avgRating: v.rated ? Math.round((v.sum / v.rated) * 100) / 100 : null,
      movies: v.movies,
      series: v.series,
      fiveStars: v.fives,
    }))
    .sort((a, b) => b.year - a.year)

  return {
    totalTitles: refs.length,
    movies,
    series,
    filmHours: Math.round(filmMinutes / 60),
    ratedCount: rated.length,
    avgRating,
    ratingHistogram,
    topGenres: topN(genreCount, 8),
    topDirectors: topN(directorCount, 8),
    topActors: topN(actorCount, 10),
    decades,
    yearsInFilm,
    enrichedCount,
    cappedAt: refs.length > ENRICH_CAP ? ENRICH_CAP : null,
  }
}
