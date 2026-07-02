import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loader } from './States'
import AiCreditsNote from './AiCreditsNote'
import { useAuth } from '../lib/auth'
import { listByStatus, listFavorites } from '../lib/userTitles'
import { aiFetch } from '../lib/aiClient'
import { usePersistedState } from '../lib/usePersistedState'
import { searchMulti, posterUrl, displayTitle } from '../lib/tmdb'
import type { MediaItem, UserTitle } from '../lib/types'

interface Suggestion {
  title: string
  year?: string
  length?: string
  reason: string
}

// Suggerimento dell'AI risolto (best-effort) a un titolo reale di TMDB, così la
// card è cliccabile e porta alla scheda del film/serie.
interface ResolvedSuggestion {
  suggestion: Suggestion
  item: MediaItem | null
}

// Associa il titolo proposto dall'AI al miglior risultato TMDB: privilegia il
// match esatto del titolo e l'anno, per evitare omonimi o scambi di media.
async function resolveSuggestion(s: Suggestion): Promise<ResolvedSuggestion> {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '')

  function pickBest(items: Awaited<ReturnType<typeof searchMulti>>, target: string) {
    return items
      .map((r) => {
        let score = 0
        if (norm(r.title) === target || norm(r.originalTitle ?? '') === target) score += 10
        else if (norm(r.title).includes(target) || target.includes(norm(r.title))) score += 4
        if (s.year && r.releaseDate?.slice(0, 4) === String(s.year)) score += 5
        // Use vote average as tiebreaker so a well-known film beats an obscure
        // namesake (e.g. the A24 "Talk to Me" vs a 0.0-rated Lebanese short).
        score += r.voteAverage * 0.1
        return { r, score }
      })
      .sort((a, b) => b.score - a.score)[0]?.r ?? items[0]
  }

  try {
    const items = await searchMulti(s.title)
    if (items.length > 0) {
      return { suggestion: s, item: pickBest(items, norm(s.title)) }
    }
    // Fallback: if the title contains " - " (e.g. Italian subtitle added by AI),
    // retry with just the base title which is more likely to match TMDB.
    const base = s.title.split(/\s*[-:]\s*/)[0].trim()
    if (base && base !== s.title) {
      const fallbackItems = await searchMulti(base)
      if (fallbackItems.length > 0) {
        return { suggestion: s, item: pickBest(fallbackItems, norm(base)) }
      }
    }
  } catch {
    // ricerca TMDB non riuscita: si mostra comunque il testo dell'AI.
  }
  return { suggestion: s, item: null }
}

const MOODS = [
  { value: 'leggero e divertente', label: '😄 Leggero' },
  { value: 'adrenalina e azione', label: '💥 Adrenalina' },
  { value: 'romantico', label: '❤️ Romantico' },
  { value: 'mente accesa, thriller o mistero', label: '🧠 Cervellotico' },
  { value: 'profondo e drammatico', label: '🎭 Profondo' },
  { value: 'nostalgia, un grande classico', label: '📼 Nostalgia' },
  { value: 'da paura, horror', label: '👻 Paura' },
  { value: 'sci-fi e mondi nuovi', label: '🚀 Sci-fi' },
  { value: 'commovente, da lacrime', label: '🥹 Commovente' },
  { value: 'ironico e demenziale', label: '🤪 Demenziale' },
  { value: 'avventura epica', label: '🗺️ Avventura' },
  { value: 'feel-good, che scalda il cuore', label: '🌈 Feel-good' },
  { value: 'tensione e suspense', label: '😰 Tensione' },
  { value: 'crime, gangster e noir', label: '🕵️ Crime' },
  { value: 'fantasy e magia', label: '🐉 Fantasy' },
  { value: 'ispirato a una storia vera', label: '📖 Storia vera' },
  { value: 'musicale, tanta musica', label: '🎶 Musical' },
  { value: 'mind-bending, da ripensarci dopo', label: '🌀 Mind-bending' },
  { value: 'dark e disturbante', label: '🩸 Dark' },
  { value: 'cult e di culto', label: '🎟️ Cult' },
  { value: 'folklore, leggende, fiabe dark, folk horror', label: '🌿 Folklore' },
  { value: 'storico, epoche passate, costume, storia', label: '⚔️ Storico' },
  { value: 'western, cow-boy, frontiera', label: '🤠 Western' },
  { value: 'bellico, guerra, conflitti militari', label: '💣 Bellico' },
  { value: 'supereroi, fumetti, universi Marvel e DC', label: '🦸 Supereroi' },
  { value: 'distopia, futuro oscuro, totalitarismo', label: '🌑 Distopia' },
  { value: 'survival, sopravvivenza, disastri', label: '🏕️ Survival' },
  { value: 'spionaggio, agenti segreti, spy thriller', label: '🕵️ Spionaggio' },
  { value: 'animazione, cartoni animati, anime', label: '🎨 Animazione' },
]

