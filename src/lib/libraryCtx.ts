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
