import type { Genre, MediaItem, TmdbType } from '../types'

export interface RawMedia {
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

export interface RawCredits {
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

export interface RawCompany {
  id: number
  name: string
  logo_path?: string | null
}

export interface RawDetail extends RawMedia {
  genres?: Genre[]
  runtime?: number
  episode_run_time?: number[]
  tagline?: string
  credits?: RawCredits
  recommendations?: { results: RawMedia[] }
  similar?: { results: RawMedia[] }
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
  // I titoli alternativi stanno sotto "titles" per i film e "results" per le
  // serie: è lì che vive il titolo internazionale quando TMDB non ha una vera
  // traduzione (es. «The 13th Sword» per un film cinese del 2026).
  alternative_titles?: {
    titles?: RawAltTitle[]
    results?: RawAltTitle[]
  }
}

export interface RawAltTitle {
  iso_3166_1?: string
  title?: string
}

export interface RawSeason {
  id: number
  season_number: number
  name: string
  episode_count?: number
  air_date?: string | null
  poster_path?: string | null
  overview?: string
}

export interface RawEpisode {
  id: number
  episode_number: number
  name: string
  overview?: string
  air_date?: string | null
  runtime?: number | null
  vote_average?: number
  still_path?: string | null
}

export interface RawVideo {
  key: string
  site: string
  type: string
  name?: string
  official?: boolean
  iso_639_1?: string
  published_at?: string
}

export interface RawProvider {
  provider_id: number
  provider_name: string
  logo_path?: string | null
}

export interface RawWatchRegion {
  link?: string
  flatrate?: RawProvider[]
  rent?: RawProvider[]
  buy?: RawProvider[]
}

export interface RawPerson {
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

export type RawCredit = RawMedia & { department?: string; job?: string; order?: number }

export interface RawCollection {
  id: number
  name: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  parts?: RawMedia[]
}

// Localized (Italian) country name for an ISO 3166-1 code, e.g. "US" → "Stati
// Uniti". Falls back to the raw code if the runtime lacks Intl.DisplayNames.
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['it'], { type: 'region' })
  : null

export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

export function normalise(raw: RawMedia, fallbackType?: TmdbType): MediaItem {
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
