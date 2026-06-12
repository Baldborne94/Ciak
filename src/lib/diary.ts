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

  // Il voto del diario vale anche come voto del titolo: senza questa
  // sincronizzazione il profilo di gusto (che legge user_titles) non lo vede.
  if (fields.rating != null) {
    await syncRatingToUserTitle(userId, ref, fields.rating, fields.watchedOn).catch(() => {})
  }

  return data as DiaryEntry
}

async function syncRatingToUserTitle(
  userId: string,
  ref: DiaryRef,
  rating: number,
  watchedOn: string,
): Promise<void> {
  const db = client()
  const { data: existing } = await db
    .from('user_titles')
    .select('*')
    .eq('user_id', userId)
    .eq('tmdb_id', ref.tmdbId)
    .eq('media_type', ref.mediaType)
    .maybeSingle()

  await db.from('user_titles').upsert(
    {
      user_id: userId,
      tmdb_id: ref.tmdbId,
      media_type: ref.mediaType,
      title: ref.title,
      poster_path: ref.posterPath,
      genre_ids: existing?.genre_ids ?? [],
      // Un titolo segnato nel diario è stato visto; se esiste già una riga
      // ne preserviamo lo stato (es. una serie ancora "in corso").
      status: existing?.status ?? 'watched',
      is_favorite: existing?.is_favorite ?? false,
      personal_rating: rating,
      notes: existing?.notes ?? null,
      watched_at: existing?.watched_at ?? watchedOn,
    },
    { onConflict: 'user_id,tmdb_id,media_type' },
  )
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
