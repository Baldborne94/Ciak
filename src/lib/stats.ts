import { supabase } from './supabase'
import { fetchAllRows } from './paged'
import { computeWatchRhythm, type WatchRhythm } from './watchRhythm'
import { mapLimit } from './mapLimit'
import { cacheFacts, factsKey, getCachedFacts } from './titleFactsCache'
import { fetchTitleFacts } from './tmdb'
import type { TitleFacts, TmdbType } from './types'

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
  filmHours: number // ore stimate dai film
  seriesHours: number // ore stimate dagli episodi segnati × durata episodio
  ratedCount: number
  avgRating: number | null
  ratingHistogram: { half: number; count: number }[] // 0.5 → 5
  topGenres: CountItem[]
  topDirectors: CountItem[]
  topActors: CountItem[]
  decades: DecadeBucket[]
  yearsInFilm: YearInFilm[]
  rhythm: WatchRhythm // quando guardi: mesi, anno su anno, giorni di fila
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

// Tetto di sicurezza sui titoli da analizzare. Non è più il collo di bottiglia
// di prima (era 200): con la lettura leggera e la cache, una collezione normale
// ci sta dentro tutta.
const ENRICH_CAP = 3000

function toTmdbType(media: string): TmdbType {
  return media === 'movie' ? 'movie' : 'tv'
}

export async function computeStats(userId: string): Promise<CinemaStats> {
  const db = client()

  // Paginate: PostgREST taglia ogni risposta a max_rows (1000) senza dirlo, e
  // qui i totali DEVONO essere esatti — una pagina di statistiche che
  // sottostima in silenzio è peggio di una che non c'è.
  const [titles, diary, episodes] = await Promise.all([
    fetchAllRows<{
      tmdb_id: number
      media_type: string
      title: string
      personal_rating: number | null
    }>((from, to) =>
      db
        .from('user_titles')
        .select('tmdb_id, media_type, title, personal_rating')
        .eq('user_id', userId)
        .eq('status', 'watched')
        .order('tmdb_id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{
      tmdb_id: number
      media_type: string
      title: string
      rating: number | null
      watched_on: string
    }>((from, to) =>
      db
        .from('user_diary')
        .select('tmdb_id, media_type, title, rating, watched_on')
        .eq('user_id', userId)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // Episodi visti: servono per contare le ore delle serie, che finora non
    // entravano nel totale (solo i film avevano una durata).
    fetchAllRows<{ tv_id: number }>((from, to) =>
      db
        .from('user_episodes')
        .select('tv_id')
        .eq('user_id', userId)
        .order('tv_id', { ascending: true })
        .range(from, to),
    ).catch(() => [] as { tv_id: number }[]),
  ])

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

  // Arricchimento via TMDB. Il tetto era di 200 titoli perché ogni titolo
  // costava TRE richieste pesanti (getDetail porta con sé raccomandazioni,
  // video, provider, traduzioni). Con una lettura leggera — una richiesta, solo
  // i campi che servono — e una cache su disco, l'intera collezione diventa
  // analizzabile: il tetto resta solo come difesa contro casi estremi.
  const toEnrich = refs.slice(0, ENRICH_CAP)
  const cached = getCachedFacts(toEnrich.map((r) => factsKey(r.type, r.tmdbId)))
  const daChiedere = toEnrich.filter((r) => !cached.has(factsKey(r.type, r.tmdbId)))

  // Sei richieste per volta: senza tetto, seicento titoli aprirebbero seicento
  // richieste insieme e TMDB inizierebbe a rispondere 429.
  const nuovi = new Map<string, TitleFacts>()
  await mapLimit(daChiedere, 6, async (r) => {
    try {
      nuovi.set(factsKey(r.type, r.tmdbId), await fetchTitleFacts(r.type, r.tmdbId))
    } catch {
      // Un titolo che non risponde non deve far fallire tutta la pagina.
    }
  })
  cacheFacts(nuovi)

  const details = toEnrich.map(
    (r) => cached.get(factsKey(r.type, r.tmdbId)) ?? nuovi.get(factsKey(r.type, r.tmdbId)) ?? null,
  )

  const genreCount = new Map<string, number>()
  const directorCount = new Map<string, number>()
  const actorCount = new Map<string, number>()
  const decadeCount = new Map<number, number>()
  let filmMinutes = 0
  let seriesMinutes = 0
  let enrichedCount = 0

  // Quanti episodi hai visto per ogni serie: moltiplicati per la durata di un
  // episodio danno le ore di serie, che prima non entravano nel totale.
  const episodesByTv = new Map<number, number>()
  for (const e of episodes) episodesByTv.set(e.tv_id, (episodesByTv.get(e.tv_id) ?? 0) + 1)

  details.forEach((d, i) => {
    if (!d) return
    enrichedCount++
    const ref = toEnrich[i]
    for (const g of d.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
    for (const dir of d.directors) directorCount.set(dir, (directorCount.get(dir) ?? 0) + 1)
    for (const c of d.cast) actorCount.set(c, (actorCount.get(c) ?? 0) + 1)
    if (ref.type === 'movie' && d.runtime) filmMinutes += d.runtime
    // Per una serie `runtime` è la durata di UN episodio. Se hai segnato i
    // singoli episodi contiamo quelli; altrimenti la serie risulta vista per
    // intero, e il totale della serie è la stima migliore che abbiamo — meglio
    // di zero, che era la risposta di prima per chiunque non tracci episodi.
    if (ref.type === 'tv' && d.runtime) {
      const segnati = episodesByTv.get(ref.tmdbId) ?? 0
      seriesMinutes += d.runtime * (segnati > 0 ? segnati : (d.episodes ?? 0))
    }
    const year = d.year ?? NaN
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
    seriesHours: Math.round(seriesMinutes / 60),
    rhythm: computeWatchRhythm(diary),
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
