import { supabase } from './supabase'
import { fetchAllRows } from './paged'
import { costruisciRaccolte, type Raccolta } from './raccolte'
import type { MediaType, UserList, UserListItem } from './types'

function client() {
  if (!supabase) {
    throw new Error('Supabase non è configurato. Imposta le chiavi nel file .env.')
  }
  return supabase
}

export interface ListItemRef {
  tmdbId: number
  mediaType: MediaType
  title: string
  posterPath: string | null
}

export async function listLists(userId: string): Promise<UserList[]> {
  const { data, error } = await client()
    .from('user_lists')
    .select('*, user_list_items(count)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const { user_list_items, ...list } = row as UserList & {
      user_list_items?: { count: number }[]
    }
    return { ...list, item_count: user_list_items?.[0]?.count ?? 0 }
  })
}

export async function getList(id: string): Promise<UserList | null> {
  const { data, error } = await client().from('user_lists').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as UserList | null
}

export async function createList(
  userId: string,
  name: string,
  description: string | null,
): Promise<UserList> {
  const { data, error } = await client()
    .from('user_lists')
    .insert({ user_id: userId, name, description })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as UserList
}


// Rinomina una lista e/o ne cambia la descrizione. Prima l'unico modo di
// correggere un nome sbagliato era cancellare la lista e rifarla, perdendo
// tutti i titoli che conteneva; e la descrizione, pur esistendo nel database ed
// essendo mostrata nell'elenco, non era scrivibile da nessuna parte.
export async function updateList(
  id: string,
  fields: { name?: string; description?: string | null },
): Promise<UserList> {
  const patch: Record<string, unknown> = {}
  if (fields.name !== undefined) patch.name = fields.name
  if (fields.description !== undefined) patch.description = fields.description

  const { data, error } = await client()
    .from('user_lists')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as UserList
}

// Rende una lista pubblica (condivisibile via link) o di nuovo privata.
export async function setListPublic(id: string, isPublic: boolean): Promise<void> {
  const { error } = await client()
    .from('user_lists')
    .update({ is_public: isPublic })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await client().from('user_lists').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getListItems(listId: string): Promise<UserListItem[]> {
  const { data, error } = await client()
    .from('user_list_items')
    .select('*')
    .eq('list_id', listId)
    .order('added_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as UserListItem[]
}

export async function addToList(
  userId: string,
  listId: string,
  ref: ListItemRef,
): Promise<void> {
  const { error } = await client()
    .from('user_list_items')
    .upsert(
      {
        list_id: listId,
        user_id: userId,
        tmdb_id: ref.tmdbId,
        media_type: ref.mediaType,
        title: ref.title,
        poster_path: ref.posterPath,
      },
      { onConflict: 'list_id,tmdb_id,media_type' },
    )
  if (error) throw new Error(error.message)
  const { error: touchErr } = await client()
    .from('user_lists')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', listId)
  if (touchErr) throw new Error(touchErr.message)
}

export async function removeFromList(
  listId: string,
  tmdbId: number,
  mediaType: MediaType,
): Promise<void> {
  const { error } = await client()
    .from('user_list_items')
    .delete()
    .eq('list_id', listId)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
  if (error) throw new Error(error.message)
}

// Which of the user's lists already contain a given title (for the picker).
export async function listIdsContaining(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
): Promise<Set<string>> {
  const { data, error } = await client()
    .from('user_list_items')
    .select('list_id')
    .eq('user_id', userId)
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => (r as { list_id: string }).list_id))
}

// Le liste come raccolte della videoteca: ogni lista coi suoi titoli. I titoli
// di tutte le liste in una lettura (a pagine: con tante liste si superano le
// mille righe), non una richiesta per lista.
export async function raccolteUtente(userId: string): Promise<Raccolta[]> {
  const [liste, elementi] = await Promise.all([
    listeConCopertina(userId),
    fetchAllRows<{ list_id: string; tmdb_id: number; media_type: MediaType }>((from, to) =>
      client()
        .from('user_list_items')
        .select('list_id, tmdb_id, media_type')
        .eq('user_id', userId)
        .order('list_id', { ascending: true })
        .order('tmdb_id', { ascending: true })
        .order('media_type', { ascending: true })
        .range(from, to),
    ),
  ])
  return costruisciRaccolte(liste, elementi)
}

