import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StarRating from '../components/StarRating'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { deleteDiaryEntry, listDiary } from '../lib/diary'
import { posterUrl } from '../lib/tmdb'
import type { DiaryEntry } from '../lib/types'

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function DiaryPage() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    listDiary(user.id)
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  async function remove(id: string) {
    await deleteDiaryEntry(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  // Group by date.
  const groups = entries.reduce<Record<string, DiaryEntry[]>>((acc, e) => {
    ;(acc[e.watched_on] ??= []).push(e)
    return acc
  }, {})
  const dates = Object.keys(groups)

  return (
    <div>
      <PageHeader
        eyebrow="Il tuo registro"
        title="Diario di visione"
        subtitle="Ogni film e serie che hai guardato, in ordine di data. Segnali dalla scheda titolo."
      />

      {loading ? (
        <Loader label="Sfoglio il diario…" />
      ) : error ? (
        <ErrorState title="Diario non disponibile" message={error} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Diario ancora vuoto"
          message="Apri la scheda di un titolo e usa «Segna nel diario» per registrare quando l'hai visto."
          icon="📖"
        />
      ) : (
        <div className="space-y-10">
          {dates.map((date) => (
            <div key={date}>
              <h2 className="mb-4 font-display text-xl capitalize tracking-wide text-projector">
                {formatDate(date)}
              </h2>
              <div className="space-y-3">
                {groups[date].map((e) => {
                  const poster = posterUrl(e.poster_path, 'w185')
                  const type = e.media_type === 'movie' ? 'movie' : 'tv'
                  return (
                    <div
                      key={e.id}
                      className="group flex gap-4 rounded-xl border border-theatre-800 bg-theatre-900/60 p-3"
                    >
                      <Link to={`/title/${type}/${e.tmdb_id}`} className="shrink-0">
                        <div className="h-24 w-16 overflow-hidden rounded-md bg-theatre-800">
                          {poster ? (
                            <img src={poster} alt={e.title} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl opacity-30">🎞️</div>
                          )}
                        </div>
                      </Link>
                      <div className="flex-1">
                        <Link
                          to={`/title/${type}/${e.tmdb_id}`}
                          className="font-semibold text-zinc-100 hover:text-projector"
                        >
                          {e.title}
                        </Link>
                        {e.rating ? (
                          <div className="mt-0.5">
                            <StarRating value={e.rating} size="sm" />
                          </div>
                        ) : null}
                        {e.note && <p className="mt-1 text-sm text-zinc-400">{e.note}</p>}
                      </div>
                      <button
                        onClick={() => remove(e.id)}
                        aria-label="Rimuovi dal diario"
                        className="self-start text-zinc-600 opacity-0 transition hover:text-curtain-light group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
