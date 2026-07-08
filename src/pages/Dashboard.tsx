import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { ScrollRow } from '../components/MediaRow'
import { posterUrl, getSagaContinuations, type SagaContinuation } from '../lib/tmdb'
import { useAuth } from '../lib/auth'
import { listByStatus, listWatchlist, listAll } from '../lib/userTitles'
import { listDiary } from '../lib/diary'
import { computeAchievementData, getNextAchievement, RARITY_STYLES, type NextAchievement } from '../lib/achievements'
import { getContinueWatching, abandonSeries, type ContinueItem } from '../lib/episodes'
import { useToast } from '../lib/toastCtx'
import { usePersistedState } from '../lib/usePersistedState'
import type { DiaryEntry, UserTitle } from '../lib/types'

function ContinueCard({ c, onAbandon }: { c: ContinueItem; onAbandon: (c: ContinueItem) => void }) {
  const poster = posterUrl(c.posterPath)
  const pct = c.totalEpisodes > 0 ? Math.round((c.watchedCount / c.totalEpisodes) * 100) : 0
  return (
    <div className="group/card relative w-40 shrink-0 overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40">
      <button
        type="button"
        aria-label="Rimuovi da Riprendi a guardare"
        title="Segna come abbandonata"
        onClick={(e) => { e.preventDefault(); onAbandon(c) }}
        className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-theatre-950/85 text-sm text-zinc-300 opacity-0 backdrop-blur transition hover:bg-theatre-800 hover:text-curtain-light group-hover/card:opacity-100"
      >
        ✕
      </button>
      <Link to={`/title/tv/${c.tvId}?season=${c.season}&episode=${c.episode}#episodi`} className="block">
        <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
          {poster ? (
            <img src={poster} alt={c.title} loading="lazy" className="h-full w-full object-cover transition group-hover/card:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
          )}
        </div>
        <div className="p-2">
          <p className="line-clamp-1 text-sm font-semibold text-zinc-100">{c.title}</p>
          <p className="text-xs text-projector">▶ S{c.season} · E{c.episode}</p>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-theatre-800">
            <div className="h-full rounded-full bg-projector" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500">{c.watchedCount}/{c.totalEpisodes} episodi</p>
        </div>
      </Link>
    </div>
  )
}

function SectionTitle({ icon, title, action }: { icon: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="font-display text-2xl tracking-wide text-zinc-100">
        {icon} {title}
      </h2>
      {action}
    </div>
  )
}

