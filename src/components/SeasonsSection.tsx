import { useEffect, useState } from 'react'
import { getSeason } from '../lib/tmdb'
import type { Episode, Season } from '../lib/types'

const STILL_BASE = 'https://image.tmdb.org/t/p/w300'

export default function SeasonsSection({
  tvId,
  seasons,
}: {
  tvId: number
  seasons: Season[]
}) {
  // Default to the first real season (skip "Specials" = season 0 if others exist).
  const firstReal = seasons.find((s) => s.seasonNumber > 0) ?? seasons[0]
  const [selected, setSelected] = useState<number>(firstReal?.seasonNumber ?? 1)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getSeason(tvId, selected)
      .then(setEpisodes)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [tvId, selected])

  if (seasons.length === 0) return null

  return (
    <section>
      <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">
        📺 Stagioni ed episodi
      </h2>

      {/* Season selector */}
      <div className="mb-5 flex flex-wrap gap-2">
        {seasons.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.seasonNumber)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              selected === s.seasonNumber
                ? 'bg-projector text-theatre-950'
                : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
            }`}
          >
            {s.seasonNumber === 0 ? 'Speciali' : s.name}
            <span className="ml-1 opacity-70">({s.episodeCount})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Carico gli episodi…</p>
      ) : error ? (
        <p className="text-sm text-curtain-light">{error}</p>
      ) : episodes.length === 0 ? (
        <p className="text-sm text-zinc-500">Nessun episodio disponibile per questa stagione.</p>
      ) : (
        <div className="space-y-3">
          {episodes.map((e) => (
            <div
              key={e.id}
              className="flex gap-4 rounded-xl border border-theatre-800 bg-theatre-900/50 p-3"
            >
              <div className="hidden h-20 w-36 shrink-0 overflow-hidden rounded-md bg-theatre-800 sm:block">
                {e.stillPath ? (
                  <img
                    src={`${STILL_BASE}${e.stillPath}`}
                    alt={e.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl opacity-30">🎞️</div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-zinc-100">
                    <span className="text-projector">{e.episodeNumber}.</span> {e.name}
                  </h3>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                    {e.voteAverage > 0 && <span className="text-projector">★ {e.voteAverage.toFixed(1)}</span>}
                    {e.runtime ? <span>{e.runtime} min</span> : null}
                  </div>
                </div>
                {e.airDate && (
                  <p className="text-xs text-zinc-500">
                    {new Date(e.airDate).toLocaleDateString('it-IT')}
                  </p>
                )}
                {e.overview && (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{e.overview}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
