import { Link } from 'react-router-dom'
import type { MediaItem } from '../lib/types'
import { posterUrl } from '../lib/tmdb'

export default function MediaCard({ item }: { item: MediaItem }) {
  const poster = posterUrl(item.posterPath)
  const year = item.releaseDate ? item.releaseDate.slice(0, 4) : '—'

  return (
    <Link
      to={`/title/${item.mediaType}/${item.id}`}
      className="group relative block overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40 hover:shadow-reel"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
        {poster ? (
          <img
            src={poster}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-30">
            🎞️
          </div>
        )}
      </div>

      <span className="absolute right-2 top-2 rounded-md bg-theatre-950/80 px-1.5 py-0.5 text-xs font-semibold text-projector backdrop-blur">
        ★ {item.voteAverage.toFixed(1)}
      </span>

      <div className="p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-zinc-100">
          {item.title}
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {item.mediaType === 'tv' ? 'Serie TV' : 'Film'} · {year}
        </p>
      </div>
    </Link>
  )
}
