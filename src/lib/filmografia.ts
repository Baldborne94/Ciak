import type { MediaItem } from './types'

// «Filmografie da completare»: di un regista o di un attore, quanti titoli hai
// visto e quali ti mancano. Contano solo quelli già usciti: un film annunciato
// per il 2028 non è una lacuna, e tenerlo nel totale renderebbe impossibile
// arrivare in fondo.

export type Visione = 'tutti' | 'mancano' | 'visti'

export function uscito(item: MediaItem, oggi = new Date().toISOString().slice(0, 10)): boolean {
  return !!item.releaseDate && item.releaseDate <= oggi
}

export function avanzamento(titoli: MediaItem[], visto: (item: MediaItem) => boolean, oggi?: string): { visti: number; totale: number } {
  const usciti = titoli.filter((t) => uscito(t, oggi))
  return { visti: usciti.filter(visto).length, totale: usciti.length }
}

export function perVisione(titoli: MediaItem[], modo: Visione, visto: (item: MediaItem) => boolean, oggi?: string): MediaItem[] {
  if (modo === 'visti') return titoli.filter(visto)
  if (modo === 'mancano') return titoli.filter((t) => uscito(t, oggi) && !visto(t))
  return titoli
}
