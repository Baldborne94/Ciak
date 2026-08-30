import { supabase } from './supabase'
import { fetchAllRows } from './paged'
import { missingTitleRows } from './diaryBackfill'
import { getDetail } from './tmdb'
import type {
  DiaryEntry,
  MediaItem,
  MediaType,
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
  genreIds: number[]
}

export function refFromMedia(item: MediaItem): TitleRef {
  return {
    tmdbId: item.id,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    genreIds: item.genreIds,
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
  patch: Partial<Pick<UserTitle, 'status' | 'is_favorite' | 'personal_rating' | 'notes' | 'watched_at' | 'rewatch'>>,
): Promise<UserTitle> {
  const existing = await getUserTitle(userId, ref.tmdbId, ref.mediaType)

  const row = {
    user_id: userId,
    tmdb_id: ref.tmdbId,
    media_type: ref.mediaType,
    title: ref.title,
    poster_path: ref.posterPath,
    // Only update genre_ids if we have real data; preserve existing on pure metadata updates
    genre_ids: ref.genreIds.length > 0 ? ref.genreIds : (existing?.genre_ids ?? []),
    status: patch.status ?? existing?.status ?? 'to_watch',
    is_favorite: patch.is_favorite ?? existing?.is_favorite ?? false,
    personal_rating:
      patch.personal_rating !== undefined
        ? patch.personal_rating
        : (existing?.personal_rating ?? null),
    notes: patch.notes !== undefined ? patch.notes : (existing?.notes ?? null),
    watched_at:
      patch.watched_at !== undefined ? patch.watched_at : (existing?.watched_at ?? null),
    rewatch: patch.rewatch !== undefined ? patch.rewatch : (existing?.rewatch ?? false),
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

// La watchlist "Da vedere" include sia i titoli con stato to_watch sia quelli
// già visti ma marcati "Da rivedere" (rewatch), così un film visto può tornare
// in lista senza perdere lo stato "Visto".
export async function listWatchlist(userId: string): Promise<UserTitle[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .or('status.eq.to_watch,rewatch.eq.true')
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

// Supabase tronca ogni risposta REST a un massimo di righe (1000 di default):
// una `select()` secca su una collezione grande ne restituisce solo una parte,
// e senza `order` la parte è pure arbitraria — cambia da una richiesta all'altra.
// Il sintomo era subdolo: alcuni titoli non mostravano il badge "✓ Visto" sulle
// card pur essendo salvati, e non sempre gli stessi.
// Qui scorriamo tutte le pagine, con un ordine stabile perché la paginazione
// abbia senso (senza, la pagina 2 può ripetere o saltare righe).
export async function listAll(userId: string): Promise<UserTitle[]> {
  const db = client()
  return fetchAllRows<UserTitle>((from, to) =>
    db.from(TABLE).select('*').eq('user_id', userId).order('id', { ascending: true }).range(from, to),
  )
}


// Ricostruisce le schede dei titoli che risultano visti nel diario ma non hanno
// una riga in user_titles (vedi src/lib/diaryBackfill.ts per il perché).
// Riceve i dati già letti da chi chiama: il Diario li ha entrambi in mano,
// quindi la riparazione non costa nemmeno una lettura in più.
// Torna quante schede ha creato. Best-effort: un errore non deve impedire di
// vedere il diario.
export async function backfillTitlesFromDiary(
  userId: string,
  diary: DiaryEntry[],
  titles: UserTitle[],
): Promise<number> {
  const mancanti = missingTitleRows(diary, titles)
  if (mancanti.length === 0) return 0

  const { error } = await client()
    .from(TABLE)
    .upsert(
      mancanti.map((r) => ({ ...r, user_id: userId, is_favorite: false, notes: null, genre_ids: [] })),
      { onConflict: 'user_id,tmdb_id,media_type' },
    )
  if (error) throw new Error(error.message)
  return mancanti.length
}

// I titoli salvati prima del fix sui generi hanno `genre_ids` vuoto: il
// dettaglio TMDB esponeva i generi come oggetti e non venivano persistiti.
// Questo backfill, una tantum, recupera i generi dei titoli ancora vuoti e li
// salva, così il "Profilo di gusto" si popola anche per lo storico.
// Best-effort: gli errori sui singoli titoli non bloccano gli altri.
export async function backfillGenreIds(userId: string): Promise<number> {
  const db = client()
  const { data, error } = await db
    .from(TABLE)
    .select('id, tmdb_id, media_type, genre_ids')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)

  const missing = (data ?? []).filter(
    (r) => !r.genre_ids || (r.genre_ids as number[]).length === 0,
  ) as Pick<UserTitle, 'id' | 'tmdb_id' | 'media_type'>[]

  let updated = 0
  for (const r of missing) {
    try {
      const type: TmdbType = r.media_type === 'movie' ? 'movie' : 'tv'
      const detail = await getDetail(type, r.tmdb_id)
      if (detail.genreIds.length === 0) continue
      const { error: upErr } = await db
        .from(TABLE)
        .update({ genre_ids: detail.genreIds })
        .eq('user_id', userId)
        .eq('id', r.id)
      if (!upErr) updated++
    } catch {
      // titolo non risolvibile (rimosso da TMDB, rete, ecc.): si salta.
    }
  }
  return updated
}

export interface UserStats {
  watched: number
  favorites: number
  toWatch: number
  inProgress: number
}

export async function getStats(userId: string): Promise<UserStats> {
  const db = client()
  // Paginata: senza, oltre 1000 titoli le statistiche mostravano totali più
  // bassi del vero senza dare alcun segnale che mancasse qualcosa.
  const rows = await fetchAllRows<{ status: TitleStatus; is_favorite: boolean }>((from, to) =>
    db
      .from(TABLE)
      .select('status, is_favorite')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, to),
  )

  return {
    watched: rows.filter((r) => r.status === 'watched').length,
    favorites: rows.filter((r) => r.is_favorite).length,
    toWatch: rows.filter((r) => r.status === 'to_watch').length,
    inProgress: rows.filter((r) => r.status === 'in_progress').length,
  }
}

// ── Condivisione watchlist "Da vedere" ──────────────────────────────────────

// Stato di condivisione della watchlist del proprietario (true = link pubblico).
export async function getWatchlistPublic(userId: string): Promise<boolean> {
  const { data } = await client()
    .from('user_profile')
    .select('watchlist_public')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { watchlist_public: boolean } | null)?.watchlist_public ?? false
}

export async function setWatchlistPublic(userId: string, isPublic: boolean): Promise<void> {
  const { error } = await client()
    .from('user_profile')
    .upsert({ user_id: userId, watchlist_public: isPublic })
  if (error) throw new Error(error.message)
}

export interface PublicWatchlistItem {
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
}

// Watchlist pubblica di un altro utente (via funzione SECURITY DEFINER): torna
// vuota se l'utente non esiste o non ha attivato la condivisione.
export async function getPublicWatchlist(targetUserId: string): Promise<PublicWatchlistItem[]> {
  const { data, error } = await client().rpc('get_public_watchlist', { target: targetUserId })
  if (error) throw new Error(error.message)
  return (data ?? []) as PublicWatchlistItem[]
}


export interface StoredIdentity {
  nickname: string | null
  avatar_style: string | null
  avatar_seed: string | null
  theme: string | null
}

export async function getIdentity(userId: string): Promise<StoredIdentity | null> {
  const { data } = await client()
    .from('user_profile')
    .select('nickname, avatar_style, avatar_seed, theme')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as StoredIdentity | null) ?? null
}

export async function saveIdentity(
  userId: string,
  identity: { nickname: string; avatarStyle: string; avatarSeed: string; theme: string },
): Promise<void> {
  const { error } = await client().from('user_profile').upsert({
    user_id: userId,
    nickname: identity.nickname,
    avatar_style: identity.avatarStyle,
    avatar_seed: identity.avatarSeed,
    theme: identity.theme,
  })
  if (error) throw new Error(error.message)
}
