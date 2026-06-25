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

function refOf(entry: DiaryEntry): DiaryRef {
  return {
    tmdbId: entry.tmdb_id,
    mediaType: entry.media_type,
    title: entry.title,
    posterPath: entry.poster_path,
  }
}

export async function addDiaryEntry(
  userId: string,
  ref: DiaryRef,
  fields: { watchedOn: string; rating: number | null; note: string | null },
): Promise<DiaryEntry> {
  const db = client()

  // Anti-duplicato: stesso film, stesso giorno → aggiorniamo la voce esistente
  // invece di crearne una nuova. Una ri-visione in una data diversa resta una
  // voce a sé (il diario è un registro di visioni).
  const { data: existing } = await db
    .from('user_diary')
    .select('id')
    .eq('user_id', userId)
    .eq('tmdb_id', ref.tmdbId)
    .eq('media_type', ref.mediaType)
    .eq('watched_on', fields.watchedOn)
    .maybeSingle()

  let data: DiaryEntry
  if (existing) {
    const res = await db
      .from('user_diary')
      .update({
        title: ref.title,
        poster_path: ref.posterPath,
        rating: fields.rating,
        note: fields.note,
      })
      .eq('id', (existing as { id: string }).id)
      .select()
      .single()
    if (res.error) throw new Error(res.error.message)
    data = res.data as DiaryEntry
  } else {
    const res = await db
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
    if (res.error) throw new Error(res.error.message)
    data = res.data as DiaryEntry
  }

  // Il voto del diario vale anche come voto del titolo: senza questa
  // sincronizzazione il profilo di gusto (che legge user_titles) non lo vede.
  if (fields.rating != null) {
    await syncRatingToUserTitle(userId, ref, fields.rating, fields.watchedOn).catch(() => {})
  } else {
    // Voto rimosso da questa visione: ricalcola dal resto del diario.
    await resyncUserTitleRating(userId, ref).catch(() => {})
  }

  return data
}

// Modifica una voce di diario esistente (es. correggere il voto dal diario).
export async function updateDiaryEntry(
  userId: string,
  entry: DiaryEntry,
  fields: { rating?: number | null; note?: string | null },
): Promise<DiaryEntry> {
  const db = client()
  const patch: Record<string, unknown> = {}
  if (fields.rating !== undefined) patch.rating = fields.rating
  if (fields.note !== undefined) patch.note = fields.note

  const { data, error } = await db
    .from('user_diary')
    .update(patch)
    .eq('id', entry.id)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new Error(error.message)

  // Mantieni allineato il voto in user_titles (vince la visione più recente).
  await resyncUserTitleRating(userId, refOf(entry)).catch(() => {})
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

  const { error } = await db.from('user_titles').upsert(
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
  if (error) throw new Error(error.message)
}

// Ricalcola il voto del titolo (user_titles.personal_rating) a partire dalle
// visioni rimaste nel diario: vince quella più recente che ha un voto, altrimenti
// il voto viene azzerato. Non crea schede dal nulla: aggiorna solo righe esistenti.
async function resyncUserTitleRating(userId: string, ref: DiaryRef): Promise<void> {
  const db = client()

  const { data: existing } = await db
    .from('user_titles')
    .select('id')
    .eq('user_id', userId)
    .eq('tmdb_id', ref.tmdbId)
    .eq('media_type', ref.mediaType)
    .maybeSingle()
  if (!existing) return

  const { data: rows } = await db
    .from('user_diary')
    .select('rating')
    .eq('user_id', userId)
    .eq('tmdb_id', ref.tmdbId)
    .eq('media_type', ref.mediaType)
    .not('rating', 'is', null)
    .order('watched_on', { ascending: false })
    .limit(1)

  const rating = (rows?.[0] as { rating: number } | undefined)?.rating ?? null
  const { error } = await db
    .from('user_titles')
    .update({ personal_rating: rating })
    .eq('id', (existing as { id: string }).id)
  if (error) throw new Error(error.message)
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

export async function deleteDiaryEntry(userId: string, entry: DiaryEntry): Promise<void> {
  const { error } = await client()
    .from('user_diary')
    .delete()
    .eq('id', entry.id)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)

  // Eliminando una visione votata, allinea (o azzera) il voto sincronizzato in
  // user_titles, così il profilo di gusto non resta con un voto fantasma.
  if (entry.rating != null) {
    await resyncUserTitleRating(userId, refOf(entry)).catch(() => {})
  }
}
