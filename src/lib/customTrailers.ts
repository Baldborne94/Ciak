import { supabase } from './supabase'
import type { TmdbType } from './types'

// Il trailer scelto dall'utente per un titolo, quando quello di TMDB è
// sbagliato o manca del tutto. Vive in una tabella sua (user_trailers) perché
// si può voler correggere il trailer di un film che non si ha in collezione.

function client() {
  if (!supabase) throw new Error('Supabase non è configurato.')
  return supabase
}

const TABLE = 'user_trailers'

// La chiave YouTube scelta dall'utente, o null se non ne ha indicata una.
export async function getCustomTrailer(
  userId: string,
  tmdbId: number,
  mediaType: TmdbType,
): Promise<string | null> {
  const { data, error } = await client()
    .from(TABLE)
    .select('youtube_key')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { youtube_key: string } | null)?.youtube_key ?? null
}

export async function setCustomTrailer(
  userId: string,
  tmdbId: number,
  mediaType: TmdbType,
  youtubeKey: string,
): Promise<void> {
  const { error } = await client()
    .from(TABLE)
    .upsert(
      { user_id: userId, tmdb_id: tmdbId, media_type: mediaType, youtube_key: youtubeKey },
      { onConflict: 'user_id,tmdb_id,media_type' },
    )
  if (error) throw new Error(error.message)
}

// Torna a usare il trailer di TMDB.
export async function clearCustomTrailer(
  userId: string,
  tmdbId: number,
  mediaType: TmdbType,
): Promise<void> {
  const { error } = await client()
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
  if (error) throw new Error(error.message)
}
