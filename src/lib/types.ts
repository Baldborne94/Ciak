// TMDB only serves movies and TV; anime/cartoon are derived from TV + the
// "Animation" genre, but we still let users classify them on their own titles.
export type TmdbType = 'movie' | 'tv'
export type MediaType = 'movie' | 'tv' | 'anime' | 'cartoon'

// Personal watch status, per the project spec.
export type TitleStatus = 'watched' | 'to_watch' | 'in_progress' | 'abandoned'

export const STATUS_LABELS: Record<TitleStatus, string> = {
  watched: 'Visto',
  to_watch: 'Da vedere',
  in_progress: 'In corso',
  abandoned: 'Abbandonato',
}

// A simplified, app-internal media item normalised from TMDB responses.
export interface MediaItem {
  id: number
  mediaType: TmdbType
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string | null
  voteAverage: number
  genreIds: number[]
}

// Extended detail used on the Detail page.
export interface MediaDetail extends MediaItem {
  genres: { id: number; name: string }[]
  runtime: number | null
  tagline: string | null
  cast: CastMember[]
  recommendations: MediaItem[]
}

export interface CastMember {
  id: number
  name: string
  character: string
  profilePath: string | null
}

export interface Genre {
  id: number
  name: string
}

// ── Supabase rows ──────────────────────────────────────────────────────────

// `user_titles` — personal interactions with a title.
export interface UserTitle {
  id: string
  user_id: string
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  status: TitleStatus
  is_favorite: boolean
  personal_rating: number | null
  notes: string | null
  watched_at: string | null
  genre_ids: number[]
  created_at: string
  updated_at: string
}

// `user_achievements` — trophies unlocked by the user.
export interface UserAchievement {
  id: string
  user_id: string
  achievement_id: string
  unlocked_at: string
}

// `user_profile` — active badge chosen by the user.
export interface UserProfile {
  user_id: string
  active_achievement_id: string | null
  updated_at: string
}

// `user_preferences` — calibrates the AI recommendations.
export interface UserPreferences {
  id: string
  user_id: string
  preferred_genres: string[]
  excluded_genres: string[]
  preferred_languages: string[]
  updated_at: string
}
