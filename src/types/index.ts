// ─── Tipi di dominio CineVault ──────────────────────────────────────

/** Tipo di media. TMDB distingue solo movie/tv; anime e cartoon sono
 *  una nostra sotto-classificazione delle serie animate. */
export type MediaType = 'movie' | 'tv' | 'anime' | 'cartoon'

/** Stato personale di un titolo nelle liste utente. */
export type TitleStatus = 'watched' | 'to_watch' | 'in_progress' | 'abandoned'

// ─── Supabase: tabella user_titles ──────────────────────────────────
export interface UserTitle {
  id: string
  user_id: string
  tmdb_id: number
  media_type: MediaType
  status: TitleStatus
  is_favorite: boolean
  personal_rating: number | null // 1..5
  notes: string | null
  watched_at: string | null
  created_at: string
  updated_at: string
}

/** Payload per inserire/aggiornare un titolo personale. */
export type UserTitleInput = Partial<
  Omit<UserTitle, 'id' | 'user_id' | 'created_at' | 'updated_at'>
> & {
  tmdb_id: number
  media_type: MediaType
}

// ─── Supabase: tabella user_preferences ─────────────────────────────
export interface UserPreferences {
  id: string
  user_id: string
  preferred_genres: string[]
  excluded_genres: string[]
  preferred_languages: string[]
  updated_at: string
}

// ─── TMDB ───────────────────────────────────────────────────────────
export interface TmdbTitle {
  id: number
  media_type: 'movie' | 'tv'
  title: string // normalizzato (movie.title | tv.name)
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string | null // normalizzato (release_date | first_air_date)
  vote_average: number
  genre_ids: number[]
}

export interface TmdbGenre {
  id: number
  name: string
}

export interface TmdbCastMember {
  id: number
  name: string
  character: string
  profile_path: string | null
}

export interface TmdbTitleDetail extends TmdbTitle {
  genres: TmdbGenre[]
  runtime: number | null // minuti (film) o durata media episodio (serie)
  number_of_seasons?: number
  number_of_episodes?: number
  tagline: string | null
  status: string
  cast: TmdbCastMember[]
  recommendations: TmdbTitle[]
}