// Le liste con copertina e segno di saga. Se il database è indietro (i file
// schema_v20, v21 o v22 non eseguiti: lo dice la banda in cima) le raccolte ci
// sono lo stesso, col mosaico e senza saghe fatte a mano: non spariscono per
// una colonna che manca.
type RigaLista = { id: string; name: string; copertina?: string | null; come_saga?: boolean; saga_tmdb?: number | null }
async function listeConCopertina(userId: string): Promise<RigaLista[]> {
  const leggi = (colonne: string) =>
    client().from('user_lists').select(colonne).eq('user_id', userId).order('name', { ascending: true })
  for (const colonne of ['id, name, copertina, come_saga, saga_tmdb', 'id, name, copertina, come_saga', 'id, name, copertina', 'id, name']) {
    const { data, error } = await leggi(colonne)
    if (!error) return (data ?? []) as unknown as RigaLista[]
    if (error.code !== '42703' && !/copertina|come_saga|saga_tmdb/.test(error.message)) throw new Error(error.message)
  }
  return []
}

// La copertina di una lista: un percorso TMDB, un link https, o null per
// tornare al mosaico.
export async function aggiornaCopertina(listId: string, copertina: string | null): Promise<void> {
  const { error } = await client().from('user_lists').update({ copertina }).eq('id', listId)
  if (error) throw new Error(error.message)
}

// Una saga fatta a mano: una lista segnata come saga, coi film scelti. I
// titoli in una scrittura sola, non uno per volta. `sagaTmdb`: la collezione
// di TMDB che sostituisce, quando nasce modificandone una (Transformers).
export async function creaSaga(userId: string, nome: string, film: ListItemRef[], sagaTmdb: number | null = null): Promise<string> {
  return creaListaCon(userId, nome, film, true, sagaTmdb)
}

async function creaListaCon(userId: string, nome: string, titoli: ListItemRef[], comeSaga: boolean, sagaTmdb: number | null = null): Promise<string> {
  // Senza saga non si scrive la colonna: una raccolta si crea anche con un
  // database che non è ancora alla v21.
  const { data, error } = await client()
    .from('user_lists')
    .insert({ user_id: userId, name: nome, description: null, ...(comeSaga && { come_saga: true }), ...(sagaTmdb !== null && { saga_tmdb: sagaTmdb }) })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const id = (data as { id: string }).id
  await aggiungiTitoli(userId, id, titoli)
  return id
}

// Rinomina la saga (o la raccolta) e ne cambia i titoli: aggiunge quelli
// nuovi, toglie quelli tolti. I film tolti da una saga tornano al loro posto.
export async function modificaSaga(
  userId: string,
  listId: string,
  nome: string,
  aggiungi: ListItemRef[],
  togli: { tmdbId: number; mediaType: MediaType }[],
): Promise<void> {
  const { error } = await client().from('user_lists').update({ name: nome }).eq('id', listId)
  if (error) throw new Error(error.message)
  await aggiungiTitoli(userId, listId, aggiungi)
  for (const t of togli) await removeFromList(listId, t.tmdbId, t.mediaType)
}

async function aggiungiTitoli(userId: string, listId: string, film: ListItemRef[]): Promise<void> {
  if (film.length === 0) return
  const { error } = await client()
    .from('user_list_items')
    .upsert(
      film.map((f) => ({
        list_id: listId,
        user_id: userId,
        tmdb_id: f.tmdbId,
        media_type: f.mediaType,
        title: f.title,
        poster_path: f.posterPath,
      })),
      { onConflict: 'list_id,tmdb_id,media_type' },
    )
  if (error) throw new Error(error.message)
}
