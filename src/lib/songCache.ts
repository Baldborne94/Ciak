import { supabase } from './supabase'
import type { MediaItem } from './types'

export type SongResult = { item: MediaItem; note: string }

export interface CachedSong {
  query_key: string
  query: string
  created_at: string
}

function client() {
  if (!supabase) throw new Error('Supabase non è configurato.')
  return supabase
}

export function songKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Cached resolved results for a song query, or null on miss.
export async function getCachedSong(userId: string, key: string): Promise<SongResult[] | null> {
  const { data, error } = await client()
    .from('user_song_cache')
    .select('results')
    .eq('user_id', userId)
    .eq('query_key', key)
    .maybeSingle()
  if (error || !data) return null
  return (data as { results: SongResult[] }).results
}

export async function saveCachedSong(
  userId: string,
  key: string,
  query: string,
  results: SongResult[],
): Promise<void> {
  await client()
    .from('user_song_cache')
    .upsert(
      { user_id: userId, query_key: key, query, results },
      { onConflict: 'user_id,query_key' },
    )
}

export async function listCachedSongs(userId: string): Promise<CachedSong[]> {
  const { data, error } = await client()
    .from('user_song_cache')
    .select('query_key, query, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as CachedSong[]
}

export async function deleteCachedSong(userId: string, key: string): Promise<void> {
  await client().from('user_song_cache').delete().eq('user_id', userId).eq('query_key', key)
}

export async function clearCachedSongs(userId: string): Promise<void> {
  await client().from('user_song_cache').delete().eq('user_id', userId)
}
