import { Link } from 'react-router-dom'
import type { TmdbTitle } from '@/types'
import { IMG } from '@/lib/tmdb'

interface Props {
  title: TmdbTitle
}

export default function TitleCard({ title }: Props) {
  const poster = IMG.poster(title.poster_path)
  const year = title.release_date?.slice(0, 4)
  const rating = title.vote_average ? title.vote_average.toFixed(1) : null

  return (
    <Link
      to={`/title/${title.media_type}/${title.id}`}
      className="group relative block overflow-hidden rounded-xl border border-cinema-border
        bg-cinema-panel shadow-poster transition hover:-translate-y-1 hover:border-gold/50
        hover:shadow-glow"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-cinema-dark">
        {poster ? (
          <img
            src={poster}
            alt={title.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-zinc-700">
            🎞️
          </div>
        )}
      </div>

      {/* Badge tipo + rating */}
      <div className="absolute left-2 top-2 flex items-center gap-1">
        <span className="rounded bg-cinema-black/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
          {title.media_type === 'tv' ? 'Serie' : 'Film'}
        </span>
      </div>
      {rating && (
        <span className="absolute right-2 top-2 rounded bg-cinema-black/80 px-1.5 py-0.5 text-[11px] font-bold text-gold">
          ★ {rating}
        </span>
      )}

      {/* Titolo */}
      <div className="bg-film-fade absolute inset-x-0 bottom-0 p-3 pt-8">
        <h3 className="line-clamp-2 text-sm font-semibold text-white">{title.title}</h3>
        {year && <p className="text-xs text-zinc-400">{year}</p>}
      </div>
    </Link>
  )
}
