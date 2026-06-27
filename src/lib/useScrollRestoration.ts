import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Saves scroll position to sessionStorage on unmount and restores it once
 * content is ready (i.e. when `ready` flips to true after async data loads).
 *
 * Pass `key` to disambiguate pages that share the same pathname
 * (e.g. ListPage renders different statuses at different routes).
 */
export function useScrollRestoration(ready: boolean, key?: string) {
  const { pathname } = useLocation()
  const storageKey = `scroll-pos:${key ?? pathname}`

  // Save position when leaving the page.
  useEffect(() => {
    return () => {
      sessionStorage.setItem(storageKey, String(window.scrollY))
    }
  }, [storageKey])

  // Restore position after content has rendered.
  useEffect(() => {
    if (!ready) return
    const saved = sessionStorage.getItem(storageKey)
    if (!saved) return
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: parseInt(saved, 10), behavior: 'instant' })
      sessionStorage.removeItem(storageKey)
    })
    return () => cancelAnimationFrame(frame)
  }, [ready, storageKey])
}
