import { supabase } from './supabase'
import { getDetail, displayTitle } from './tmdb'
import { upsertUserTitle } from './userTitles'
import type { TitleStatus } from './types'

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

// Tiene allineato lo stato della serie in user_titles con il progresso reale
// degli episodi: appena segni un episodio la serie entra in "In corso", e
// quando hai visto tutti gli episodi disponibili diventa "Vista". Senza questo,
// il tracking episodi vivrebbe isolato — niente "In corso", niente conteggio
// "viste", nessun apporto al profilo di gusto o ai trofei.
export interface SeriesRef {
  tmdbId: number
  title: string
  posterPath: string | null
  genreIds: number[]
}

// Stato della serie in funzione del progresso. null = non toccare (0 visti).
// Esportata a parte così la logica è testabile senza Supabase.
export function seriesStatusFor(
  watchedCount: number,
  totalEpisodes: number,
): TitleStatus | null {
  if (watchedCount <= 0) return null
  return totalEpisodes > 0 && watchedCount >= totalEpisodes ? 'watched' : 'in_progress'
}

export async function syncSeriesStatus(
  userId: string,
  ref: SeriesRef,
  watchedCount: number,
  totalEpisodes: number,
): Promise<void> {
  // 0 episodi visti: non tocchiamo lo stato (non vogliamo declassare una serie
  // già segnata "vista" a mano, né creare righe fantasma).
  const status = seriesStatusFor(watchedCount, totalEpisodes)
  if (!status) return
  await upsertUserTitle(
    userId,
    {
      tmdbId: ref.tmdbId,
      mediaType: 'tv',
      title: ref.title,
      posterPath: ref.posterPath,
      genreIds: ref.genreIds,
    },
    {
      status,
      // Segna la data solo al completamento; in corso resta quella esistente.
      watched_at: status === 'watched' ? new Date().toISOString() : undefined,
    },
  )
}

export interface ContinueItem {
  tvId: number
  title: string
  posterPath: string | null
  genreIds: number[]
  season: number
  episode: number
  watchedCount: number
  totalEpisodes: number
}

// Series the user is watching → the next unwatched episode for each, most
// recently watched first. Used by the homepage "Riprendi a guardare" row.
// Excludes series the user has marked "Abbandonato" — dismissing one there
// hides it here without deleting the watched-episode history, so it can be
// picked back up later (see resumeAbandonedSeries).
export async function getContinueWatching(userId: string, limit = 8): Promise<ContinueItem[]> {
  const [episodesRes, abandonedRes] = await Promise.all([
    client()
      .from('user_episodes')
      .select('tv_id, season_number, episode_number, watched_at')
      .eq('user_id', userId)
      .order('watched_at', { ascending: false }),
    client()
      .from('user_titles')
      .select('tmdb_id')
      .eq('user_id', userId)
      .eq('media_type', 'tv')
      .eq('status', 'abandoned'),
  ])
  if (episodesRes.error) throw new Error(episodesRes.error.message)

  const abandonedIds = new Set(
    ((abandonedRes.data ?? []) as { tmdb_id: number }[]).map((r) => r.tmdb_id),
  )

  const rows = (episodesRes.data ?? []) as { tv_id: number; season_number: number; episode_number: number }[]
  const order: number[] = []
  const watchedByTv = new Map<number, Set<string>>()
  for (const r of rows) {
    if (abandonedIds.has(r.tv_id)) continue
    if (!watchedByTv.has(r.tv_id)) {
      watchedByTv.set(r.tv_id, new Set())
      order.push(r.tv_id)
    }
    watchedByTv.get(r.tv_id)!.add(epKey(r.season_number, r.episode_number))
  }

  const results = await Promise.all(
    order.slice(0, limit).map(async (tvId): Promise<ContinueItem | null> => {
      try {
        const detail = await getDetail('tv', tvId)
        const watched = watchedByTv.get(tvId)!
        const seasons = detail.seasons.filter((s) => s.seasonNumber > 0)
        let total = 0
        let next: { season: number; episode: number } | null = null
        for (const s of seasons) {
          total += s.episodeCount
          if (!next) {
            for (let e = 1; e <= s.episodeCount; e++) {
              if (!watched.has(epKey(s.seasonNumber, e))) {
                next = { season: s.seasonNumber, episode: e }
                break
              }
            }
          }
        }
        if (!next) return null // serie completata
        return {
          tvId,
          title: displayTitle(detail),
          posterPath: detail.posterPath,
          genreIds: detail.genreIds,
          season: next.season,
          episode: next.episode,
          watchedCount: watched.size,
          totalEpisodes: total,
        }
      } catch {
        return null
      }
    }),
  )
  return results.filter((x): x is ContinueItem => x !== null)
}

// Marca una serie come "Abbandonato": esce da "Riprendi a guardare" senza
// perdere gli episodi visti, così ripristinandola (status → in_progress) si
// riparte da dove si era interrotta.
export async function abandonSeries(
  userId: string,
  ref: { tmdbId: number; title: string; posterPath: string | null; genreIds: number[] },
): Promise<void> {
  await upsertUserTitle(
    userId,
    { tmdbId: ref.tmdbId, mediaType: 'tv', title: ref.title, posterPath: ref.posterPath, genreIds: ref.genreIds },
    { status: 'abandoned' },
  )
}
