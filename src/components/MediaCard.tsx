import { Link } from 'react-router-dom'
import type { MediaItem, TitleStatus } from '../lib/types'
import { posterUrl, displayTitle } from '../lib/tmdb'
import { useLibrary } from '../lib/libraryCtx'

// Badge shown on a card when the title is already in the user's collection.
const LIB_BADGE: Record<TitleStatus, { label: string; cls: string }> = {
  watched: { label: '✓ Visto', cls: 'bg-emerald-600/90 text-white' },
  in_progress: { label: '▶ In corso', cls: 'bg-projector/90 text-theatre-950' },
  to_watch: { label: '🎟️ In lista', cls: 'bg-sky-600/90 text-white' },
  abandoned: { label: '✕ Mollato', cls: 'bg-zinc-600/90 text-white' },
}

export default function MediaCard({ item }: { item: MediaItem }) {
  const { lookup } = useLibrary()
  const lib = lookup(item.mediaType, item.id)
  const poster = posterUrl(item.posterPath)
  const year = item.releaseDate ? item.releaseDate.slice(0, 4) : '—'
  // Original title when readable; localized (IT/EN) for Japanese etc.
  const display = displayTitle(item)

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

      {/* Already-in-collection badge (status + optional favorite heart) */}
      {lib && (
        <span
          className={`absolute left-2 top-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur ${LIB_BADGE[lib.status].cls}`}
        >
          {LIB_BADGE[lib.status].label}
          {lib.isFavorite && <span aria-label="preferito">❤️</span>}
        </span>
      )}

      <div className="p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-zinc-100" title={display}>
          {display}
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {item.mediaType === 'tv' ? 'Serie TV' : 'Film'} · {year}
        </p>
      </div>
    </Link>
  )
}
