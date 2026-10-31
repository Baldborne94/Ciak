import { creaCacheLocale } from './cacheLocale'
import type { Collection } from './types'

// I titoli con cui cercare un titolo salvato, oltre a quello che la riga già
// conserva: l'originale, l'inglese e l'italiano (v2: prima l'italiano non
// c'era, e la videoteca, che mostra l'originale, non si cercava in italiano). Si chiedono a TMDB
// una volta per dispositivo, come gli anni di uscita (`releaseYearCache`).
// Un titolo cambia di rado (una traduzione che arriva tardi), ma cambia: dopo
// un mese si richiede.
const cache = creaCacheLocale<string[]>('ciak:titoli-ricerca:v2', {
  durataMs: 30 * 24 * 60 * 60 * 1000,
  valido: (v): v is string[] => Array.isArray(v),
})

export function getCachedSearchTitles(keys: string[], now = Date.now()): Map<string, string[]> {
  return cache.leggi(keys, now)
}

export function cacheSearchTitles(titoli: Map<string, string[]>, now = Date.now()): void {
  cache.scrivi(titoli, now)
}

// I generi di TMDB (id) di un titolo, per filtrare la videoteca: anche questi
// cambiano di rado.
export const cacheGeneri = creaCacheLocale<number[]>('ciak:generi-titoli:v1', {
  durataMs: 30 * 24 * 60 * 60 * 1000,
  valido: (v): v is number[] => Array.isArray(v),
})

// La saga di un film (o null: nessuna), per le cartelle della videoteca. Il
// null si conserva come un valore: un film senza saga non va richiesto a ogni
// apertura.
export const cacheSaghe = creaCacheLocale<Collection | null>('ciak:saghe-titoli:v1', {
  durataMs: 30 * 24 * 60 * 60 * 1000,
  valido: (v): v is Collection | null =>
    v === null ||
    (typeof v === 'object' && typeof (v as Collection).id === 'number' && typeof (v as Collection).name === 'string'),
})

// Lingua originale e voto medio di TMDB di un titolo, per i filtri delle liste
// personali («Lingua», «Voto min», come nella ricerca). Il voto si muove, ma
// per filtrare basta quello di un mese fa.
export interface DettagliTitolo {
  lingua: string | null
  voto: number | null
}
export const cacheDettagli = creaCacheLocale<DettagliTitolo>('ciak:dettagli-titoli:v1', {
  durataMs: 30 * 24 * 60 * 60 * 1000,
  valido: (v): v is DettagliTitolo =>
    !!v && typeof v === 'object' && 'lingua' in v && 'voto' in v,
})
