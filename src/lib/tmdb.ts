import type {
  CastMember,
  Collection,
  CollectionDetail,
  Company,
  CrewMember,
  Genre,
  Episode,
  MediaDetail,
  MediaItem,
  Person,
  PersonDetail,
  Provider,
  TmdbType,
  WatchProviders,
} from './types'

const API_BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p'

const apiKey = import.meta.env.VITE_TMDB_API_KEY

export const isTmdbConfigured = Boolean(apiKey)

export function posterUrl(
  path: string | null,
  size: 'w185' | 'w342' | 'w500' = 'w342',
): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null
}

export function backdropUrl(
  path: string | null,
  size: 'w780' | 'w1280' | 'original' = 'w1280',
): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null
}

export function profileUrl(path: string | null): string | null {
  return path ? `${IMG_BASE}/w185${path}` : null
}

// Languages written in Latin script — readable as-is. For everything else
// (Japanese, Korean, Chinese, …) the original title isn't useful, so we fall
// back to the localized (Italian/English) title.
const LATIN_LANGS = new Set([
  'en', 'it', 'es', 'fr', 'de', 'pt', 'nl', 'sv', 'da', 'no', 'fi', 'pl',
  'cs', 'hu', 'ro', 'tr', 'id', 'vi', 'ca', 'hr', 'sk', 'sl', 'et', 'lv',
  'lt', 'is', 'ga', 'eu', 'gl', 'af', 'sw', 'ms', 'tl',
])

// True when the string is in a script we can read (no CJK, Hangul, Thai,
// Arabic, Cyrillic, Hebrew, Devanagari, kana…).
// eslint-disable-next-line no-misleading-character-class
const NON_LATIN_SCRIPTS = new RegExp('[\\u0400-\\u05FF\\u0600-\\u06FF\\u0900-\\u097F\\u0E00-\\u0E7F\\u3000-\\u30FF\\u3400-\\u9FFF\\uAC00-\\uD7AF]')
export function isReadableTitle(s: string | null | undefined): boolean {
  if (!s) return false
  // Reject Cyrillic/Hebrew, Arabic, Devanagari, Thai, CJK punct + kana, CJK, Hangul.
  return !NON_LATIN_SCRIPTS.test(s)
}

// The best title to show: original if it's in a readable script, otherwise
// the localized one — and never a non-readable script when a readable
// alternative exists (so anime/foreign titles show their IT/EN name).
export function displayTitle(item: {
  title: string
  originalTitle: string | null
  originalLanguage: string | null
}): string {
  if (item.originalTitle && item.originalLanguage && LATIN_LANGS.has(item.originalLanguage)) {
    return item.originalTitle
  }
  if (isReadableTitle(item.title)) return item.title
  if (isReadableTitle(item.originalTitle)) return item.originalTitle as string
  return item.title || item.originalTitle || 'Senza titolo'
}

