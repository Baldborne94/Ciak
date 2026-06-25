import { useEffect, useState, type ReactNode } from 'react'
import PageHeader from '../components/PageHeader'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { computeStats, type CinemaStats, type CountItem } from '../lib/stats'

// Ritratto sintetico: una frase + chip salienti, derivati dagli aggregati.
function Portrait({ stats }: { stats: CinemaStats }) {
  const genre = stats.topGenres[0]
  const director = stats.topDirectors.find((d) => d.count > 1) ?? stats.topDirectors[0]
  const actor = stats.topActors.find((a) => a.count > 1) ?? stats.topActors[0]
  const favDecade = stats.decades.length
    ? [...stats.decades].sort((a, b) => b.count - a.count)[0]
    : null

  // Frase costruita solo coi pezzi disponibili (con evidenziati come nodi React,
  // niente HTML grezzo dai dati TMDB), così resta sempre sensata.
  const hl = (s: string) => <span className="text-projector">{s}</span>
  const segments: ReactNode[] = []
  if (genre) segments.push(<>ti lasci conquistare dai titoli {hl(genre.name.toLowerCase())}</>)
  if (favDecade) segments.push(<>con un debole per gli {hl(`anni ${favDecade.decade}`)}</>)
  if (director && director.count > 1) segments.push(<>torni spesso da {hl(director.name)}</>)

  const chips: { icon: string; label: string; value: string }[] = []
  if (genre) chips.push({ icon: '🎭', label: 'Genere feticcio', value: genre.name })
  if (favDecade) chips.push({ icon: '📅', label: 'Decennio preferito', value: `Anni ${favDecade.decade}` })
  if (director && director.count > 1) chips.push({ icon: '🎥', label: 'Regista ricorrente', value: director.name })
  if (actor && actor.count > 1) chips.push({ icon: '🌟', label: 'Attore ricorrente', value: actor.name })

  return (
    <div className="rounded-2xl border border-projector/30 bg-gradient-to-br from-projector/10 to-theatre-900/40 p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-projector/80">Il tuo ritratto</p>
      <p className="mt-2 font-display text-xl leading-relaxed text-zinc-100 sm:text-2xl">
        {segments.length === 0 ? (
          'Continua a guardare e segnare titoli: il tuo ritratto cinefilo prenderà forma.'
        ) : (
          <>
            Da quello che guardi,{' '}
            {segments.map((seg, i) => (
              <span key={i}>
                {seg}
                {i < segments.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </>
        )}
      </p>
      {chips.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {chips.map((c) => (
            <div key={c.label} className="rounded-xl border border-theatre-800 bg-theatre-950/40 p-3">
              <div className="text-xl">{c.icon}</div>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">{c.label}</p>
              <p className="line-clamp-1 text-sm font-semibold text-zinc-200" title={c.value}>{c.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-theatre-800 bg-theatre-900/60 p-5 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="mt-2 font-display text-3xl tracking-wide text-projector">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  )
}

function RankList({ title, icon, items }: { title: string; icon: string; items: CountItem[] }) {
  if (items.length === 0) return null
  const max = items[0].count
  return (
    <div className="rounded-2xl border border-theatre-800 bg-theatre-900/60 p-5">
      <h3 className="mb-4 font-display text-lg tracking-wide text-zinc-100">
        {icon} {title}
      </h3>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.name} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm text-zinc-300" title={it.name}>
              {it.name}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-theatre-800">
              <div
                className="h-full rounded-full bg-projector"
                style={{ width: `${(it.count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs text-zinc-500">{it.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DecadeChart({ stats }: { stats: CinemaStats }) {
  if (stats.decades.length === 0) return null
  const max = Math.max(...stats.decades.map((d) => d.count))
  return (
    <div className="rounded-2xl border border-theatre-800 bg-theatre-900/60 p-5">
      <h3 className="mb-4 font-display text-lg tracking-wide text-zinc-100">📅 Per decennio</h3>
      <div className="flex items-end gap-2" style={{ height: 160 }}>
        {stats.decades.map((d) => (
          <div key={d.decade} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs text-zinc-400">{d.count}</span>
            <div
              className="w-full rounded-t bg-projector/80 transition-all"
              style={{ height: `${Math.max(4, (d.count / max) * 130)}px` }}
              title={`Anni ${d.decade}: ${d.count}`}
            />
            <span className="text-[11px] text-zinc-500">{`'${String(d.decade).slice(2)}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RatingHistogram({ stats }: { stats: CinemaStats }) {
  if (stats.ratedCount === 0) return null
  const max = Math.max(...stats.ratingHistogram.map((h) => h.count))
  return (
    <div className="rounded-2xl border border-theatre-800 bg-theatre-900/60 p-5">
      <h3 className="mb-4 font-display text-lg tracking-wide text-zinc-100">
        ⭐ Come voti {stats.avgRating != null && (
          <span className="ml-2 text-sm font-normal text-zinc-500">media {stats.avgRating} / 5</span>
        )}
      </h3>
      <div className="flex items-end gap-1.5" style={{ height: 120 }}>
        {stats.ratingHistogram.map((h) => (
          <div key={h.half} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-t bg-amber-400/80"
              style={{ height: `${max ? Math.max(2, (h.count / max) * 90) : 2}px` }}
              title={`${h.half} stelle: ${h.count}`}
            />
            <span className="text-[10px] text-zinc-500">{h.half}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function YearsInFilm({ stats }: { stats: CinemaStats }) {
  if (stats.yearsInFilm.length === 0) return null
  return (
    <div className="rounded-2xl border border-theatre-800 bg-theatre-900/60 p-5">
      <h3 className="mb-4 font-display text-lg tracking-wide text-zinc-100">🎞️ Il tuo anno in film</h3>
      <div className="space-y-3">
        {stats.yearsInFilm.map((y) => (
          <div key={y.year} className="flex items-center justify-between gap-4 border-b border-theatre-800/60 pb-4 last:border-0 last:pb-0">
            <div className="shrink-0">
              <p className="font-display text-2xl tracking-wide text-projector">{y.year}</p>
              <p className="text-xs text-zinc-500">
                {y.count} visioni{y.avgRating != null && ` · media ${y.avgRating}`}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2 text-right">
              <span className="rounded-full border border-theatre-700 bg-theatre-950/40 px-3 py-1 text-sm text-zinc-300">
                🎬 {y.movies} film
              </span>
              <span className="rounded-full border border-theatre-700 bg-theatre-950/40 px-3 py-1 text-sm text-zinc-300">
                📺 {y.series} serie
              </span>
              {y.fiveStars > 0 && (
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm text-amber-300">
                  ⭐ {y.fiveStars} da 5★
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StatsPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<CinemaStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    computeStats(user.id)
      .then((s) => { if (!cancelled) setStats(s) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  return (
    <div>
      <PageHeader
        eyebrow="Il tuo cinema"
        title="Statistiche"
        subtitle="Un ritratto dei tuoi gusti: quanto guardi, cosa preferisci, registi e attori ricorrenti e l'evoluzione anno per anno."
      />

      {loading ? (
        <Loader label="Calcolo le statistiche… (leggo i dettagli dei tuoi titoli)" />
      ) : error ? (
        <ErrorState title="Statistiche non disponibili" message={error} />
      ) : !stats || stats.totalTitles === 0 ? (
        <EmptyState
          title="Ancora niente da analizzare"
          message="Segna qualche film o serie come «Visto» o registralo nel diario: qui troverai le tue statistiche cinefile."
          icon="📊"
        />
      ) : (
        <div className="space-y-6">
          <Portrait stats={stats} />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon="🎬" value={String(stats.movies)} label="Film visti" />
            <StatCard icon="📺" value={String(stats.series)} label="Serie viste" />
            <StatCard icon="⏱️" value={`${stats.filmHours}h`} label="Ore di film" />
            <StatCard icon="⭐" value={stats.avgRating != null ? String(stats.avgRating) : '—'} label="Voto medio" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <RankList title="Generi preferiti" icon="🎭" items={stats.topGenres} />
            <RatingHistogram stats={stats} />
            <RankList title="Registi & creatori" icon="🎥" items={stats.topDirectors} />
            <RankList title="Attori più visti" icon="🌟" items={stats.topActors} />
            <DecadeChart stats={stats} />
            <YearsInFilm stats={stats} />
          </div>

          {stats.cappedAt && (
            <p className="text-center text-xs text-zinc-600">
              Generi, registi e decenni sono calcolati sui primi {stats.cappedAt} titoli per non
              sovraccaricare TMDB. I conteggi totali restano completi.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
