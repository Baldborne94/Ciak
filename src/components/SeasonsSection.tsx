import { useEffect, useRef, useState } from 'react'
import { logFailure } from '../lib/logFailure'
import { useSearchParams } from 'react-router-dom'
import { getSeason } from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toastCtx'
import {
  epKey,
  listWatchedEpisodes,
  markEpisode,
  markSeason,
  unmarkEpisode,
  unmarkSeason,
  syncSeriesStatus,
  type SeriesRef,
} from '../lib/episodes'
import type { Episode, Season } from '../lib/types'

const STILL_BASE = 'https://image.tmdb.org/t/p/w300'

export default function SeasonsSection({
  tvId,
  seasons,
  series,
}: {
  tvId: number
  seasons: Season[]
  series: SeriesRef
}) {
  const { user } = useAuth()
  const { showToast } = useToast()
  // Episodi totali della serie (escludendo gli "Speciali", stagione 0): serve a
  // capire quando la serie è completa e va segnata "Vista".
  const totalEpisodes = seasons
    .filter((s) => s.seasonNumber > 0)
    .reduce((sum, s) => sum + s.episodeCount, 0)
  const firstReal = seasons.find((s) => s.seasonNumber > 0) ?? seasons[0]

  // Deep-link da "Riprendi a guardare": ?season=&episode= preseleziona la
  // stagione e fa scorrere/evidenziare l'episodio da riprendere.
  const [searchParams] = useSearchParams()
  const deepSeason = Number(searchParams.get('season')) || null
  const deepEpisode = Number(searchParams.get('episode')) || null
  const hasDeepSeason = deepSeason != null && seasons.some((s) => s.seasonNumber === deepSeason)

  const [selected, setSelected] = useState<number>(
    hasDeepSeason ? (deepSeason as number) : (firstReal?.seasonNumber ?? 1),
  )
  const sectionRef = useRef<HTMLElement>(null)
  const didScrollRef = useRef(false)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watched, setWatched] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    setError(null)
    getSeason(tvId, selected)
      .then(setEpisodes)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [tvId, selected])

  // Load all watched episodes for the series once (per user).
  useEffect(() => {
    if (!user) {
      setWatched(new Set())
      return
    }
    listWatchedEpisodes(user.id, tvId).then(setWatched).catch(() => setWatched(new Set()))
  }, [user, tvId])

  // Una volta caricati gli episodi della stagione richiesta, scorri alla sezione
  // (una sola volta) così l'episodio da riprendere è subito visibile.
  useEffect(() => {
    if (!deepEpisode || didScrollRef.current) return
    if (episodes.length === 0 || selected !== deepSeason) return
    didScrollRef.current = true
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [episodes, selected, deepSeason, deepEpisode])

  if (seasons.length === 0) return null

  const seasonWatched = episodes.filter((e) => watched.has(epKey(selected, e.episodeNumber))).length
  const allWatched = episodes.length > 0 && seasonWatched === episodes.length

  async function toggleEpisode(e: Episode) {
    if (!user) return
    const key = epKey(selected, e.episodeNumber)
    const prev = watched // snapshot per il rollback
    const next = new Set(watched)
    const removing = watched.has(key)
    if (removing) next.delete(key)
    else next.add(key)
    setWatched(next)
    try {
      if (removing) await unmarkEpisode(user.id, tvId, selected, e.episodeNumber)
      else await markEpisode(user.id, tvId, selected, e.episodeNumber)
      // Allinea lo stato della serie (In corso / Vista) al progresso reale.
      await syncSeriesStatus(user.id, series, next.size, totalEpisodes).catch(
        logFailure('stato della serie non allineato'),
      )
    } catch {
      setWatched(prev) // ripristina: il DB non è cambiato
      showToast('Non sono riuscito a salvare l’episodio. Riprova.', 'error')
    }
  }

  async function toggleSeason() {
    if (!user) return
    const prev = watched // snapshot per il rollback
    const next = new Set(watched)
    if (allWatched) {
      for (const e of episodes) next.delete(epKey(selected, e.episodeNumber))
    } else {
      for (const e of episodes) next.add(epKey(selected, e.episodeNumber))
    }
    setWatched(next)
    try {
      if (allWatched) await unmarkSeason(user.id, tvId, selected)
      else await markSeason(user.id, tvId, selected, episodes.map((e) => e.episodeNumber))
      // Allinea lo stato della serie (In corso / Vista) al progresso reale.
      await syncSeriesStatus(user.id, series, next.size, totalEpisodes).catch(
        logFailure('stato della serie non allineato'),
      )
    } catch {
      setWatched(prev) // ripristina: il DB non è cambiato
      showToast('Non sono riuscito a salvare la stagione. Riprova.', 'error')
    }
  }

  return (
    <section ref={sectionRef} id="episodi" className="scroll-mt-20">
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

      {/* Progress + mark season (only when signed in) */}
      {user && episodes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-theatre-800">
            <div
              className="h-full rounded-full bg-projector transition-all"
              style={{ width: `${(seasonWatched / episodes.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400">
            {seasonWatched}/{episodes.length} visti
          </span>
          <button onClick={toggleSeason} className="btn-ghost px-3 py-1.5 text-xs">
            {allWatched ? 'Segna stagione come da vedere' : 'Segna tutta la stagione come vista'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Carico gli episodi…</p>
      ) : error ? (
        <p className="text-sm text-curtain-light">{error}</p>
      ) : episodes.length === 0 ? (
        <p className="text-sm text-zinc-500">Nessun episodio disponibile per questa stagione.</p>
      ) : (
        <div className="space-y-3">
          {episodes.map((e) => {
            const isWatched = watched.has(epKey(selected, e.episodeNumber))
            const isTarget =
              selected === deepSeason && e.episodeNumber === deepEpisode
            return (
              <div
                key={e.id}
                className={`flex gap-4 rounded-xl border p-3 transition ${
                  isTarget
                    ? 'border-projector ring-1 ring-projector/50 bg-projector/10'
                    : isWatched
                      ? 'border-projector/30 bg-projector/5'
                      : 'border-theatre-800 bg-theatre-900/50'
                }`}
              >
                <div className="hidden h-20 w-36 shrink-0 overflow-hidden rounded-md bg-theatre-800 sm:block">
                  {e.stillPath ? (
                    <img
                      src={`${STILL_BASE}${e.stillPath}`}
                      alt={e.name}
                      loading="lazy"
                      className={`h-full w-full object-cover ${isWatched ? '' : 'opacity-90'}`}
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
                  {e.overview && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{e.overview}</p>}
                </div>
                {user && (
                  <button
                    onClick={() => toggleEpisode(e)}
                    aria-label={isWatched ? 'Segna come da vedere' : 'Segna come visto'}
                    title={isWatched ? 'Visto' : 'Segna come visto'}
                    className={`self-center flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition ${
                      isWatched
                        ? 'border-projector bg-projector text-theatre-950'
                        : 'border-theatre-600 text-zinc-500 hover:border-projector/60 hover:text-projector'
                    }`}
                  >
                    ✓
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
