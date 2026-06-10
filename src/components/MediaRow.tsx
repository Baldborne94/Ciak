import type { ReactNode } from 'react'
import type { MediaItem } from '../lib/types'
import MediaCard from './MediaCard'

const SCROLL = 'flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const CARD = 'w-32 shrink-0 sm:w-36 md:w-40'

// Horizontal scrolling row of TMDB media items.
export function MediaRow({ items }: { items: MediaItem[] }) {
  return (
    <div className={SCROLL}>
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`} className={CARD}>
          <MediaCard item={item} />
        </div>
      ))}
    </div>
  )
}

// Generic horizontal row — wrap each child at the standard card width.
export function ScrollRow({ children }: { children: ReactNode[] }) {
  return (
    <div className={SCROLL}>
      {children.map((child, i) => (
        <div key={i} className={CARD}>
          {child}
        </div>
      ))}
    </div>
  )
}
