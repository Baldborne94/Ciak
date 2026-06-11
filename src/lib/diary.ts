import { supabase } from './supabase'
import type { DiaryEntry, MediaType } from './types'

function client() {
  if (!supabase) {
    throw new Error('Supabase non è configurato. Imposta le chiavi nel file .env.')
  }
  return supabase
}

export interface DiaryRef {
  tmdbId: number
  mediaType: MediaType
  title: string
  posterPath: string | null
}

export async function addDiaryEntry(
  userId: string,
  ref: DiaryRef,
  fields: { watchedOn: string; rating: number | null; note: string | null },
): Promise<DiaryEntry> {
  const { data, error } = await client()
    .from('user_diary')
    .insert({
      user_id: userId,
      tmdb_id: ref.tmdbId,
      media_type: ref.mediaType,
      title: ref.title,
      poster_path: ref.posterPath,
      watched_on: fields.watchedOn,
      rating: fields.rating,
      note: fields.note,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as DiaryEntry
}

export async function listDiary(userId: string): Promise<DiaryEntry[]> {
  const { data, error } = await client()
    .from('user_diary')
    .select('*')
    .eq('user_id', userId)
    .order('watched_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as DiaryEntry[]
}

export async function deleteDiaryEntry(id: string): Promise<void> {
  const { error } = await client().from('user_diary').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
