import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Tracks scroll position continuously and restores it when navigating back
 * (browser POP). On forward navigation the saved position is cleared so the
 * page starts at the top as usual.
 *
 * Pass `key` to disambiguate pages that share the same route structure
 * (e.g. ListPage renders at different paths for different statuses).
 */
export function useScrollRestoration(ready: boolean, key?: string) {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const storageKey = `scroll-pos:${key ?? pathname}`

  // Track scroll position in real time so we have the correct value even if
  // the browser resets scrollY before the component unmounts.
  useEffect(() => {
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        sessionStorage.setItem(storageKey, String(window.scrollY))
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [storageKey])

  // Restore on back navigation (POP); clear on fresh forward navigation.
  useEffect(() => {
    if (!ready) return
    if (navType !== 'POP') {
      sessionStorage.removeItem(storageKey)
      return
    }
    const saved = sessionStorage.getItem(storageKey)
    if (!saved) return
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: parseInt(saved, 10), behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [ready, storageKey, navType])
}
