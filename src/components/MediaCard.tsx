import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MediaItem, TitleStatus } from '../lib/types'
import { posterUrl, displayTitle } from '../lib/tmdb'
import { useLibrary } from '../lib/libraryCtx'
import { useAuth } from '../lib/auth'
import { upsertUserTitle, refFromMedia } from '../lib/userTitles'
import StarRating from './StarRating'

// Badge shown on a card when the title is already in the user's collection.
const LIB_BADGE: Record<TitleStatus, { label: string; cls: string }> = {
  watched: { label: '✓ Visto', cls: 'bg-emerald-600/90 text-white' },
  in_progress: { label: '▶ In corso', cls: 'bg-projector/90 text-theatre-950' },
  to_watch: { label: '🎟️ In lista', cls: 'bg-sky-600/90 text-white' },
  abandoned: { label: '✕ Mollato', cls: 'bg-zinc-600/90 text-white' },
}

// Quick actions to file a title straight from a card, without opening its page.
function QuickActions({ item }: { item: MediaItem }) {
  const { user } = useAuth()
  const { lookup, refresh } = useLibrary()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const lib = lookup(item.mediaType, item.id)

  if (!user) return null

  async function run(patch: Parameters<typeof upsertUserTitle>[2]) {
    if (!user) return
    setBusy(true)
    try {
      await upsertUserTitle(user.id, refFromMedia(item), patch)
      refresh()
    } catch {
      /* best-effort: la scheda del titolo resta la via completa */
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  const isFav = lib?.isFavorite ?? false

  return (
    <div className="absolute bottom-14 right-2 z-20">
      <button
        type="button"
        aria-label="Azioni rapide"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className={`flex h-8 w-8 items-center justify-center rounded-full border border-theatre-700 bg-theatre-950/85 text-lg text-projector shadow-reel backdrop-blur transition hover:bg-theatre-800 ${
          open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        }`}
      >
        {open ? '×' : '+'}
      </button>

      {open && (
        <div className="absolute bottom-9 right-0 w-44 overflow-hidden rounded-lg border border-theatre-700 bg-theatre-950/95 py-1 shadow-reel backdrop-blur">
          <QuickItem label="🎟️ Da vedere" active={lib?.status === 'to_watch'} onClick={() => run({ status: 'to_watch' })} />
          <QuickItem
            label="✓ Visto"
            active={lib?.status === 'watched'}
            onClick={() => run({ status: 'watched', watched_at: new Date().toISOString() })}
          />
          <QuickItem
            label={isFav ? '❤️ Preferito' : '🤍 Preferito'}
            active={isFav}
            onClick={() =>
              run({
                is_favorite: !isFav,
                // Favoriting implies you've seen it (matches the title page).
                ...(!isFav && lib?.status !== 'watched'
                  ? { status: 'watched' as TitleStatus, watched_at: new Date().toISOString() }
                  : {}),
              })
            }
          />
          {/* Quick rating — setting a vote also marks the title as watched. */}
          <div className="border-t border-theatre-800 px-3 py-2">
            <StarRating
              value={lib?.rating ?? null}
              size="sm"
              showValue={false}
              onChange={(v) =>
                run({
                  personal_rating: v,
                  ...(v != null && lib?.status !== 'watched'
                    ? { status: 'watched' as TitleStatus, watched_at: new Date().toISOString() }
                    : {}),
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

function QuickItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-theatre-800 ${
        active ? 'text-projector' : 'text-zinc-200'
      }`}
    >
      {active && '• '}
      {label}
    </button>
  )
}

export default function MediaCard({ item }: { item: MediaItem }) {
  const { lookup } = useLibrary()
  const lib = lookup(item.mediaType, item.id)
  const poster = posterUrl(item.posterPath)
  const year = item.releaseDate ? item.releaseDate.slice(0, 4) : '—'
  // Original title when readable; localized (IT/EN) for Japanese etc.
  const display = displayTitle(item)

  // Outer wrapper is NOT overflow-hidden so the quick-actions popover can spill
  // over the card; the poster keeps its own clipped, rounded container.
  return (
    <div className="group relative">
      <Link
        to={`/title/${item.mediaType}/${item.id}`}
        className="block overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40 hover:shadow-reel"
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

      <QuickActions item={item} />
    </div>
  )
}
