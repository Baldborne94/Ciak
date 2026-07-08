import { supabase } from './supabase'
import { getUpcoming, getPersonDetail } from './tmdb'
import { listAll } from './userTitles'
import { listEntities } from './entities'
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

export interface PersonUpcoming {
  item: MediaItem
  people: string[] // followed people involved in this title
}

// Upcoming / just-released titles from the directors & actors the user follows
// (favorited people). Recent window of 30 days so "appena uscito" shows too;
// excludes anything already in the user's library.
export async function upcomingFromFollowedPeople(userId: string, limit = 24): Promise<PersonUpcoming[]> {
  const people = await listEntities(userId, 'person')
  if (people.length === 0) return []

  const library = await listAll(userId)
  const known = new Set(library.map((t) => `${t.media_type}-${t.tmdb_id}`))
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceStr = since.toISOString().slice(0, 10)

  // Cap the number of TMDB person lookups to keep the page snappy.
  const details = await Promise.all(
    people.slice(0, 12).map((p) =>
      getPersonDetail(p.entity_id).then((d) => ({
        name: p.name,
        credits: d.credits,
        department: d.department,
        mainCastKeys: new Set(d.mainCastKeys),
      })).catch(() => null),
    ),
  )

  // Keyed by "mediaType-id": TMDB numeric ids are only unique *within* a media
  // type, so a movie and a tv show can share the same id — keying by id alone
  // merged unrelated titles and misattributed one person's credit to another's
  // title (e.g. a film wrongly tagged with an actor who isn't actually in it).
  const byId = new Map<string, { item: MediaItem; people: Set<string> }>()
  for (const entry of details) {
    if (!entry) continue
    for (const c of entry.credits) {
      if (!c.releaseDate || c.releaseDate < sinceStr) continue // only recent/future
      const key = `${c.mediaType}-${c.id}`
      if (known.has(key)) continue // already tracked
      // Per gli attori, mostra il titolo solo se sono nel cast principale (non
      // un cameo/ruolo minore); registi/sceneggiatori ecc. non hanno questo
      // concetto di "billing", quindi il loro credito basta da solo.
      if (entry.department === 'Acting' && !entry.mainCastKeys.has(key)) continue
      const found = byId.get(key)
      if (found) found.people.add(entry.name)
      else byId.set(key, { item: c, people: new Set([entry.name]) })
    }
  }

  return [...byId.values()]
    .sort((a, b) => (a.item.releaseDate ?? '').localeCompare(b.item.releaseDate ?? ''))
    .slice(0, limit)
    .map((v) => ({ item: v.item, people: [...v.people] }))
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
