import { createContext, useContext } from 'react'
import type { TitleStatus } from './types'

// A lightweight index of the user's collection, so any MediaCard can show
// whether a title is already watched / in a list / a favorite.
export interface LibraryEntry {
  status: TitleStatus
  isFavorite: boolean
  rating: number | null
}

export interface LibraryCtxValue {
  lookup: (mediaType: string, tmdbId: number) => LibraryEntry | undefined
  refresh: () => void
}

export const LibraryCtx = createContext<LibraryCtxValue>({
  lookup: () => undefined,
  refresh: () => {},
})

export function useLibrary() {
  return useContext(LibraryCtx)
}

export function libKey(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`
}

// Cerca un titolo nell'indice della collezione. Le card parlano la lingua di
// TMDB (`tv`), l'archivio quella di Ciak: un anime o un cartone si salva come
// `anime` o `cartoon`. Senza il ripiego, un anime già visto restava senza
// «✓ Visto» in ogni griglia del catalogo.
export function cercaInIndice<T>(index: Map<string, T>, mediaType: string, tmdbId: number): T | undefined {
  const diretto = index.get(libKey(mediaType, tmdbId))
  if (diretto || mediaType !== 'tv') return diretto
  return index.get(libKey('anime', tmdbId)) ?? index.get(libKey('cartoon', tmdbId))
}
