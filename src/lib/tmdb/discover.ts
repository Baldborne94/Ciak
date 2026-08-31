import { tmdbFetch } from './client'
import { normalise, type RawMedia } from './raw'
import { patchReadableTitles } from './titles'
import type { MediaItem, TmdbType } from '../types'

// "popularity.desc" is recalculated continuously by TMDB, so paginating by it
// ("Carica altri") can reshuffle items between page fetches — the same title
// can shift past the page boundary and reappear, or skip a slot entirely,
// which reads as "disordered" duplicates once pages are appended client-side.
// vote_count only grows, so it doesn't drift between two nearby requests —
// used here for browse lists where stable pagination matters more than
// minute-to-minute freshness.
export const STABLE_BROWSE_SORT = 'vote_count.desc'

// Sort choice for the anime/cartoons browse — mirrors the "Ordina" dropdown so
// the actual TMDB query comes back pre-sorted. This matters for "Carica altri":
// if sorting only happened client-side on the accumulated list, every new page
// would re-shuffle titles already on screen (looked like the list was being
// "recreated" instead of continued). Sorting server-side means each page
// arrives in final order and can simply be appended.
export type BrowseSort = 'popular' | 'rating' | 'date_desc' | 'date_asc'

export function browseSortParam(sort: BrowseSort | undefined): string {
  if (sort === 'rating') return 'vote_average.desc'
  if (sort === 'date_desc') return 'first_air_date.desc'
  if (sort === 'date_asc') return 'first_air_date.asc'
  return STABLE_BROWSE_SORT
}

// Discover with a readable title: fetch IT (for poster/overview) + EN, and when
// the localized title is in a non-Latin script use the English one instead.
export async function discoverReadable(
  type: TmdbType,
  params: Record<string, string>,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const [it, en] = await Promise.all([
    tmdbFetch<{ results: RawMedia[]; total_pages: number }>(`/discover/${type}`, params),
    tmdbFetch<{ results: RawMedia[] }>(`/discover/${type}`, { ...params, language: 'en-US' }),
  ])
  patchReadableTitles(it.results, en.results)
  return { items: it.results.map((r) => normalise(r, type)), totalPages: it.total_pages }
}