const TIMES = [
  { minutes: 90, series: false, label: '⏱️ Ho ~1h30' },
  { minutes: 120, series: false, label: '🍿 Ho ~2 ore' },
  { minutes: 180, series: false, label: '🎬 Tempo libero' },
  { minutes: 60, series: true, label: '📺 Una serie' },
]

function toSummary(record: UserTitle) {
  return { title: record.title, mediaType: record.media_type }
}

// "Stasera": suggerimenti AI in base a umore e tempo a disposizione.
// Estratto dalla vecchia pagina TonightPage per vivere come scheda dell'hub AI.
export default function TonightTool() {
  const { user } = useAuth()
  // Umore/i, tempo e ultimo risultato vivono in localStorage: restano dopo
  // cambio scheda e refresh, finché non rigeneri o premi «Cancella».
  // moods: selezione multipla (puoi combinare più umori per stasera).
  const [moods, setMoods] = usePersistedState<string[]>('ciak.ai.tonight.moods', [MOODS[0].value])
  const [time, setTime] = usePersistedState('ciak.ai.tonight.time', TIMES[1])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = usePersistedState<ResolvedSuggestion[] | null>(
    'ciak.ai.tonight.results',
    null,
  )

  function toggleMood(value: string) {
    setMoods((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value],
    )
  }

  async function generate() {
    if (moods.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const [favorites, watched] = user
        ? await Promise.all([listFavorites(user.id), listByStatus(user.id, 'watched')])
        : [[], []]

      const data = await aiFetch<{ suggestions: Suggestion[] }>('/api/tonight', {
        // Più umori vengono uniti: il prompt server li tratta come combinazione.
        mood: moods.join(', '),
        maxMinutes: time.minutes,
        wantSeries: time.series,
        favorites: favorites.map(toSummary),
        watched: watched.map(toSummary),
      })
      const resolved = await Promise.all((data.suggestions ?? []).map(resolveSuggestion))
      setResults(resolved)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <AiCreditsNote className="mb-6" />

      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
            Che umore hai? <span className="normal-case text-zinc-600">· puoi sceglierne più di uno</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => {
              const active = moods.includes(m.value)
              return (
                <button
                  key={m.value}
                  onClick={() => toggleMood(m.value)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    active
                      ? 'border-projector bg-projector/10 text-projector'
                      : 'border-theatre-700 text-zinc-300 hover:border-projector/40'
                  }`}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Quanto tempo hai?</p>
          <div className="flex flex-wrap gap-2">
            {TIMES.map((t) => (
              <button
                key={t.label}
                onClick={() => setTime(t)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  time.label === t.label
                    ? 'border-projector bg-projector/10 text-projector'
                    : 'border-theatre-700 text-zinc-300 hover:border-projector/40'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} className="btn-primary" disabled={loading || moods.length === 0}>
          {loading ? '✨ Sto scegliendo…' : '✨ Dimmi cosa vedere'}
        </button>
      </div>

      <div className="mt-8">
        {loading ? (
          <Loader label="Sfoglio la cineteca per stasera…" />
        ) : error ? (
          <ErrorState title="Niente suggerimenti" message={error} icon="🤖" />
        ) : results === null ? (
          <EmptyState
            title="Pronto quando lo sei"
            message="Scegli umore e tempo, poi premi «Dimmi cosa vedere»."
            icon="🌙"
          />
        ) : results.length === 0 ? (
          <EmptyState
            title="Non ho trovato nulla"
            message="Prova a cambiare umore o tempo a disposizione, poi riprova."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-zinc-500">
                Per stasera ti propongo <span className="normal-case text-zinc-600">· tocca un titolo per aprirne la scheda</span>
              </p>
              <button
                onClick={() => setResults(null)}
                className="text-xs text-curtain-light/80 hover:text-curtain-light"
              >
                ✕ Cancella
              </button>
            </div>
            {results.map(({ suggestion: s, item }, i) => {
              const poster = item ? posterUrl(item.posterPath) : null
              const heading = (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-display text-xl tracking-wide text-projector">
                    {item ? displayTitle(item) : s.title}
                  </h3>
                  {s.year && <span className="text-sm text-zinc-500">{s.year}</span>}
                  {s.length && (
                    <span className="rounded-full bg-theatre-800 px-2 py-0.5 text-xs text-zinc-300">
                      {s.length}
                    </span>
                  )}
                </div>
              )
              const body = (
                <div className="flex gap-4">
                  <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-theatre-800">
                    {poster ? (
                      <img src={poster} alt={s.title} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
                    )}
                  </div>
                  <div className="flex-1">
                    {heading}
                    <p className="mt-2 text-sm text-zinc-300">{s.reason}</p>
                    {item && <p className="mt-2 text-xs text-projector/70">Apri la scheda →</p>}
                  </div>
                </div>
              )
              return item ? (
                <Link
                  key={i}
                  to={`/title/${item.mediaType}/${item.id}`}
                  className="block rounded-xl border border-theatre-800 bg-theatre-900/60 p-4 transition hover:-translate-y-0.5 hover:border-projector/40"
                >
                  {body}
                </Link>
              ) : (
                <div key={i} className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-4">
                  {body}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
