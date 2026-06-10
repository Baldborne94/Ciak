import type {
  CastMember,
  Genre,
  MediaDetail,
  MediaItem,
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

export async function searchMulti(query: string): Promise<MediaItem[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<{ results: RawMedia[] }>('/search/multi', {
    query,
    include_adult: 'false',
  })
  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => normalise(r))
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
}

interface RawDetail extends RawMedia {
  genres?: Genre[]
  runtime?: number
  episode_run_time?: number[]
  tagline?: string
  credits?: RawCredits
  recommendations?: { results: RawMedia[] }
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

  const recommendations = (raw.recommendations?.results ?? [])
    .slice(0, 12)
    .map((r) => normalise(r, type))

  return {
    ...base,
    genres: raw.genres ?? [],
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    tagline: raw.tagline ?? null,
    cast,
    recommendations,
  }
}
