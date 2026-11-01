import { tmdbFetch } from './client'
import { normalise, type RawMedia } from './raw'
import { isReadableTitle, patchReadableTitles } from './titles'
import type { MediaItem, TmdbType } from '../types'

// Le classifiche dei più belli («Da recuperare») e i film presi per id (le
// liste dei premi): ciò che serve a chi vuole sapere cosa vale la pena vedere.

export interface FiltriMigliori {
  genreIds?: number[]
  // Estremi di data già pronti per TMDB (YYYY-MM-DD), per restringere a un
  // decennio.
  dal?: string
  al?: string
  // Quanti voti servono perché un titolo sia preso sul serio.
  votiMinimi?: number
  // Solo l'animazione (genere 16), e la lingua originale: è così che Ciak
  // distingue gli anime (giapponese) dai cartoni (inglese), come nella ricerca.
  animazione?: boolean
  lingua?: string
}

// I parametri di /discover, a parte perché è qui che si sbaglia: il genere
// dell'animazione va in AND con quello scelto («anime horror»), non in OR, se
// no l'elenco si riempie di horror dal vero.
export function parametriMigliori(type: TmdbType, filtri: FiltriMigliori, page: number): Record<string, string> {
  const campoData = type === 'movie' ? 'primary_release_date' : 'first_air_date'
  const params: Record<string, string> = {
    sort_by: 'vote_average.desc',
    'vote_count.gte': String(filtri.votiMinimi ?? 1000),
    page: String(page),
  }
  const generi = (filtri.genreIds ?? []).filter((g) => g !== 16).slice(0, 3).join('|')
  if (filtri.animazione) params.with_genres = generi ? `16,${generi}` : '16'
  else if (generi) params.with_genres = generi
  if (filtri.lingua) params.with_original_language = filtri.lingua
  if (filtri.dal) params[`${campoData}.gte`] = filtri.dal
  if (filtri.al) params[`${campoData}.lte`] = filtri.al
  return params
}

// I titoli col voto medio più alto, sfogliabili. È la base di «Da recuperare».
//
// `vote_count.gte` non è un dettaglio: ordinando per voto medio senza una
// soglia, in cima finiscono i film con nove voti a dieci — cioè cortometraggi
// sconosciuti e documentari di nicchia, non i capolavori che uno si aspetta.
export async function discoverMigliori(
  type: TmdbType,
  filtri: FiltriMigliori = {},
  page = 1,
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const params = parametriMigliori(type, filtri, page)
  const [data, enData] = await Promise.all([
    tmdbFetch<{ results: RawMedia[]; total_pages?: number }>(`/discover/${type}`, params),
    tmdbFetch<{ results: RawMedia[] }>(`/discover/${type}`, { ...params, language: 'en-US' }),
  ])
  patchReadableTitles(data.results, enData.results)
  return {
    items: (data.results ?? []).map((r) => normalise(r, type)),
    totalPages: data.total_pages ?? 1,
  }
}

// Un film per id, come card: le liste dei premi arrivano da Wikidata con il
// solo id di TMDB. L'inglese si chiede solo se il titolo italiano non si legge.
export async function getFilmPerId(id: number): Promise<MediaItem> {
  const raw = await tmdbFetch<RawMedia>(`/movie/${id}`)
  if (!isReadableTitle(raw.title)) {
    const en = await tmdbFetch<RawMedia>(`/movie/${id}`, { language: 'en-US' })
    patchReadableTitles([raw], [en])
  }
  return normalise(raw, 'movie')
}
