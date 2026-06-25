import { supabase } from './supabase'
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
