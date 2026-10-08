import { tmdbFetch } from './client'
import type { TmdbType } from '../types'

const IMG_BASE = 'https://image.tmdb.org/t/p'

export function posterUrl(
  path: string | null,
  size: 'w185' | 'w342' | 'w500' = 'w342',
): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null
}

export function backdropUrl(
  path: string | null,
  size: 'w300' | 'w780' | 'w1280' | 'original' = 'w1280',
): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null
}

export function profileUrl(path: string | null): string | null {
  return path ? `${IMG_BASE}/w185${path}` : null
}

export function logoUrl(path: string | null): string | null {
  return path ? `${IMG_BASE}/w154${path}` : null
}

interface ImmagineTmdb {
  file_path: string
  vote_average?: number
  iso_639_1?: string | null
}

// Gli sfondi e le locandine di un titolo, fra cui scegliere la copertina di
// una raccolta. Gli sfondi senza scritte (lingua null) vengono prima: sotto il
// nome della raccolta un titolo stampato si leggerebbe male. Poi i più votati.
export async function getImmaginiTitolo(
  mediaType: TmdbType,
  tmdbId: number,
): Promise<{ sfondi: string[]; locandine: string[] }> {
  const data = await tmdbFetch<{ backdrops?: ImmagineTmdb[]; posters?: ImmagineTmdb[] }>(`/${mediaType}/${tmdbId}/images`, {
    include_image_language: 'it,en,null',
  })
  const ordina = (lista: ImmagineTmdb[] = []) =>
    [...lista]
      .sort((a, b) => Number(!!a.iso_639_1) - Number(!!b.iso_639_1) || (b.vote_average ?? 0) - (a.vote_average ?? 0))
      .map((i) => i.file_path)
  return { sfondi: ordina(data.backdrops).slice(0, 8), locandine: ordina(data.posters).slice(0, 4) }
}
