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
  originalTitle: string | null
  overview: string
  posterPath: string | null
  backdropPath: string | null
  releaseDate: string | null
  voteAverage: number
  genreIds: number[]
  originalLanguage: string | null
}

// Extended detail used on the Detail page.
export interface MediaDetail extends MediaItem {
  genres: { id: number; name: string }[]
  runtime: number | null
  tagline: string | null
  cast: CastMember[]
  crew: CrewMember[]
  recommendations: MediaItem[]
  originalTitle: string | null
  originalLanguage: string | null
  status: string | null
  productionCompanies: Company[]
  productionCountries: string[]
  budget: number | null
  revenue: number | null
  homepage: string | null
  // TV-specific
  numberOfSeasons: number | null
  numberOfEpisodes: number | null
  // Directors / creators, derived from crew
  directors: { id: number; name: string }[]
  // YouTube trailer key, if available
  trailerKey: string | null
  // Where to watch (region IT) — kept for convenience; see watchProvidersByCountry.
  watchProviders: WatchProviders | null
  // Where to watch across countries (IT first), for the country picker.
  watchProvidersByCountry: CountryProviders[]
  // TV seasons (empty for movies)
  seasons: Season[]
  // Raccolta/saga di cui il film fa parte (es. "Grindhouse Collection"), se presente.
  collection: Collection | null
}

export interface Season {
  id: number
  seasonNumber: number
  name: string
  episodeCount: number
  airDate: string | null
  posterPath: string | null
  overview: string | null
}

export interface Episode {
  id: number
  episodeNumber: number
  name: string
  overview: string
  airDate: string | null
  runtime: number | null
  voteAverage: number
  stillPath: string | null
}

export interface Provider {
  id: number
  name: string
  logoPath: string | null
}

export interface WatchProviders {
  link: string | null
  flatrate: Provider[]
  rent: Provider[]
  buy: Provider[]
}

// Watch providers for a single country, for the "Dove guardarlo" country picker.
export interface CountryProviders {
  code: string // ISO 3166-1 (e.g. "IT", "US")
  name: string // localized country name (Italian)
  providers: WatchProviders
}

export interface CastMember {
  id: number
  name: string
  character: string
  profilePath: string | null
}

export interface CrewMember {
  id: number
  name: string
  job: string
  profilePath: string | null
}

export interface Company {
  id: number
  name: string
  logoPath: string | null
}

// A person (actor / director / composer …) from TMDB.
export interface Person {
  id: number
  name: string
  profilePath: string | null
  department: string | null
  knownFor: string | null
}

export interface PersonDetail extends Person {
  biography: string | null
  birthday: string | null
  placeOfBirth: string | null
  credits: MediaItem[]
  // "mediaType-id" keys among `credits` where this person is top-billed cast
  // (order ≤ threshold) — only meaningful for acting credits.
  mainCastKeys: string[]
}

// A movie collection / saga (e.g. "Harry Potter Collection").
export interface Collection {
  id: number
  name: string
  posterPath: string | null
}

export interface CollectionDetail {
  id: number
  name: string
  overview: string | null
  posterPath: string | null
  backdropPath: string | null
  items: MediaItem[]
}

// Favorited people / studios (Supabase user_entities).
export type EntityType = 'person' | 'company'

export interface SavedEntity {
  id: string
  user_id: string
  entity_type: EntityType
  entity_id: number
  name: string
  image_path: string | null
  subtitle: string | null
  created_at: string
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
  // Film già visto che vuoi rivedere: lo fa riapparire nella watchlist "Da
  // vedere" senza togliergli lo stato "Visto".
  rewatch: boolean
  created_at: string
  updated_at: string
}

// `user_lists` — custom themed lists created by the user.
export interface UserList {
  id: string
  user_id: string
  name: string
  description: string | null
  is_public: boolean
  created_at: string
  updated_at: string
  item_count?: number
}

// `user_list_items` — titles inside a custom list.
export interface UserListItem {
  id: string
  list_id: string
  user_id: string
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  added_at: string
}

// `user_diary` — viewing log entries.
export interface DiaryEntry {
  id: string
  user_id: string
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  watched_on: string
  rating: number | null
  note: string | null
  created_at: string
}

// `user_alerts` — "avvisami quando esce" reminders.
export interface UserAlert {
  id: string
  user_id: string
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  release_date: string | null
  notified: boolean
  created_at: string
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
