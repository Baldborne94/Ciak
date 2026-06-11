import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MediaItem } from '../lib/types'
import MediaCard from './MediaCard'

const SCROLL = 'flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const CARD = 'w-32 shrink-0 sm:w-36 md:w-40'

// Horizontal carousel with arrow controls + vertical-wheel-to-horizontal scroll,
// so it works with a regular mouse (not just trackpad/shift+wheel).
function Carousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  function update() {
    const el = ref.current
    if (!el) return
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', update)
    }
  }, [children])

  function scrollByDir(dir: number) {
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' })
  }

  const arrow =
    'absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-theatre-700 bg-theatre-950/90 text-xl text-projector shadow-reel transition hover:bg-theatre-800'

  return (
    <div className="relative">
      <div ref={ref} className={SCROLL}>
        {children}
      </div>

      {!atStart && (
        <button onClick={() => scrollByDir(-1)} aria-label="Scorri a sinistra" className={`${arrow} left-1`}>
          ‹
        </button>
      )}
      {!atEnd && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-theatre-950 to-transparent" />
          <button onClick={() => scrollByDir(1)} aria-label="Scorri a destra" className={`${arrow} right-1`}>
            ›
          </button>
        </>
      )}
    </div>
  )
}

// Horizontal scrolling row of TMDB media items.
export function MediaRow({ items }: { items: MediaItem[] }) {
  return (
    <Carousel>
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`} className={CARD}>
          <MediaCard item={item} />
        </div>
      ))}
    </Carousel>
  )
}

// Generic horizontal row — wrap each child at the standard card width.
export function ScrollRow({ children }: { children: ReactNode[] }) {
  return (
    <Carousel>
      {children.map((child, i) => (
        <div key={i} className={CARD}>
          {child}
        </div>
      ))}
    </Carousel>
  )
}
