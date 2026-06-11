import { supabase } from './supabase'

function client() {
  if (!supabase) {
    throw new Error('Supabase non è configurato. Imposta le chiavi nel file .env.')
  }
  return supabase
}

export function epKey(season: number, episode: number): string {
  return `${season}-${episode}`
}

// All watched episodes of a series, as a Set of "season-episode" keys.
export async function listWatchedEpisodes(userId: string, tvId: number): Promise<Set<string>> {
  const { data, error } = await client()
    .from('user_episodes')
    .select('season_number, episode_number')
    .eq('user_id', userId)
    .eq('tv_id', tvId)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { season_number: number; episode_number: number }[]
  return new Set(rows.map((r) => epKey(r.season_number, r.episode_number)))
}

export async function markEpisode(
  userId: string,
  tvId: number,
  season: number,
  episode: number,
): Promise<void> {
  const { error } = await client()
    .from('user_episodes')
    .upsert(
      { user_id: userId, tv_id: tvId, season_number: season, episode_number: episode },
      { onConflict: 'user_id,tv_id,season_number,episode_number' },
    )
  if (error) throw new Error(error.message)
}

export async function unmarkEpisode(
  userId: string,
  tvId: number,
  season: number,
  episode: number,
): Promise<void> {
  const { error } = await client()
    .from('user_episodes')
    .delete()
    .eq('user_id', userId)
    .eq('tv_id', tvId)
    .eq('season_number', season)
    .eq('episode_number', episode)
  if (error) throw new Error(error.message)
}

// Mark every episode of a season as watched (bulk upsert).
export async function markSeason(
  userId: string,
  tvId: number,
  season: number,
  episodeNumbers: number[],
): Promise<void> {
  const rows = episodeNumbers.map((n) => ({
    user_id: userId,
    tv_id: tvId,
    season_number: season,
    episode_number: n,
  }))
  const { error } = await client()
    .from('user_episodes')
    .upsert(rows, { onConflict: 'user_id,tv_id,season_number,episode_number' })
  if (error) throw new Error(error.message)
}

export async function unmarkSeason(
  userId: string,
  tvId: number,
  season: number,
): Promise<void> {
  const { error } = await client()
    .from('user_episodes')
    .delete()
    .eq('user_id', userId)
    .eq('tv_id', tvId)
    .eq('season_number', season)
  if (error) throw new Error(error.message)
}
