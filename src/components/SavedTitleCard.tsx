import { Link } from 'react-router-dom'
import { posterUrl } from '../lib/tmdb'
import { STATUS_LABELS, type UserTitle } from '../lib/types'

// A card for a title already in the user's collection (Supabase row), as
// opposed to MediaCard which renders a raw TMDB result.
export default function SavedTitleCard({
  record,
  children,
}: {
  record: UserTitle
  children?: React.ReactNode
}) {
  const poster = posterUrl(record.poster_path)
  const type = record.media_type === 'movie' ? 'movie' : 'tv'

  return (
    <div className="overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900">
      <Link
        to={`/title/${type}/${record.tmdb_id}`}
        className="group block"
      >
        <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
          {poster ? (
            <img
              src={poster}
              alt={record.title}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl opacity-30">
              🎞️
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-1 text-sm font-semibold text-zinc-100">
            {record.title}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {STATUS_LABELS[record.status]}
            {record.personal_rating ? ` · ★ ${record.personal_rating}/5` : ''}
          </p>
        </div>
      </Link>
      {children && <div className="border-t border-theatre-800 p-3">{children}</div>}
    </div>
  )
}
