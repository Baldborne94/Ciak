import { tmdbFetch } from './client'
import { normalise, type RawMedia } from './raw'
import { patchReadableTitles, isReadableTitle } from './titles'
import { discoverReadable, browseSortParam, type BrowseSort } from './discover'
import type { Genre, MediaItem, TmdbType } from '../types'

export async function getTrending(): Promise<MediaItem[]> {
  const [data, enData] = await Promise.all([
    tmdbFetch<{ results: RawMedia[] }>('/trending/all/week'),
    tmdbFetch<{ results: RawMedia[] }>('/trending/all/week', { language: 'en-US' }),
  ])
  patchReadableTitles(data.results, enData.results)
  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => normalise(r))
}

export async function searchMulti(query: string): Promise<MediaItem[]> {
  if (!query.trim()) return []

  // TMDB indexes titles differently per language: an Italian title may match
  // only with language=it-IT, an English one only with en-US. Query both and
  // merge so the user finds a title regardless of the language they type.
  const [itData, enData] = await Promise.all([
    tmdbFetch<{ results: RawMedia[] }>('/search/multi', {
      query,
      include_adult: 'false',
      language: 'it-IT',
    }),
    tmdbFetch<{ results: RawMedia[] }>('/search/multi', {
      query,
      include_adult: 'false',
      language: 'en-US',
    }),
  ])

  // Merge IT + EN, de-duplicate, then surface the most prominent titles first
  // (TMDB popularity) so well-known results lead instead of obscure namesakes.
  const merged = new Map<string, { item: MediaItem; pop: number }>()
  for (const raw of [...itData.results, ...enData.results]) {
    if (raw.media_type !== 'movie' && raw.media_type !== 'tv') continue
    const key = `${raw.media_type}-${raw.id}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { item: normalise(raw), pop: raw.popularity ?? 0 })
    } else if (!isReadableTitle(existing.item.title) && isReadableTitle(raw.title ?? raw.name)) {
      // La variante it-IT può tornare un titolo in script non leggibile
      // (cirillico, CJK…): se quella en-US è leggibile, preferiamo questa.
      merged.set(key, { item: normalise(raw), pop: existing.pop })
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.pop - a.pop)
    .map((e) => e.item)
}

// TMDB leaves several TV genres in English even with language=it-IT; override
// those by their (stable) genre id so the UI is fully Italian.
const GENRE_IT: Record<number, string> = {
  10759: 'Azione e Avventura',
  10762: 'Per bambini',
  10763: 'Notiziari',
  10764: 'Reality',
  10765: 'Fantascienza e Fantasy',
  10766: 'Soap opera',
  10767: 'Talk show',
  10768: 'Guerra e Politica',
  80: 'Poliziesco',
}

export async function getGenres(type: TmdbType): Promise<Genre[]> {
  const data = await tmdbFetch<{ genres: Genre[] }>(`/genre/${type}/list`)
  return data.genres.map((g) => (GENRE_IT[g.id] ? { ...g, name: GENRE_IT[g.id] } : g))
}

// Resolve the TMDB keyword IDs for "suggestive" tags once, then cache. Broad
// on purpose: anything that hints at ecchi/fan-service goes to "Pervertito".
const SUGGESTIVE_KEYWORDS = [
  'ecchi',
  'fan service',
  'harem',
  'nudity',
  'sexualization',
  'swimsuit',
  'bikini',
  'panty shot',
  'voyeurism',
  'erotic',
  'pervert',
  'sexual content',
]
let suggestiveIdsCache: string[] | null = null

async function getSuggestiveKeywordIds(): Promise<string[]> {
  if (suggestiveIdsCache) return suggestiveIdsCache
  try {
    const results = await Promise.all(
      SUGGESTIVE_KEYWORDS.map((q) =>
        tmdbFetch<{ results: { id: number }[] }>('/search/keyword', { query: q })
          .then((d) => d.results.slice(0, 3).map((r) => String(r.id)))
          .catch(() => []),
      ),
    )
    suggestiveIdsCache = [...new Set(results.flat())]
  } catch {
    suggestiveIdsCache = []
  }
  return suggestiveIdsCache
}

export async function getAnime(
  page = 1,
  genreId?: number,
  sort?: BrowseSort,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const suggestive = await getSuggestiveKeywordIds()
  return discoverReadable('tv', {
    // Animation (16) AND, optionally, a second genre to browse by (comma = AND).
    with_genres: genreId ? `16,${genreId}` : '16',
    with_original_language: 'ja',
    sort_by: browseSortParam(sort),
    include_adult: 'false',
    // Escludi hentai (198385) e tutto ciò che è ecchi/sus → va in "Pervertito".
    without_keywords: ['198385', ...suggestive].join(','),
    'vote_count.gte': '10',
    page: String(page),
  })
}

// The "Pervertito" corner: ecchi / fan-service AND hentai anime.
export async function getPervertitoAnime(
  page = 1,
  sort?: BrowseSort,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const suggestive = await getSuggestiveKeywordIds()
  const keywords = [...suggestive, '198385'] // ecchi/sus + hentai
  return discoverReadable('tv', {
    with_genres: '16',
    with_original_language: 'ja',
    with_keywords: keywords.join('|'), // ha almeno un keyword ecchi/hentai
    include_adult: 'true', // necessario per mostrare gli hentai
    sort_by: browseSortParam(sort),
    'vote_count.gte': '5',
    page: String(page),
  })
}

// Western animated TV series (Scooby-Doo, Tom & Jerry, …): genre Animation,
// English original language to exclude Japanese anime.
export async function getCartoons(
  page = 1,
  genreId?: number,
  sort?: BrowseSort,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  return discoverReadable('tv', {
    with_genres: genreId ? `16,${genreId}` : '16',
    with_original_language: 'en',
    sort_by: browseSortParam(sort),
    'vote_count.gte': '20',
    page: String(page),
  })
}

// Resolve AI text suggestions ({title}) to real TMDB items with posters.
export async function resolveSuggestions(
  titles: string[],
): Promise<MediaItem[]> {
  const found = await Promise.all(
    titles.map(async (t) => {
      try {
        const results = await searchMulti(t)
        return results[0] ?? null
      } catch {
        return null
      }
    }),
  )
  const seen = new Set<string>()
  const items: MediaItem[] = []
  for (const item of found) {
    if (!item) continue
    const key = `${item.mediaType}-${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return items
}

// Upcoming releases (future-dated) — movies + TV, by popularity. Used to build
// the personalised "In arrivo per te" feed (ranked client-side by user taste).
export async function getUpcoming(): Promise<MediaItem[]> {
  const today = new Date().toISOString().slice(0, 10)
  const movieParams = {
    'primary_release_date.gte': today,
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_count.gte': '0',
    page: '1',
  }
  const tvParams = {
    'first_air_date.gte': today,
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: '1',
  }
  const [mv, tv] = await Promise.all([
    discoverReadable('movie', movieParams),
    discoverReadable('tv', tvParams),
  ])
  return [...mv.items, ...tv.items].filter((i) => i.releaseDate && i.releaseDate >= today)
}

export interface DiscoverFilters {
  year?: string
  language?: string
  country?: string
  minVote?: string
  // Id di keyword TMDB per il sottogenere: in OR fra loro (un titolo basta che
  // abbia una delle varianti, es. "world war ii" oppure "wwii").
  keywordIds?: string[]
}

// Nome di keyword → id TMDB. La ricerca costa una chiamata, quindi la memorizziamo
// per tutta la sessione: i sottogeneri sono pochi e ricorrenti.
const keywordIdCache = new Map<string, string | null>()

// Risolve nomi di keyword ("anti-war") negli id numerici che /discover accetta.
// I nomi che TMDB non conosce vengono semplicemente saltati.
export async function resolveKeywordIds(names: string[]): Promise<string[]> {
  const found = await Promise.all(
    names.map(async (name) => {
      const key = name.toLowerCase()
      const cached = keywordIdCache.get(key)
      if (cached !== undefined) return cached
      try {
        const data = await tmdbFetch<{ results: { id: number; name: string }[] }>(
          '/search/keyword',
          { query: name },
        )
        // Preferiamo la corrispondenza esatta: cercando "spy" TMDB propone anche
        // decine di keyword che contengono la parola ma dicono altro.
        const exact = data.results.find((r) => r.name.toLowerCase() === key)
        const id = exact ? String(exact.id) : (data.results[0] ? String(data.results[0].id) : null)
        keywordIdCache.set(key, id)
        return id
      } catch {
        keywordIdCache.set(key, null)
        return null
      }
    }),
  )
  return found.filter((id): id is string => id !== null)
}

export async function discoverByGenre(
  type: TmdbType,
  genreId: number,
  page = 1,
  sortBy = 'popularity.desc',
  filters: DiscoverFilters = {},
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const params: Record<string, string> = {
    with_genres: String(genreId),
    sort_by: sortBy,
    page: String(page),
    // Require a minimum vote count so rating-based filters/sorts aren't skewed by
    // titles with a handful of votes; bump it when filtering by minimum rating.
    'vote_count.gte': sortBy.startsWith('vote_average') || filters.minVote ? '200' : '0',
  }
  if (filters.year) {
    params[type === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = filters.year
  }
  if (filters.language) params.with_original_language = filters.language
  if (filters.country) params.with_origin_country = filters.country
  if (filters.minVote) params['vote_average.gte'] = filters.minVote
  if (filters.keywordIds?.length) params.with_keywords = filters.keywordIds.join('|')

  return discoverReadable(type, params)
}

// Genre-based discover (no date filter) — used as recommendation fallback when
// seed-based recs don't produce enough results for a section.
export async function discoverByGenres(
  type: TmdbType,
  genreIds: number[] = [],
): Promise<MediaItem[]> {
  if (genreIds.length === 0) return []
  const params = {
    sort_by: 'vote_average.desc',
    'vote_count.gte': '200',
    with_genres: genreIds.slice(0, 3).join('|'),
    page: '1',
  }
  const [data, enData] = await Promise.all([
    tmdbFetch<{ results: RawMedia[] }>(`/discover/${type}`, params),
    tmdbFetch<{ results: RawMedia[] }>(`/discover/${type}`, { ...params, language: 'en-US' }),
  ])
  patchReadableTitles(data.results, enData.results)
  return (data.results ?? []).slice(0, 20).map((r) => normalise(r, type))
}

// Recent popular releases (last 90 days) for "Nuove uscite" on Dashboard.
export async function getRecentReleases(
  type: TmdbType,
  genreIds: number[] = [],
): Promise<MediaItem[]> {
  const since = new Date()
  since.setDate(since.getDate() - 90)
  const dateStr = since.toISOString().slice(0, 10)
  const params: Record<string, string> = {
    sort_by: 'popularity.desc',
    [`${type === 'movie' ? 'primary_release_date' : 'first_air_date'}.gte`]: dateStr,
    'vote_count.gte': '20',
    page: '1',
  }
  if (genreIds.length > 0) params.with_genres = genreIds.slice(0, 3).join('|')
  const [data, enData] = await Promise.all([
    tmdbFetch<{ results: RawMedia[] }>(`/discover/${type}`, params),
    tmdbFetch<{ results: RawMedia[] }>(`/discover/${type}`, { ...params, language: 'en-US' }),
  ])
  patchReadableTitles(data.results, enData.results)
  return (data.results ?? []).slice(0, 20).map((r) => normalise(r, type))
}
