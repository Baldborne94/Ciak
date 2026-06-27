import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Scroll position per history entry (location.key). In-memory is enough:
// it only needs to survive in-app back/forward, not a full page reload.
const positions = new Map<string, number>()

/**
 * Global scroll restoration. On forward navigation (PUSH/REPLACE) the page
 * starts at the top; on back/forward (POP) the previous scroll position of
 * that exact history entry is restored.
 *
 * Handles async pages: after a POP it keeps re-applying the target scroll
 * across animation frames until the content has grown tall enough to reach
 * it (lazy chunks + data fetches render progressively).
 */
export default function ScrollManager() {
  const location = useLocation()
  const navType = useNavigationType()
  const keyRef = useRef(location.key)

  // Track current history key so the scroll listener stores under the right
  // entry even right after a navigation.
  keyRef.current = location.key

  // Continuously record the scroll position for the current entry.
  useEffect(() => {
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        positions.set(keyRef.current, window.scrollY)
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // React to navigation: restore on POP, otherwise go to top.
  useLayoutEffect(() => {
    if (navType === 'POP') {
      const target = positions.get(location.key) ?? 0
      let attempts = 0
      let frame = 0
      const tick = () => {
        window.scrollTo(0, target)
        attempts += 1
        // Keep retrying while the page is still too short to reach the
        // target (content is loading in). Cap at ~1s worth of frames.
        if (window.scrollY < target - 2 && attempts < 60) {
          frame = requestAnimationFrame(tick)
        }
      }
      frame = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(frame)
    }
    // New navigation: start at the top.
    window.scrollTo(0, 0)
  }, [location.key, navType])

  return null
}
