import type { MediaType } from './types'
import { backdropUrl } from './tmdb/images'

// Le raccolte della videoteca sono le «Mie liste»: una lista («Studio
// Ghibli», «Natale») diventa una cartella con dentro i titoli che sono su
// Drive. Si decide cosa metterci da «Aggiungi a lista», senza spostare file, e
// un film può stare in più raccolte.

export interface Raccolta {
  id: string
  nome: string
  // I titoli della lista, come chiavi composte `${tipo}-${id}` di TMDB.
  chiavi: Set<string>
  // L'immagine scelta: un percorso TMDB («/abc.jpg») o un link https. null:
  // Ciak compone un mosaico con le locandine dei titoli.
  copertina: string | null
}

// Le liste salvano anche «anime» e «cartoon», che su TMDB sono film o serie:
// la lista non dice quale, e vanno bene tutti e due.
export function chiaviElemento(mediaType: MediaType, tmdbId: number): string[] {
  if (mediaType === 'movie') return [`movie-${tmdbId}`]
  if (mediaType === 'tv') return [`tv-${tmdbId}`]
  return [`movie-${tmdbId}`, `tv-${tmdbId}`]
}

export function costruisciRaccolte(
  liste: { id: string; name: string; copertina?: string | null }[],
  elementi: { list_id: string; tmdb_id: number; media_type: MediaType }[],
): Raccolta[] {
  const perLista = new Map<string, Set<string>>(liste.map((l) => [l.id, new Set()]))
  for (const e of elementi) {
    for (const k of chiaviElemento(e.media_type, e.tmdb_id)) perLista.get(e.list_id)?.add(k)
  }
  return liste.map((l) => ({ id: l.id, nome: l.name, chiavi: perLista.get(l.id) ?? new Set(), copertina: l.copertina ?? null }))
}

// L'indirizzo dell'immagine di una copertina. Un link incollato si usa solo se
// è https: un http su una pagina https il browser non lo mostra, e uno
// «javascript:» non deve arrivare mai in un src.
export function copertinaUrl(valore: string | null, misura: 'w780' | 'w1280' = 'w1280'): string | null {
  if (!valore) return null
  if (valore.startsWith('/')) return backdropUrl(valore, misura)
  return linkCopertinaValido(valore)
}

export function linkCopertinaValido(testo: string): string | null {
  const pulito = testo.trim()
  try {
    const url = new URL(pulito)
    return url.protocol === 'https:' && url.hostname ? url.href : null
  } catch {
    return null
  }
}