export function logoUrl(path: string | null): string | null {
  return path ? `${IMG_BASE}/w154${path}` : null
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  if (!apiKey) {
    throw new Error(
      'TMDB non è configurato. Imposta VITE_TMDB_API_KEY nel file .env.',
    )
  }

  const url = new URL(`${API_BASE}${path}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', 'it-IT')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`Errore TMDB (${res.status}). Riprova più tardi.`)
  }
  return res.json() as Promise<T>
}

// ── Normalisers ──────────────────────────────────────────────────────────

interface RawMedia {
  id: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  vote_count?: number
  popularity?: number
  genre_ids?: number[]
  original_language?: string
}

function normalise(raw: RawMedia, fallbackType?: TmdbType): MediaItem {
  const mediaType: TmdbType =
    raw.media_type === 'tv' || raw.media_type === 'movie'
      ? raw.media_type
      : (fallbackType ?? 'movie')

  return {
    id: raw.id,
    mediaType,
    title: raw.title ?? raw.name ?? 'Senza titolo',
    originalTitle: raw.original_title ?? raw.original_name ?? null,
    overview: raw.overview ?? '',
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    releaseDate: raw.release_date ?? raw.first_air_date ?? null,
    voteAverage: raw.vote_average ?? 0,
    genreIds: raw.genre_ids ?? [],
    originalLanguage: raw.original_language ?? null,
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export async function getTrending(): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: RawMedia[] }>('/trending/all/week')
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

export async function getGenres(type: TmdbType): Promise<Genre[]> {
  const data = await tmdbFetch<{ genres: Genre[] }>(`/genre/${type}/list`)
  return data.genres
}

interface RawCredits {
  cast?: {
    id: number
    name: string
    character?: string
    profile_path?: string | null
  }[]
  crew?: {
    id: number
    name: string
    job?: string
    profile_path?: string | null
  }[]
}

interface RawCompany {
  id: number
  name: string
  logo_path?: string | null
}

interface RawDetail extends RawMedia {
  genres?: Genre[]
  runtime?: number
  episode_run_time?: number[]
  tagline?: string
  credits?: RawCredits
  recommendations?: { results: RawMedia[] }
  original_title?: string
  original_name?: string
  original_language?: string
  status?: string
  production_companies?: RawCompany[]
  production_countries?: { iso_3166_1: string; name: string }[]
  budget?: number
  revenue?: number
  homepage?: string
  number_of_seasons?: number
  number_of_episodes?: number
  created_by?: { id: number; name: string }[]
  videos?: { results: RawVideo[] }
  'watch/providers'?: { results: Record<string, RawWatchRegion> }
  seasons?: RawSeason[]
  belongs_to_collection?: { id: number; name: string; poster_path?: string | null } | null
  translations?: {
    translations?: {
      iso_639_1?: string
      data?: { title?: string; name?: string; overview?: string }
    }[]
  }
}

interface RawSeason {
  id: number
  season_number: number
  name: string
  episode_count?: number
  air_date?: string | null
  poster_path?: string | null
  overview?: string
}

interface RawEpisode {
  id: number
  episode_number: number
  name: string
  overview?: string
  air_date?: string | null
  runtime?: number | null
  vote_average?: number
  still_path?: string | null
}

interface RawVideo {
  key: string
  site: string
  type: string
  official?: boolean
  iso_639_1?: string
}

interface RawProvider {
  provider_id: number
  provider_name: string
  logo_path?: string | null
}

interface RawWatchRegion {
  link?: string
  flatrate?: RawProvider[]
  rent?: RawProvider[]
  buy?: RawProvider[]
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

// Discover with a readable title: fetch IT (for poster/overview) + EN, and when
// the localized title is in a non-Latin script use the English one instead.
async function discoverReadable(
  type: TmdbType,
  params: Record<string, string>,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const [it, en] = await Promise.all([
    tmdbFetch<{ results: RawMedia[]; total_pages: number }>(`/discover/${type}`, params),
    tmdbFetch<{ results: RawMedia[] }>(`/discover/${type}`, { ...params, language: 'en-US' }),
  ])
  const enTitle = new Map<number, string>()
  for (const r of en.results) enTitle.set(r.id, (r.title ?? r.name) ?? '')
  const items = it.results.map((r) => {
    const item = normalise(r, type)
    if (!isReadableTitle(item.title)) {
      const e = enTitle.get(item.id)
      if (isReadableTitle(e)) item.title = e!
    }
    return item
  })
  return { items, totalPages: it.total_pages }
}

export async function getAnime(page = 1): Promise<{ items: MediaItem[]; totalPages: number }> {
  const suggestive = await getSuggestiveKeywordIds()
  return discoverReadable('tv', {
    with_genres: '16',
    with_original_language: 'ja',
    sort_by: 'popularity.desc',
    include_adult: 'false',
    // Escludi hentai (198385) e tutto ciò che è ecchi/sus → va in "Pervertito".
    without_keywords: ['198385', ...suggestive].join(','),
    'vote_count.gte': '10',
    page: String(page),
  })
}

// The "Pervertito" corner: ecchi / fan-service AND hentai anime.
export async function getPervertitoAnime(page = 1): Promise<{ items: MediaItem[]; totalPages: number }> {
  const suggestive = await getSuggestiveKeywordIds()
  const keywords = [...suggestive, '198385'] // ecchi/sus + hentai
  return discoverReadable('tv', {
    with_genres: '16',
    with_original_language: 'ja',
    with_keywords: keywords.join('|'), // ha almeno un keyword ecchi/hentai
    include_adult: 'true', // necessario per mostrare gli hentai
    sort_by: 'popularity.desc',
    'vote_count.gte': '5',
    page: String(page),
  })
}

// Western animated TV series (Scooby-Doo, Tom & Jerry, …): genre Animation,
// English original language to exclude Japanese anime.
export async function getCartoons(page = 1): Promise<{ items: MediaItem[]; totalPages: number }> {
  return discoverReadable('tv', {
    with_genres: '16',
    with_original_language: 'en',
    sort_by: 'popularity.desc',
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

export async function getDetail(
  type: TmdbType,
  id: number,
): Promise<MediaDetail> {
  const raw = await tmdbFetch<RawDetail>(`/${type}/${id}`, {
    append_to_response: 'credits,recommendations,videos,watch/providers,translations',
    include_video_language: 'it,en',
  })

  const base = normalise(raw, type)

  // Ripiego sull'inglese quando il titolo/trama in italiano non esistono e
  // l'originale è in uno script non leggibile (cirillico, CJK, …): meglio «The
  // Last Ronin» che «Последний Ронин». Le traduzioni arrivano da TMDB stesso.
  const enTr = raw.translations?.translations?.find((t) => t.iso_639_1 === 'en')?.data
  const englishTitle = enTr?.title || enTr?.name || null
  const englishOverview = enTr?.overview || null
  const title =
    !isReadableTitle(base.title) &&
    !isReadableTitle(base.originalTitle) &&
    isReadableTitle(englishTitle)
      ? (englishTitle as string)
      : base.title
  const overview = base.overview?.trim() ? base.overview : englishOverview ?? base.overview
  const cast: CastMember[] = (raw.credits?.cast ?? []).slice(0, 12).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character ?? '',
    profilePath: c.profile_path ?? null,
  }))

  const crewRaw = raw.credits?.crew ?? []
  const crew: CrewMember[] = crewRaw.map((c) => ({
    id: c.id,
    name: c.name,
    job: c.job ?? '',
    profilePath: c.profile_path ?? null,
  }))

  // Directors for movies; creators for TV
  const directors =
    type === 'tv'
      ? (raw.created_by ?? []).map((c) => c.name)
      : crewRaw.filter((c) => c.job === 'Director').map((c) => c.name)

  const productionCompanies: Company[] = (raw.production_companies ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    logoPath: c.logo_path ?? null,
  }))

  const recommendations = (raw.recommendations?.results ?? [])
    .slice(0, 12)
    .map((r) => normalise(r, type))

  // Best YouTube trailer: prefer official Trailer, then any trailer/teaser.
  const videos = (raw.videos?.results ?? []).filter((v) => v.site === 'YouTube')
  const trailer =
    videos.find((v) => v.type === 'Trailer' && v.official) ??
    videos.find((v) => v.type === 'Trailer') ??
    videos.find((v) => v.type === 'Teaser') ??
    videos[0]

  // Where to watch — Italy region.
  const region = raw['watch/providers']?.results?.IT
  const mapProviders = (list?: RawProvider[]): Provider[] =>
    (list ?? []).map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }))
  const watchProviders: WatchProviders | null = region
    ? {
        link: region.link ?? null,
        flatrate: mapProviders(region.flatrate),
        rent: mapProviders(region.rent),
        buy: mapProviders(region.buy),
      }
    : null

  return {
    ...base,
    title,
    overview,
    // L'endpoint dettaglio espone i generi come oggetti (`genres`), non come
    // `genre_ids` (presente solo in liste/ricerca). Ricaviamo qui gli id, così
    // i titoli salvati conservano i generi — servono al "Profilo di gusto".
    genreIds: (raw.genres ?? []).map((g) => g.id),
    genres: raw.genres ?? [],
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    tagline: raw.tagline ?? null,
    cast,
    crew,
    recommendations,
    originalTitle: raw.original_title ?? raw.original_name ?? null,
    originalLanguage: raw.original_language ?? null,
    status: raw.status ?? null,
    productionCompanies,
    productionCountries: (raw.production_countries ?? []).map((c) => c.name),
    budget: raw.budget ?? null,
    revenue: raw.revenue ?? null,
    homepage: raw.homepage ?? null,
    numberOfSeasons: raw.number_of_seasons ?? null,
    numberOfEpisodes: raw.number_of_episodes ?? null,
    directors: [...new Set(directors)],
    trailerKey: trailer?.key ?? null,
    watchProviders,
    collection: raw.belongs_to_collection
      ? {
          id: raw.belongs_to_collection.id,
          name: raw.belongs_to_collection.name,
          posterPath: raw.belongs_to_collection.poster_path ?? null,
        }
      : null,
    seasons: (raw.seasons ?? [])
      .filter((s) => (s.episode_count ?? 0) > 0)
      .map((s) => ({
        id: s.id,
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count ?? 0,
        airDate: s.air_date ?? null,
        posterPath: s.poster_path ?? null,
        overview: s.overview || null,
      }))
      .sort((a, b) => a.seasonNumber - b.seasonNumber),
  }
}

export async function getSeason(tvId: number, seasonNumber: number): Promise<Episode[]> {
  const raw = await tmdbFetch<{ episodes?: RawEpisode[] }>(`/tv/${tvId}/season/${seasonNumber}`)
  return (raw.episodes ?? []).map((e) => ({
    id: e.id,
    episodeNumber: e.episode_number,
    name: e.name,
    overview: e.overview ?? '',
    airDate: e.air_date ?? null,
    runtime: e.runtime ?? null,
    voteAverage: e.vote_average ?? 0,
    stillPath: e.still_path ?? null,
  }))
}

// ── Discover / browse ─────────────────────────────────────────────────────

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
    'vote_count.gte': sortBy.startsWith('vote_average') ? '200' : '0',
  }
  if (filters.year) {
    params[type === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = filters.year
  }
  if (filters.language) params.with_original_language = filters.language
  if (filters.country) params.with_origin_country = filters.country

  return discoverReadable(type, params)
}

// Resolve a curated list of names to real TMDB entities (with logos/photos),
// taking the top match for each. Used for the idle "famous" previews.
export async function resolveStudios(names: string[]): Promise<Company[]> {
  const found = await Promise.all(
    names.map((n) => searchCompany(n).then((r) => r[0] ?? null).catch(() => null)),
  )
  return found.filter((c): c is Company => c !== null)
}

export async function resolveSagas(names: string[]): Promise<Collection[]> {
  const found = await Promise.all(
    names.map((n) => searchCollection(n).then((r) => r[0] ?? null).catch(() => null)),
  )
  return found.filter((c): c is Collection => c !== null)
}

// Resolve specific collection IDs (more reliable than name search for the
// curated "famous sagas" — avoids matching "making of" documentaries).
export async function resolveSagaIds(ids: number[]): Promise<Collection[]> {
  const found = await Promise.all(
    ids.map((id) =>
      getCollection(id)
        .then((c): Collection => ({ id: c.id, name: c.name, posterPath: c.posterPath }))
        .catch(() => null),
    ),
  )
  return found.filter((c): c is Collection => c !== null)
}

export async function resolvePeople(names: string[]): Promise<Person[]> {
  const found = await Promise.all(
    names.map((n) => searchPerson(n).then((r) => r[0] ?? null).catch(() => null)),
  )
  return found.filter((p): p is Person => p !== null)
}

// ── People (actors / directors) ────────────────────────────────────────────

interface RawPerson {
  id: number
  name: string
  profile_path?: string | null
  known_for_department?: string
  known_for?: RawMedia[]
  popularity?: number
  biography?: string
  birthday?: string | null
  place_of_birth?: string | null
}

export async function searchPerson(query: string): Promise<Person[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<{ results: RawPerson[] }>('/search/person', {
    query,
    include_adult: 'false',
  })
  return data.results
    .slice()
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((p) => ({
    id: p.id,
    name: p.name,
    profilePath: p.profile_path ?? null,
    department: p.known_for_department ?? null,
    knownFor: (p.known_for ?? [])
      .map((m) => m.title ?? m.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ') || null,
  }))
}

// Genres that aren't real filmography: documentaries about the person,
// concerts, "making of", talk shows, news, reality.
const NON_FILMOGRAPHY_GENRES = new Set([99, 10402, 10767, 10763, 10764])

type RawCredit = RawMedia & { department?: string; job?: string }

// Keep only the credits relevant to the person's primary role.
function dedupeAndClean(pool: RawCredit[]): MediaItem[] {
  const byKey = new Map<string, RawCredit>()
  for (const m of pool) {
    if (m.media_type !== 'movie' && m.media_type !== 'tv') continue
    if (!m.poster_path) continue
    if ((m.genre_ids ?? []).some((g) => NON_FILMOGRAPHY_GENRES.has(g))) continue
    if ((m.vote_count ?? 0) < 10) continue // drop obscure entries
    const key = `${m.media_type}-${m.id}`
    const existing = byKey.get(key)
    if (!existing || (m.popularity ?? 0) > (existing.popularity ?? 0)) {
      byKey.set(key, m)
    }
  }
  return [...byKey.values()]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((m) => normalise(m))
}

export async function getPersonDetail(id: number): Promise<PersonDetail> {
  const raw = await tmdbFetch<
    RawPerson & { combined_credits?: { cast?: RawCredit[]; crew?: RawCredit[] } }
  >(`/person/${id}`, { append_to_response: 'combined_credits' })

  const dept = raw.known_for_department ?? 'Acting'
  const cast = raw.combined_credits?.cast ?? []
  const crew = raw.combined_credits?.crew ?? []

  // Actors → where they acted (cast). Others → crew work in their department
  // (director → directed, composer → scored, writer → wrote).
  const pool =
    dept === 'Acting' ? cast : crew.filter((m) => m.department === dept)

  // Fallback to everything if the role-specific pool is empty.
  let uniqueCredits = dedupeAndClean(pool)
  if (uniqueCredits.length === 0) {
    uniqueCredits = dedupeAndClean([...cast, ...crew])
  }

  return {
    id: raw.id,
    name: raw.name,
    profilePath: raw.profile_path ?? null,
    department: raw.known_for_department ?? null,
    knownFor: raw.known_for_department ?? null,
    biography: raw.biography || null,
    birthday: raw.birthday ?? null,
    placeOfBirth: raw.place_of_birth ?? null,
    credits: uniqueCredits,
  }
}

// ── Collections / sagas ────────────────────────────────────────────────────

interface RawCollection {
  id: number
  name: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  parts?: RawMedia[]
}

export async function searchCollection(query: string): Promise<Collection[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<{ results: RawCollection[] }>('/search/collection', {
    query,
  })
  return data.results.map((c) => ({
    id: c.id,
    name: c.name,
    posterPath: c.poster_path ?? null,
  }))
}

export async function getCollection(id: number): Promise<CollectionDetail> {
  const raw = await tmdbFetch<RawCollection>(`/collection/${id}`)
  const items = (raw.parts ?? [])
    .map((m) => normalise(m, 'movie'))
    // Chronological order by release date.
    .sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''))
  return {
    id: raw.id,
    name: raw.name,
    overview: raw.overview || null,
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    items,
  }
}

// Collections related to a saga, from TMDB recommendations for the saga's
// films grouped by the collection the recommended films belong to. Note:
// recommendations are genre-based ("who liked X also liked Y"), so results
// can include franchises from other universes (e.g. Alien → Riddick).
export async function getRelatedCollections(c: CollectionDetail): Promise<Collection[]> {
  // Seed with up to 3 films spread across the saga (first / middle / last).
  const films = c.items
  const seeds = [...new Set([films[0], films[Math.floor(films.length / 2)], films[films.length - 1]])]
    .filter((f): f is MediaItem => !!f)

  // movieId → relevance score (higher rank in recommendations = more points)
  const recScores = new Map<number, number>()
  await Promise.all(
    seeds.map(async (f) => {
      try {
        const data = await tmdbFetch<{ results: { id: number }[] }>(
          `/movie/${f.id}/recommendations`,
        )
        data.results.slice(0, 12).forEach((r, idx) => {
          recScores.set(r.id, (recScores.get(r.id) ?? 0) + (12 - idx))
        })
      } catch {
        /* seed failed — ignore */
      }
    }),
  )

  const own = new Set(films.map((i) => i.id))
  const top = [...recScores.entries()]
    .filter(([movieId]) => !own.has(movieId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Fetch each top movie's collection membership and aggregate.
  const byCollection = new Map<number, { col: Collection; score: number }>()
  await Promise.all(
    top.map(async ([movieId, score]) => {
      try {
        const raw = await tmdbFetch<{
          belongs_to_collection?: { id: number; name: string; poster_path?: string | null } | null
        }>(`/movie/${movieId}`)
        const btc = raw.belongs_to_collection
        if (!btc || btc.id === c.id) return
        const existing = byCollection.get(btc.id)
        if (existing) existing.score += score
        else {
          byCollection.set(btc.id, {
            col: { id: btc.id, name: btc.name, posterPath: btc.poster_path ?? null },
            score,
          })
        }
      } catch {
        /* ignore */
      }
    }),
  )

  return [...byCollection.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((e) => e.col)
}

// ── Production companies / studios ─────────────────────────────────────────

export async function searchCompany(query: string): Promise<Company[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<{ results: RawCompany[] }>('/search/company', {
    query,
  })
  return data.results.map((c) => ({
    id: c.id,
    name: c.name,
    logoPath: c.logo_path ?? null,
  }))
}

export async function getCompany(id: number): Promise<Company> {
  const raw = await tmdbFetch<RawCompany>(`/company/${id}`)
  return { id: raw.id, name: raw.name, logoPath: raw.logo_path ?? null }
}

export async function discoverByCompany(
  companyId: number,
  page = 1,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const data = await tmdbFetch<{ results: RawMedia[]; total_pages: number }>(
    '/discover/movie',
    {
      with_companies: String(companyId),
      sort_by: 'popularity.desc',
      page: String(page),
    },
  )
  return {
    items: data.results.map((r) => normalise(r, 'movie')),
    totalPages: data.total_pages,
  }
}

// Recommendations for a specific title (used on Dashboard for "Per te").
export async function getRecommendations(
  type: TmdbType,
  id: number,
): Promise<MediaItem[]> {
  try {
    const data = await tmdbFetch<{ results: RawMedia[] }>(`/${type}/${id}/recommendations`)
    return (data.results ?? []).slice(0, 20).map((r) => normalise(r, type))
  } catch {
    return []
  }
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
  const data = await tmdbFetch<{ results: RawMedia[] }>(
    `/discover/${type}`,
    params,
  )
  return (data.results ?? []).slice(0, 20).map((r) => normalise(r, type))
}
