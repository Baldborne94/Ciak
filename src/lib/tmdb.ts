import type {
  TmdbGenre,
  TmdbTitle,
  TmdbTitleDetail,
} from '@/types'

// ─── Configurazione client TMDB ─────────────────────────────────────
const TMDB_BASE = 'https://api.themoviedb.org/3'
const ACCESS_TOKEN = import.meta.env.VITE_TMDB_ACCESS_TOKEN

/** Lingua di default per titoli/trame. Switchabile in futuro (it-IT / en-US). */
export const DEFAULT_LANGUAGE = 'it-IT'

export const IMG = {
  poster: (path: string | null, size: 'w185' | 'w342' | 'w500' = 'w342') =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null,
  backdrop: (path: string | null, size: 'w780' | 'w1280' | 'original' = 'w1280') =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null,
  profile: (path: string | null, size: 'w185' = 'w185') =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : null,
}

async function tmdbFetch<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  if (!ACCESS_TOKEN) {
    throw new Error(
      'TMDB access token mancante. Imposta VITE_TMDB_ACCESS_TOKEN nel file .env.',
    )
  }

  const url = new URL(`${TMDB_BASE}${endpoint}`)
  url.searchParams.set('language', DEFAULT_LANGUAGE)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`TMDB ${res.status}: ${res.statusText} (${endpoint})`)
  }
  return res.json() as Promise<T>
}

// ─── Normalizzazione ────────────────────────────────────────────────
// TMDB usa campi diversi tra film e serie; li uniformiamo in TmdbTitle.

interface RawTitle {
  id: number
  media_type?: 'movie' | 'tv' | 'person'
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
  genre_ids?: number[]
}

function normalizeTitle(raw: RawTitle, fallbackType?: 'movie' | 'tv'): TmdbTitle {
  const media_type = (raw.media_type === 'tv' || raw.media_type === 'movie'
    ? raw.media_type
    : fallbackType ?? 'movie') as 'movie' | 'tv'

  return {
    id: raw.id,
    media_type,
    title: raw.title ?? raw.name ?? 'Senza titolo',
    original_title: raw.original_title ?? raw.original_name ?? '',
    overview: raw.overview ?? '',
    poster_path: raw.poster_path ?? null,
    backdrop_path: raw.backdrop_path ?? null,
    release_date: raw.release_date ?? raw.first_air_date ?? null,
    vote_average: raw.vote_average ?? 0,
    genre_ids: raw.genre_ids ?? [],
  }
}

// ─── Endpoint pubblici ──────────────────────────────────────────────

/** Titoli di tendenza (film + serie) della settimana. Per la Dashboard. */
export async function getTrending(): Promise<TmdbTitle[]> {
  const data = await tmdbFetch<{ results: RawTitle[] }>('/trending/all/week')
  return data.results
    .filter((r) => r.media_type !== 'person')
    .map((r) => normalizeTitle(r))
}

/** Ricerca multi (film + serie + persone, filtriamo le persone). */
export async function searchMulti(
  query: string,
  page = 1,
): Promise<{ results: TmdbTitle[]; totalPages: number }> {
  if (!query.trim()) return { results: [], totalPages: 0 }
  const data = await tmdbFetch<{ results: RawTitle[]; total_pages: number }>(
    '/search/multi',
    { query, page },
  )
  return {
    results: data.results
      .filter((r) => r.media_type !== 'person')
      .map((r) => normalizeTitle(r)),
    totalPages: data.total_pages,
  }
}

/** Lista generi (per i filtri). type: 'movie' | 'tv'. */
export async function getGenres(type: 'movie' | 'tv'): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<{ genres: TmdbGenre[] }>(`/genre/${type}/list`)
  return data.genres
}

/** Dettaglio completo di un titolo, con cast e raccomandazioni in un colpo. */
export async function getTitleDetail(
  type: 'movie' | 'tv',
  id: number,
): Promise<TmdbTitleDetail> {
  const raw = await tmdbFetch<
    RawTitle & {
      genres?: TmdbGenre[]
      runtime?: number
      episode_run_time?: number[]
      number_of_seasons?: number
      number_of_episodes?: number
      tagline?: string
      status?: string
      credits?: {
        cast?: {
          id: number
          name: string
          character?: string
          profile_path?: string | null
        }[]
      }
      recommendations?: { results?: RawTitle[] }
    }
  >(`/${type}/${id}`, { append_to_response: 'credits,recommendations' })

  const base = normalizeTitle(raw, type)

  return {
    ...base,
    genres: raw.genres ?? [],
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    number_of_seasons: raw.number_of_seasons,
    number_of_episodes: raw.number_of_episodes,
    tagline: raw.tagline ?? null,
    status: raw.status ?? '',
    cast: (raw.credits?.cast ?? []).slice(0, 12).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character ?? '',
      profile_path: c.profile_path ?? null,
    })),
    recommendations: (raw.recommendations?.results ?? [])
      .slice(0, 12)
      .map((r) => normalizeTitle(r, type)),
  }
}
