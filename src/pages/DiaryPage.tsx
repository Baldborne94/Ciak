import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import StarRating from '../components/StarRating'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { deleteDiaryEntry, listDiary, updateDiaryEntry } from '../lib/diary'
import { listByStatus } from '../lib/userTitles'
import { useToast } from '../lib/toastCtx'
import { posterUrl } from '../lib/tmdb'
import type { DiaryEntry, UserTitle } from '../lib/types'

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
  const { showToast } = useToast()
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [watched, setWatched] = useState<UserTitle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    // Carichiamo sia il diario (visioni datate) sia i titoli segnati "Visto":
    // così questa è l'unica pagina di tutto ciò che hai guardato.
    Promise.all([listDiary(user.id), listByStatus(user.id, 'watched')])
      .then(([diary, seen]) => {
        setEntries(diary)
        setWatched(seen)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  async function remove(entry: DiaryEntry) {
    if (!user) return
    try {
      await deleteDiaryEntry(user.id, entry)
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    } catch (e) {
      showToast(`Impossibile rimuovere dal diario: ${(e as Error).message}`)
    }
  }

  async function changeRating(entry: DiaryEntry, rating: number | null) {
    if (!user) return
    // Aggiornamento ottimistico: la UI risponde subito, poi confermiamo.
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, rating } : e)))
    try {
      await updateDiaryEntry(user.id, entry, { rating })
    } catch (e) {
      // Ripristina il valore precedente e avvisa.
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)))
      showToast(`Voto non salvato: ${(e as Error).message}`)
    }
  }

  // Group by date.
  const groups = entries.reduce<Record<string, DiaryEntry[]>>((acc, e) => {
    ;(acc[e.watched_on] ??= []).push(e)
    return acc
  }, {})
  const dates = Object.keys(groups)

  // Titoli segnati "Visto" che non hanno una voce nel diario: li mostriamo a
  // parte così non spariscono ora che "Visti" e "Diario" sono un'unica sezione.
  const inDiary = new Set(entries.map((e) => `${e.tmdb_id}:${e.media_type}`))
  const watchedOnly = watched.filter((w) => !inDiary.has(`${w.tmdb_id}:${w.media_type}`))

  const isEmpty = entries.length === 0 && watchedOnly.length === 0

  return (
    <div>
      <PageHeader
        eyebrow="Il tuo registro"
        title="Visti & Diario"
        subtitle="Tutto ciò che hai guardato: le visioni datate in ordine di data e i titoli segnati come visti. Tocca le stelle per cambiare il voto."
      />

      {loading ? (
        <Loader label="Sfoglio il diario…" />
      ) : error ? (
        <ErrorState title="Diario non disponibile" message={error} />
      ) : isEmpty ? (
        <EmptyState
          title="Ancora niente da mostrare"
          message="Apri la scheda di un titolo: segnalo come «Visto» o usa «Segna nel diario» per registrare quando l'hai guardato."
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
                        <div className="mt-0.5">
                          <StarRating
                            value={e.rating}
                            onChange={(v) => changeRating(e, v)}
                            size="sm"
                          />
                        </div>
                        {e.note && <p className="mt-1 text-sm text-zinc-400">{e.note}</p>}
                      </div>
                      <button
                        onClick={() => remove(e)}
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

          {watchedOnly.length > 0 && (
            <div>
              <h2 className="mb-1 font-display text-xl tracking-wide text-projector">
                Visti (senza data)
              </h2>
              <p className="mb-4 text-sm text-zinc-500">
                Titoli che hai segnato come visti senza registrarli nel diario. Aprili e usa «Segna
                nel diario» per dargli una data e un voto.
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {watchedOnly.map((record) => (
                  <SavedTitleCard key={record.id} record={record} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
