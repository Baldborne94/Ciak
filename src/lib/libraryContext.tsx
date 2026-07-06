import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { listAll } from './userTitles'
import { LibraryCtx, libKey, type LibraryEntry } from './libraryCtx'

// Loads the user's collection once (per user) and keeps it in a Map for O(1)
// lookups from MediaCard. `refresh()` lets mutation points (TitleActions) keep
// the badges up to date after a change.
export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [index, setIndex] = useState<Map<string, LibraryEntry>>(new Map())

  const load = useCallback(() => {
    if (!user) {
      setIndex(new Map())
      return
    }
    listAll(user.id)
      .then((titles) => {
        const m = new Map<string, LibraryEntry>()
        for (const t of titles) {
          m.set(libKey(t.media_type, t.tmdb_id), { status: t.status, isFavorite: t.is_favorite })
        }
        setIndex(m)
      })
      .catch(() => {})
  }, [user])

  useEffect(() => { load() }, [load])

  const value = useMemo(
    () => ({
      lookup: (mediaType: string, tmdbId: number) => index.get(libKey(mediaType, tmdbId)),
      refresh: load,
    }),
    [index, load],
  )

  return <LibraryCtx.Provider value={value}>{children}</LibraryCtx.Provider>
}
