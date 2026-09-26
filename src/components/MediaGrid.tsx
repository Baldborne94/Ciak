import type { MediaItem } from '../lib/types'
import MediaCard from './MediaCard'

export default function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item, i) => (
        // La prima riga (fino a 5 colonne) è quella che vedi subito: caricala
        // ad alta priorità invece che pigra, così non fissi riquadri grigi.
        <MediaCard key={`${item.mediaType}-${item.id}`} item={item} priority={i < 5} />
      ))}
    </div>
  )
}
