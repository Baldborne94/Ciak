import { supabase } from './supabase'
import { getUpcoming } from './tmdb'
import { listAll } from './userTitles'
import type { MediaItem, MediaType, UserAlert } from './types'

function client() {
  if (!supabase) {
    throw new Error('Supabase non è configurato. Imposta le chiavi nel file .env.')
  }
  return supabase
}

export interface AlertRef {
  tmdbId: number
  mediaType: MediaType
  title: string
  posterPath: string | null
  releaseDate: string | null
}

export async function listAlerts(userId: string): Promise<UserAlert[]> {
  const { data, error } = await client()
    .from('user_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('release_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as UserAlert[]
}

export async function alertIds(userId: string): Promise<Set<string>> {
  const { data, error } = await client()
    .from('user_alerts')
    .select('tmdb_id, media_type')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return new Set(
    (data ?? []).map((r) => `${(r as { media_type: string }).media_type}-${(r as { tmdb_id: number }).tmdb_id}`),
  )
}

export async function addAlert(userId: string, ref: AlertRef): Promise<void> {
  const { error } = await client()
    .from('user_alerts')
    .upsert(
      {
        user_id: userId,
        tmdb_id: ref.tmdbId,
        media_type: ref.mediaType,
        title: ref.title,
        poster_path: ref.posterPath,
        release_date: ref.releaseDate,
      },
      { onConflict: 'user_id,tmdb_id,media_type' },
    )
  if (error) throw new Error(error.message)
}

export async function removeAlert(userId: string, tmdbId: number, mediaType: MediaType): Promise<void> {
  const { error } = await client()
    .from('user_alerts')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
  if (error) throw new Error(error.message)
}

// Alerts whose release date has arrived but the user hasn't been notified yet.
export async function listReleased(userId: string): Promise<UserAlert[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await client()
    .from('user_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('notified', false)
    .not('release_date', 'is', null)
    .lte('release_date', today)
  if (error) throw new Error(error.message)
  return (data ?? []) as UserAlert[]
}

export async function markNotified(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await client()
    .from('user_alerts')
    .update({ notified: true })
    .eq('user_id', userId)
    .in('id', ids)
  if (error) throw new Error(error.message)
}

// Upcoming releases ranked by how well they match the user's taste (genres of
// watched + favorite titles). Falls back to plain popularity when no taste data.
export async function personalizedUpcoming(userId: string, limit = 24): Promise<MediaItem[]> {
  const [rows, upcoming] = await Promise.all([listAll(userId), getUpcoming()])
  const taste = rows.filter((r) => r.status === 'watched' || r.is_favorite)
  const counts = new Map<number, number>()
  for (const r of taste) {
    for (const g of r.genre_ids ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
  }

  if (counts.size === 0) {
    return upcoming
      .slice()
      .sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''))
      .slice(0, limit)
  }

  return upcoming
    .map((item) => ({
      item,
      score: (item.genreIds ?? []).reduce((s, g) => s + (counts.get(g) ?? 0), 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.item.releaseDate ?? '').localeCompare(b.item.releaseDate ?? ''))
    .slice(0, limit)
    .map((s) => s.item)
}
