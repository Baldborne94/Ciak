import { supabase } from './supabase'
import type {
  MediaItem,
  TitleStatus,
  TmdbType,
  UserTitle,
} from './types'

const TABLE = 'user_titles'

function client() {
  if (!supabase) {
    throw new Error('Supabase non è configurato. Imposta le chiavi nel file .env.')
  }
  return supabase
}

// What identifies a title across TMDB + our table.
export interface TitleRef {
  tmdbId: number
  mediaType: TmdbType
  title: string
  posterPath: string | null
}

export function refFromMedia(item: MediaItem): TitleRef {
  return {
    tmdbId: item.id,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
  }
}

export async function getUserTitle(
  userId: string,
  tmdbId: number,
  mediaType: TmdbType,
): Promise<UserTitle | null> {
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as UserTitle | null
}

// Insert or update the personal row for a title. Patch carries only the fields
// that change (status / favorite / rating / notes); identity comes from `ref`.
export async function upsertUserTitle(
  userId: string,
  ref: TitleRef,
  patch: Partial<Pick<UserTitle, 'status' | 'is_favorite' | 'personal_rating' | 'notes' | 'watched_at'>>,
): Promise<UserTitle> {
  const existing = await getUserTitle(userId, ref.tmdbId, ref.mediaType)

  const row = {
    user_id: userId,
    tmdb_id: ref.tmdbId,
    media_type: ref.mediaType,
    title: ref.title,
    poster_path: ref.posterPath,
    status: patch.status ?? existing?.status ?? 'to_watch',
    is_favorite: patch.is_favorite ?? existing?.is_favorite ?? false,
    personal_rating:
      patch.personal_rating !== undefined
        ? patch.personal_rating
        : (existing?.personal_rating ?? null),
    notes: patch.notes !== undefined ? patch.notes : (existing?.notes ?? null),
    watched_at:
      patch.watched_at !== undefined ? patch.watched_at : (existing?.watched_at ?? null),
  }

  const { data, error } = await client()
    .from(TABLE)
    .upsert(row, { onConflict: 'user_id,tmdb_id,media_type' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as UserTitle
}

export async function deleteUserTitle(userId: string, id: string): Promise<void> {
  const { error } = await client().from(TABLE).delete().eq('user_id', userId).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listByStatus(
  userId: string,
  status: TitleStatus,
): Promise<UserTitle[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('status', status)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as UserTitle[]
}

export async function listFavorites(userId: string): Promise<UserTitle[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('is_favorite', true)
    .order('personal_rating', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as UserTitle[]
}

export interface UserStats {
  watched: number
  favorites: number
  toWatch: number
  inProgress: number
}

export async function getStats(userId: string): Promise<UserStats> {
  const all = await client()
    .from(TABLE)
    .select('status, is_favorite')
    .eq('user_id', userId)

  if (all.error) throw new Error(all.error.message)
  const rows = (all.data ?? []) as { status: TitleStatus; is_favorite: boolean }[]

  return {
    watched: rows.filter((r) => r.status === 'watched').length,
    favorites: rows.filter((r) => r.is_favorite).length,
    toWatch: rows.filter((r) => r.status === 'to_watch').length,
    inProgress: rows.filter((r) => r.status === 'in_progress').length,
  }
}
