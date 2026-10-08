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
  // Per ogni chiave, le righe della lista che la portano: togliendo «tv-1429»
  // va tolta la riga salvata come «anime», che la chiave da sola non dice.
  voci: Map<string, { tmdbId: number; mediaType: MediaType }[]>
  // L'immagine scelta: un percorso TMDB («/abc.jpg») o un link https. null:
  // Ciak compone un mosaico con le locandine dei titoli.
  copertina: string | null
  // Segnata come saga: non un riquadro in cima, ma una cartella nell'elenco
  // che raccoglie i suoi film, come le saghe di TMDB (vedi saghe.ts).
  comeSaga: boolean
}

// Le liste salvano anche «anime» e «cartoon», che su TMDB sono film o serie:
// la lista non dice quale, e vanno bene tutti e due.
export function chiaviElemento(mediaType: MediaType, tmdbId: number): string[] {
  if (mediaType === 'movie') return [`movie-${tmdbId}`]
  if (mediaType === 'tv') return [`tv-${tmdbId}`]
  return [`movie-${tmdbId}`, `tv-${tmdbId}`]
}

export function costruisciRaccolte(
  liste: { id: string; name: string; copertina?: string | null; come_saga?: boolean }[],
  elementi: { list_id: string; tmdb_id: number; media_type: MediaType }[],
): Raccolta[] {
  const perLista = new Map<string, Map<string, { tmdbId: number; mediaType: MediaType }[]>>(liste.map((l) => [l.id, new Map()]))
  for (const e of elementi) {
    const voci = perLista.get(e.list_id)
    if (!voci) continue
    for (const k of chiaviElemento(e.media_type, e.tmdb_id)) voci.set(k, [...(voci.get(k) ?? []), { tmdbId: e.tmdb_id, mediaType: e.media_type }])
  }
  return liste.map((l) => {
    const voci = perLista.get(l.id) ?? new Map()
    return { id: l.id, nome: l.name, chiavi: new Set(voci.keys()), voci, copertina: l.copertina ?? null, comeSaga: !!l.come_saga }
  })
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