// "Continua la saga" card — dismissable: se non ti interessa continuarla, la
// nascondi (per collectionId, salvato in locale) senza che ricompaia.
function SagaCard({ saga, onDismiss }: { saga: SagaContinuation; onDismiss: (collectionId: number) => void }) {
  const { item } = saga
  return (
    <div className="group/card relative w-36 shrink-0 overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40">
      <button
        type="button"
        aria-label="Non mi interessa continuare questa saga"
        title="Non proporre più questa saga"
        onClick={(e) => { e.preventDefault(); onDismiss(saga.collectionId) }}
        className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-theatre-950/85 text-sm text-zinc-300 opacity-0 backdrop-blur transition hover:bg-theatre-800 hover:text-curtain-light group-hover/card:opacity-100"
      >
        ✕
      </button>
      <Link to={`/title/${item.mediaType}/${item.id}`} className="block">
        <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
          {posterUrl(item.posterPath) ? (
            <img src={posterUrl(item.posterPath)!} alt={item.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
          )}
        </div>
        <div className="p-2">
          <p className="line-clamp-2 text-xs font-semibold text-zinc-100">{item.title}</p>
          <p className="text-[11px] text-zinc-500">{item.releaseDate?.slice(0, 4)}</p>
        </div>
      </Link>
    </div>
  )
}

// "Scegli per me": pesca a caso un titolo dalla watchlist per decidere in fretta.
function ChooseForMe({ watchlist }: { watchlist: UserTitle[] }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * watchlist.length))
  const pick = watchlist[index] ?? watchlist[0]

  function reroll() {
    if (watchlist.length < 2) return
    let next = index
    while (next === index) next = Math.floor(Math.random() * watchlist.length)
    setIndex(next)
  }

  if (!pick) return null
  const poster = posterUrl(pick.poster_path)

  return (
    <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-projector/30 bg-gradient-to-br from-projector/10 via-theatre-900/60 to-theatre-900/40 p-5">
      <Link
        to={`/title/${pick.media_type}/${pick.tmdb_id}`}
        className="group h-40 w-28 shrink-0 overflow-hidden rounded-xl border border-theatre-800 bg-theatre-800"
      >
        {poster ? (
          <img src={poster} alt={pick.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wider text-projector/80">Dalla tua lista «Da vedere»</p>
        <Link to={`/title/${pick.media_type}/${pick.tmdb_id}`}>
          <h3 className="mt-1 font-display text-2xl tracking-wide text-zinc-100 hover:text-projector">
            {pick.title}
          </h3>
        </Link>
        <p className="mt-1 text-sm text-zinc-400">
          {pick.media_type === 'tv' ? 'Serie TV' : 'Film'} · in attesa nella tua watchlist
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/title/${pick.media_type}/${pick.tmdb_id}`} className="btn-primary">
            Guardalo →
          </Link>
          {watchlist.length > 1 && (
            <button onClick={reroll} className="btn-ghost">🎲 Rigira</button>
          )}
        </div>
      </div>
    </div>
  )
}

// Diary entries watched on today's date (MM-DD) in a previous year — a nostalgic
// "un anno fa" flashback. Deduplicated by title, most-years-ago first.
function onThisDayFlashbacks(diary: DiaryEntry[]): { entry: DiaryEntry; yearsAgo: number }[] {
  const now = new Date()
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentYear = now.getFullYear()
  const seen = new Set<number>()
  const out: { entry: DiaryEntry; yearsAgo: number }[] = []
  for (const e of diary) {
    if (!e.watched_on || e.watched_on.slice(5, 10) !== md) continue
    const year = Number(e.watched_on.slice(0, 4))
    const yearsAgo = currentYear - year
    if (yearsAgo < 1) continue // only past years
    if (seen.has(e.tmdb_id)) continue
    seen.add(e.tmdb_id)
    out.push({ entry: e, yearsAgo })
  }
  return out.sort((a, b) => b.yearsAgo - a.yearsAgo)
}

export default function Dashboard() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [watchlist, setWatchlist] = useState<UserTitle[]>([])
  const [continueList, setContinueList] = useState<ContinueItem[]>([])
  const [sagaNext, setSagaNext] = useState<SagaContinuation[]>([])
  const [flashbacks, setFlashbacks] = useState<{ entry: DiaryEntry; yearsAgo: number }[]>([])
  const [allTitles, setAllTitles] = useState<UserTitle[]>([])
  // Saghe che l'utente ha scartato ("non mi interessa continuarla"): persistito
  // in locale per collection id, così non ricompaiono più.
  const [dismissedSagas, setDismissedSagas] = usePersistedState<number[]>(
    'ciak.dashboard.dismissedSagas',
    [],
  )

  useEffect(() => {
    if (!user) {
      setWatchlist([])
      setContinueList([])
      setSagaNext([])
      setFlashbacks([])
      setAllTitles([])
      return
    }

    listWatchlist(user.id).then(setWatchlist).catch(() => setWatchlist([]))
    getContinueWatching(user.id).then(setContinueList).catch(() => setContinueList([]))
    listDiary(user.id).then((d) => setFlashbacks(onThisDayFlashbacks(d))).catch(() => setFlashbacks([]))

    // Personalized sections from the user's own library.
    Promise.all([
      listByStatus(user.id, 'watched'),
      listAll(user.id),
    ]).then(([watched, all]) => {
      setAllTitles(all)
      const knownIds = new Set(all.map((t) => t.tmdb_id))

      // "Continua la saga": watched movies (most-recent first) → next unwatched
      // film in each collection they belong to.
      const watchedMovieIds = watched
        .filter((t) => t.media_type === 'movie')
        .map((t) => t.tmdb_id)
      if (watchedMovieIds.length > 0) {
        getSagaContinuations(watchedMovieIds, knownIds)
          .then(setSagaNext)
          .catch(() => setSagaNext([]))
      }
    }).catch(() => {})
  }, [user])

  // "Prossimo trofeo": closest still-locked achievement. Uses the episode-derived
  // in-progress-series count (continue-watching) so "Binge Master" matches reality.
  const nextTrophy: NextAchievement | null = useMemo(
    () =>
      allTitles.length > 0
        ? getNextAchievement(computeAchievementData(allTitles, { inProgressSeries: continueList.length }))
        : null,
    [allTitles, continueList.length],
  )

  const visibleSagas = useMemo(
    () => sagaNext.filter((s) => !dismissedSagas.includes(s.collectionId)),
    [sagaNext, dismissedSagas],
  )

  const isEmpty =
    watchlist.length === 0 && continueList.length === 0 && visibleSagas.length === 0 &&
    flashbacks.length === 0 && !nextTrophy

  async function handleAbandon(c: ContinueItem) {
    if (!user) return
    // Aggiornamento ottimistico: sparisce subito da "Riprendi a guardare".
    setContinueList((prev) => prev.filter((x) => x.tvId !== c.tvId))
    try {
      await abandonSeries(user.id, {
        tmdbId: c.tvId,
        title: c.title,
        posterPath: c.posterPath,
        genreIds: c.genreIds,
      })
      showToast('Serie segnata come abbandonata. La trovi in «Abbandonati».', 'info')
    } catch (e) {
      setContinueList((prev) => [...prev, c])
      showToast(`Non sono riuscito a segnarla come abbandonata: ${(e as Error).message}`)
    }
  }

  function handleDismissSaga(collectionId: number) {
    setDismissedSagas((prev) => (prev.includes(collectionId) ? prev : [...prev, collectionId]))
    showToast('Non ti proporrò più questa saga.', 'info')
  }

  return (
    <div>
      <PageHeader
        eyebrow="La tua sala"
        title="Bentornato al cinema"
        subtitle="Il tuo archivio, le tue liste e cosa vedere adesso."
      />

      <div className="space-y-12">
        {/* AI shortcut — prominent banner at top */}
        {user && (
          <section>
            <Link
              to="/ai?tab=tonight"
              className="group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-projector/30 bg-gradient-to-br from-projector/10 via-theatre-900/60 to-theatre-900/40 p-6 transition hover:border-projector/60 hover:from-projector/15"
            >
              <div>
                <p className="font-display text-xl tracking-wide text-zinc-100">✨ Non sai cosa vedere stasera?</p>
                <p className="mt-1 text-sm text-zinc-400">
                  Dimmi umore e tempo: trovo io il film o la serie perfetta per te.
                </p>
              </div>
              <span className="btn-primary shrink-0">Apri «Stasera» →</span>
            </Link>
          </section>
        )}

        {/* Choose for me — quick pick from the watchlist */}
        {user && watchlist.length > 0 && (
          <section>
            <SectionTitle icon="🎲" title="Scegli per me" />
            <ChooseForMe watchlist={watchlist} />
          </section>
        )}

        {/* Resume watching */}
        {user && continueList.length > 0 && (
          <section>
            <SectionTitle icon="📺" title="Riprendi a guardare" />
            <ScrollRow>
              {continueList.map((c) => <ContinueCard key={c.tvId} c={c} onAbandon={handleAbandon} />)}
            </ScrollRow>
          </section>
        )}

        {/* Continue the saga — next unwatched film in sagas you've started */}
        {user && visibleSagas.length > 0 && (
          <section>
            <SectionTitle icon="🎬" title="Continua la saga" />
            <p className="-mt-3 mb-4 text-sm text-zinc-500">
              Il prossimo capitolo delle saghe che hai iniziato ma non ancora finito.
              <span className="text-zinc-600"> · passa il mouse e tocca ✕ per non vederla più.</span>
            </p>
            <ScrollRow>
              {visibleSagas.map((s) => (
                <SagaCard key={s.collectionId} saga={s} onDismiss={handleDismissSaga} />
              ))}
            </ScrollRow>
          </section>
        )}

        {/* On this day — diary flashback */}
        {user && flashbacks.length > 0 && (
          <section>
            <SectionTitle icon="📅" title="Un anno fa guardavi…" />
            <ScrollRow>
              {flashbacks.map(({ entry, yearsAgo }) => (
                <Link
                  key={entry.id}
                  to={`/title/${entry.media_type}/${entry.tmdb_id}`}
                  className="group w-36 shrink-0 overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-theatre-800">
                    {posterUrl(entry.poster_path) ? (
                      <img src={posterUrl(entry.poster_path)!} alt={entry.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
                    )}
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-theatre-950/80 px-2 py-0.5 text-[11px] font-semibold text-projector">
                      {yearsAgo === 1 ? '1 anno fa' : `${yearsAgo} anni fa`}
                    </span>
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 text-xs font-semibold text-zinc-100">{entry.title}</p>
                  </div>
                </Link>
              ))}
            </ScrollRow>
          </section>
        )}

        {/* Next trophy — closest locked achievement */}
        {user && nextTrophy && (
          <section>
            <SectionTitle icon="🏆" title="Prossimo trofeo" />
            <Link
              to="/trophies"
              className={`flex flex-wrap items-center gap-5 rounded-2xl border p-5 transition hover:-translate-y-0.5 ${RARITY_STYLES[nextTrophy.achievement.rarity]}`}
            >
              <span className="text-5xl">{nextTrophy.achievement.avatar}</span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl tracking-wide text-zinc-100">
                  {nextTrophy.achievement.emoji} {nextTrophy.achievement.title}
                </p>
                <p className="mt-0.5 text-sm text-zinc-400">{nextTrophy.achievement.subtitle}</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-theatre-800">
                    <div
                      className="h-full rounded-full bg-projector transition-all"
                      style={{ width: `${Math.round((nextTrophy.current / nextTrophy.target) * 100)}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-zinc-200">
                    {nextTrophy.current}/{nextTrophy.target}
                  </span>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Empty state */}
        {user && isEmpty && (
          <section className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
            <p className="text-zinc-300">
              La tua sala è ancora vuota. Esplora il catalogo e aggiungi i titoli che vuoi vedere.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link to="/search" className="btn-primary">🔍 Cerca & Esplora</Link>
              <Link to="/guida" className="btn-ghost">❓ Come funziona</Link>
            </div>
          </section>
        )}

        {/* Login prompt */}
        {!user && (
          <section className="rounded-2xl border border-dashed border-theatre-700 p-8 text-center">
            <p className="text-zinc-300">
              Accedi per creare le tue liste, salvare i preferiti e ricevere suggerimenti AI su misura.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link to="/login" className="btn-primary inline-flex">🎟️ Accedi</Link>
              <Link to="/guida" className="btn-ghost inline-flex">❓ Scopri cosa puoi fare</Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
