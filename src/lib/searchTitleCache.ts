import { creaCacheLocale } from './cacheLocale'

// I titoli con cui cercare un titolo salvato, oltre a quello italiano che
// user_titles già conserva: l'originale e quello inglese. Si chiedono a TMDB
// una volta per dispositivo, come gli anni di uscita (`releaseYearCache`).
// Un titolo cambia di rado (una traduzione che arriva tardi), ma cambia: dopo
// un mese si richiede.
const cache = creaCacheLocale<string[]>('ciak:titoli-ricerca:v1', {
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
