import { tmdbFetch } from './client'
import { normalise, type RawCompany, type RawMedia } from './raw'
import { patchReadableTitles, isReadableTitle } from './titles'
import type { Company, MediaItem } from '../types'

// Resolve a curated list of names to real TMDB entities (with logos/photos),
// taking the top match for each. Used for the idle "famous" previews.
export async function resolveStudios(names: string[]): Promise<Company[]> {
  const found = await Promise.all(
    names.map((n) => searchCompany(n).then((r) => r[0] ?? null).catch(() => null)),
  )
  return found.filter((c): c is Company => c !== null)
}

export async function searchCompany(query: string): Promise<Company[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<{ results: RawCompany[] }>('/search/company', {
    query,
  })
  return data.results.map((c) => ({
    id: c.id,
    name: c.name,
    logoPath: c.logo_path ?? null,
  }))
}

// Un nome di compagnia leggibile: TMDB non traduce i nomi degli studi e non
// espone un `original_name`, quindi per un nome in uno script non latino l'unica
// fonte di una versione latina sono i nomi alternativi/internazionali. Solo per
// i nomi NON leggibili — nessuna chiamata extra per gli studi "occidentali"; se
// non ne esiste uno leggibile resta il nome originale. Best-effort.
export async function readableCompanyName(id: number, name: string): Promise<string> {
  if (isReadableTitle(name)) return name
  try {
    const alt = await tmdbFetch<{ results?: { name: string }[] }>(
      `/company/${id}/alternative_names`,
    )
    return (alt.results ?? []).map((r) => r.name).find((n) => isReadableTitle(n)) ?? name
  } catch {
    return name
  }
}

export async function getCompany(id: number): Promise<Company> {
  const raw = await tmdbFetch<RawCompany>(`/company/${id}`)
  return { id: raw.id, name: await readableCompanyName(id, raw.name), logoPath: raw.logo_path ?? null }
}

export async function discoverByCompany(
  companyId: number,
  page = 1,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const params = {
    with_companies: String(companyId),
    sort_by: 'popularity.desc',
    page: String(page),
  }
  const [data, enData] = await Promise.all([
    tmdbFetch<{ results: RawMedia[]; total_pages: number }>('/discover/movie', params),
    tmdbFetch<{ results: RawMedia[] }>('/discover/movie', { ...params, language: 'en-US' }),
  ])
  patchReadableTitles(data.results, enData.results)
  return {
    items: data.results.map((r) => normalise(r, 'movie')),
    totalPages: data.total_pages,
  }
}
