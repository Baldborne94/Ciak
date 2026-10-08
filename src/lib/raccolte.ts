import type { MediaType } from './types'

// Le raccolte della videoteca sono le «Mie liste»: una lista («Studio
// Ghibli», «Natale») diventa una cartella con dentro i titoli che sono su
// Drive. Si decide cosa metterci da «Aggiungi a lista», senza spostare file, e
// un film può stare in più raccolte.

export interface Raccolta {
  id: string
  nome: string
  // I titoli della lista, come chiavi composte `${tipo}-${id}` di TMDB.
  chiavi: Set<string>
}

// Le liste salvano anche «anime» e «cartoon», che su TMDB sono film o serie:
// la lista non dice quale, e vanno bene tutti e due.
export function chiaviElemento(mediaType: MediaType, tmdbId: number): string[] {
  if (mediaType === 'movie') return [`movie-${tmdbId}`]
  if (mediaType === 'tv') return [`tv-${tmdbId}`]
  return [`movie-${tmdbId}`, `tv-${tmdbId}`]
}

export function costruisciRaccolte(
  liste: { id: string; name: string }[],
  elementi: { list_id: string; tmdb_id: number; media_type: MediaType }[],
): Raccolta[] {
  const perLista = new Map<string, Set<string>>(liste.map((l) => [l.id, new Set()]))
  for (const e of elementi) {
    for (const k of chiaviElemento(e.media_type, e.tmdb_id)) perLista.get(e.list_id)?.add(k)
  }
  return liste.map((l) => ({ id: l.id, nome: l.name, chiavi: perLista.get(l.id) ?? new Set() }))
}
