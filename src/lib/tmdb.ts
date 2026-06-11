import type {
  CastMember,
  Collection,
  CollectionDetail,
  Company,
  CrewMember,
  Genre,
  MediaDetail,
  MediaItem,
  Person,
  PersonDetail,
  TmdbType,
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
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  vote_count?: number
  popularity?: number
  genre_ids?: number[]
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
    overview: raw.overview ?? '',
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    releaseDate: raw.release_date ?? raw.first_air_date ?? null,
    voteAverage: raw.vote_average ?? 0,
    genreIds: raw.genre_ids ?? [],
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export async function getTrending(): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: RawMedia[] }>('/trending/all/week')
  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => normalise(r))
}

export async function getTrendingMovies(): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: RawMedia[] }>('/trending/movie/week')
  return data.results.map((r) => normalise(r, 'movie'))
}

export async function getTrendingTV(): Promise<MediaItem[]> {
  const data = await tmdbFetch<{ results: RawMedia[] }>('/trending/tv/week')
  return data.results.map((r) => normalise(r, 'tv'))
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
    if (!merged.has(key)) merged.set(key, { item: normalise(raw), pop: raw.popularity ?? 0 })
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
}

export async function getAnime(page = 1): Promise<{ items: MediaItem[]; totalPages: number }> {
  const data = await tmdbFetch<{ results: RawMedia[]; total_pages: number }>('/discover/tv', {
    with_genres: '16',
    with_original_language: 'ja',
    sort_by: 'popularity.desc',
    include_adult: 'false',
    without_keywords: '198385', // escludi hentai
    'vote_count.gte': '10',
    page: String(page),
  })
  return {
    items: data.results.map((r) => normalise(r, 'tv')),
    totalPages: data.total_pages,
  }
}

// Most popular people right now — for the idle "Personaggi del momento" preview.
export async function getPopularPeople(): Promise<Person[]> {
  const data = await tmdbFetch<{ results: RawPerson[] }>('/person/popular')
  return data.results.slice(0, 12).map((p) => ({
    id: p.id,
    name: p.name,
    profilePath: p.profile_path ?? null,
    department: p.known_for_department ?? null,
    knownFor:
      (p.known_for ?? [])
        .map((m) => m.title ?? m.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ') || null,
  }))
}

// Western animated TV series (Scooby-Doo, Tom & Jerry, …): genre Animation,
// English original language to exclude Japanese anime.
export async function getCartoons(page = 1): Promise<{ items: MediaItem[]; totalPages: number }> {
  const data = await tmdbFetch<{ results: RawMedia[]; total_pages: number }>('/discover/tv', {
    with_genres: '16',
    with_original_language: 'en',
    sort_by: 'popularity.desc',
    'vote_count.gte': '20',
    page: String(page),
  })
  return {
    items: data.results.map((r) => normalise(r, 'tv')),
    totalPages: data.total_pages,
  }
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
    append_to_response: 'credits,recommendations',
  })

  const base = normalise(raw, type)
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

  return {
    ...base,
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
  }
}

// ── Discover / browse ─────────────────────────────────────────────────────

export async function discoverByGenre(
  type: TmdbType,
  genreId: number,
  page = 1,
  sortBy = 'popularity.desc',
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const data = await tmdbFetch<{ results: RawMedia[]; total_pages: number }>(
    `/discover/${type}`,
    {
      with_genres: String(genreId),
      sort_by: sortBy,
      page: String(page),
      'vote_count.gte': sortBy.startsWith('vote_average') ? '200' : '0',
    },
  )
  return {
    items: data.results.map((r) => normalise(r, type)),
    totalPages: data.total_pages,
  }
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
