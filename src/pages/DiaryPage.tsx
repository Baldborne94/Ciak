import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import StarRating from '../components/StarRating'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { addDiaryEntry, deleteDiaryEntry, listDiary, updateDiaryEntry } from '../lib/diary'
import { listByStatus, upsertUserTitle } from '../lib/userTitles'
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// `watched_at` è un timestamp (timestamptz): lo riportiamo alla data locale
// YYYY-MM-DD così i titoli segnati "Visto" si allineano al giorno del diario.
function localDay(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Voce unificata della timeline: o una visione datata del diario, o un titolo
// segnato "Visto" (che porta con sé la data in `watched_at`). Così un film appena
// segnato compare in cima, sotto la sua data, invece di finire in un blocco a parte.
type TimelineItem =
  | { kind: 'diary'; date: string; entry: DiaryEntry }
  | { kind: 'watched'; date: string; record: UserTitle }

function itemKey(it: TimelineItem): string {
  return it.kind === 'diary' ? `d:${it.entry.id}` : `w:${it.record.id}`
}
function itemTmdbKey(it: TimelineItem): string {
  return it.kind === 'diary'
    ? `${it.entry.tmdb_id}:${it.entry.media_type}`
    : `${it.record.tmdb_id}:${it.record.media_type}`
}
function itemRating(it: TimelineItem): number | null {
  return it.kind === 'diary' ? it.entry.rating : it.record.personal_rating
}
function itemHaystack(it: TimelineItem): string {
  return it.kind === 'diary'
    ? `${it.entry.title} ${it.entry.note ?? ''}`.toLowerCase()
    : it.record.title.toLowerCase()
}

export default function DiaryPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [watched, setWatched] = useState<UserTitle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Filtri: ricerca testuale (titolo/recensione), anno di visione, voto minimo.
  const [query, setQuery] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [minRating, setMinRating] = useState(0)

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

  // Voto di un titolo segnato "Visto" che non ha ancora una voce nel diario.
  // Dare un voto = registrare la visione: creiamo la voce di diario (datata dal
  // giorno in cui l'hai segnato visto) così il voto compare subito nella lista e
  // la riga diventa una normale voce del diario (modificabile ed eliminabile).
  async function rateWatched(record: UserTitle, rating: number | null) {
    if (!user) return

    // Voto azzerato su un titolo senza voce di diario: aggiorniamo solo il voto
    // in user_titles, la riga resta "Visto" senza data di visione registrata.
    if (rating == null) {
      const prev = record.personal_rating
      setWatched((ws) =>
        ws.map((w) => (w.id === record.id ? { ...w, personal_rating: null } : w)),
      )
      try {
        await upsertUserTitle(
          user.id,
          {
            tmdbId: record.tmdb_id,
            mediaType: record.media_type === 'movie' ? 'movie' : 'tv',
            title: record.title,
            posterPath: record.poster_path,
            genreIds: record.genre_ids ?? [],
          },
          { personal_rating: null },
        )
      } catch (e) {
        setWatched((ws) =>
          ws.map((w) => (w.id === record.id ? { ...w, personal_rating: prev } : w)),
        )
        showToast(`Voto non salvato: ${(e as Error).message}`)
      }
      return
    }

    // Feedback immediato sulle stelle mentre registriamo la visione.
    setWatched((ws) =>
      ws.map((w) => (w.id === record.id ? { ...w, personal_rating: rating } : w)),
    )
    try {
      const entry = await addDiaryEntry(
        user.id,
        {
          tmdbId: record.tmdb_id,
          mediaType: record.media_type,
          title: record.title,
          posterPath: record.poster_path,
        },
        {
          watchedOn: record.watched_at ? localDay(record.watched_at) : todayISO(),
          rating,
          note: null,
        },
      )
      // Ora è una voce del diario: la togliamo dai "Visto" e la aggiungiamo alle
      // voci datate, così smette di essere una riga speciale e mostra il voto.
      setEntries((prev) => [entry, ...prev])
      setWatched((ws) => ws.filter((w) => w.id !== record.id))
    } catch (e) {
      setWatched((ws) =>
        ws.map((w) => (w.id === record.id ? { ...w, personal_rating: record.personal_rating } : w)),
      )
      showToast(`Voto non salvato: ${(e as Error).message}`)
    }
  }

  // Quante voci ha ogni opera nel diario: > 1 significa rivisioni. Calcolato sul
  // diario completo (non sui filtri) così il conteggio resta corretto.
  const viewingsByTitle = entries.reduce<Record<string, number>>((acc, e) => {
    const k = `${e.tmdb_id}:${e.media_type}`
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  // Titoli segnati "Visto" senza una voce nel diario. Quelli con una data
  // (`watched_at`) entrano nella timeline datata; quelli senza restano in un
  // blocco "senza data" a parte (dati vecchi, prima che la data venisse salvata).
  const inDiary = useMemo(
    () => new Set(entries.map((e) => `${e.tmdb_id}:${e.media_type}`)),
    [entries],
  )
  const watchedNotInDiary = useMemo(
    () => watched.filter((w) => !inDiary.has(`${w.tmdb_id}:${w.media_type}`)),
    [watched, inDiary],
  )

  // Timeline unificata: visioni del diario + titoli "Visto" datati, tutti con
  // una data così compaiono nel punto giusto (in cima, se appena segnati).
  const timeline = useMemo<TimelineItem[]>(() => {
    const fromDiary: TimelineItem[] = entries.map((e) => ({
      kind: 'diary',
      date: e.watched_on,
      entry: e,
    }))
    const fromWatched: TimelineItem[] = watchedNotInDiary
      .filter((w) => w.watched_at)
      .map((w) => ({ kind: 'watched', date: localDay(w.watched_at as string), record: w }))
    return [...fromDiary, ...fromWatched]
  }, [entries, watchedNotInDiary])

  // Titoli "Visto" privi di data: nessun giorno a cui agganciarli.
  const watchedUndated = useMemo(
    () => watchedNotInDiary.filter((w) => !w.watched_at),
    [watchedNotInDiary],
  )

  // Anni disponibili per il filtro, dal più recente (dall'intera timeline).
  const years = useMemo(() => {
    const set = new Set(timeline.map((it) => it.date.slice(0, 4)))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [timeline])

  // Applica i filtri alle voci datate.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return timeline.filter((it) => {
      if (yearFilter !== 'all' && it.date.slice(0, 4) !== yearFilter) return false
      if (minRating > 0 && (itemRating(it) ?? 0) < minRating) return false
      if (q && !itemHaystack(it).includes(q)) return false
      return true
    })
  }, [timeline, query, yearFilter, minRating])

  const filtersActive = query.trim() !== '' || yearFilter !== 'all' || minRating > 0

  // Group by date, ordinando i giorni dal più recente.
  const groups = useMemo(() => {
    const acc: Record<string, TimelineItem[]> = {}
    for (const it of filtered) (acc[it.date] ??= []).push(it)
    return acc
  }, [filtered])
  const dates = useMemo(
    () => Object.keys(groups).sort((a, b) => b.localeCompare(a)),
    [groups],
  )

  // Il blocco "senza data" segue gli stessi filtri (testo + voto). Il filtro per
  // anno lo nasconde: questi titoli non hanno un anno di visione.
  const q = query.trim().toLowerCase()
  const watchedOnly =
    yearFilter !== 'all'
      ? []
      : watchedUndated
          .filter((w) => minRating === 0 || (w.personal_rating ?? 0) >= minRating)
          .filter((w) => !q || w.title.toLowerCase().includes(q))

  const isEmpty = entries.length === 0 && watched.length === 0
  const noMatches = !isEmpty && dates.length === 0 && watchedOnly.length === 0

  return (
    <div>
      <PageHeader
        eyebrow="Il tuo registro"
        title="Visti & Diario"
        subtitle="Tutto ciò che hai guardato: le visioni datate in ordine di data e i titoli segnati come visti. Tocca le stelle per cambiare il voto."
      />

      {!loading && !error && !isEmpty && (
        <div className="mb-8 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <label htmlFor="diary-search" className="text-xs uppercase tracking-wider text-zinc-500">
              Cerca
            </label>
            <input
              id="diary-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Titolo o testo della recensione…"
              className="input-cine mt-1 w-full py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="diary-year" className="text-xs uppercase tracking-wider text-zinc-500">
              Anno
            </label>
            <select
              id="diary-year"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="input-cine mt-1 py-2 text-sm"
            >
              <option value="all">Tutti</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="diary-rating" className="text-xs uppercase tracking-wider text-zinc-500">
              Voto minimo
            </label>
            <select
              id="diary-rating"
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="input-cine mt-1 py-2 text-sm"
            >
              <option value={0}>Qualsiasi</option>
              {[1, 2, 3, 4, 4.5, 5].map((r) => (
                <option key={r} value={r}>{r}★ e oltre</option>
              ))}
            </select>
          </div>
          {filtersActive && (
            <button
              onClick={() => { setQuery(''); setYearFilter('all'); setMinRating(0) }}
              className="btn-ghost py-2 text-sm"
            >
              Azzera filtri
            </button>
          )}
        </div>
      )}

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
      ) : noMatches ? (
        <EmptyState
          title="Nessun risultato"
          message="Nessuna voce del diario corrisponde ai filtri. Prova ad allargare la ricerca."
          icon="🔍"
        />
      ) : (
        <div className="space-y-10">
          {dates.map((date) => (
            <div key={date}>
              <h2 className="mb-4 font-display text-xl capitalize tracking-wide text-projector">
                {formatDate(date)}
              </h2>
              <div className="space-y-3">
                {groups[date].map((it) => {
                  if (it.kind === 'watched') {
                    const w = it.record
                    const poster = posterUrl(w.poster_path, 'w185')
                    const type = w.media_type === 'movie' ? 'movie' : 'tv'
                    return (
                      <div
                        key={itemKey(it)}
                        className="group flex gap-4 rounded-xl border border-theatre-800 bg-theatre-900/60 p-3"
                      >
                        <Link to={`/title/${type}/${w.tmdb_id}`} className="shrink-0">
                          <div className="h-24 w-16 overflow-hidden rounded-md bg-theatre-800">
                            {poster ? (
                              <img src={poster} alt={w.title} loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-2xl opacity-30">🎞️</div>
                            )}
                          </div>
                        </Link>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/title/${type}/${w.tmdb_id}`}
                              className="font-semibold text-zinc-100 hover:text-projector"
                            >
                              {w.title}
                            </Link>
                            <span
                              className="rounded-full border border-emerald-600/30 bg-emerald-600/5 px-2 py-0.5 text-[11px] text-emerald-400"
                              title="Segnato come visto (senza recensione nel diario)"
                            >
                              ✓ Visto
                            </span>
                          </div>
                          <div className="mt-0.5">
                            <StarRating
                              value={w.personal_rating}
                              onChange={(v) => rateWatched(w, v)}
                              size="sm"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  }

                  const e = it.entry
                  const poster = posterUrl(e.poster_path, 'w185')
                  const type = e.media_type === 'movie' ? 'movie' : 'tv'
                  return (
                    <div
                      key={itemKey(it)}
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
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/title/${type}/${e.tmdb_id}`}
                            className="font-semibold text-zinc-100 hover:text-projector"
                          >
                            {e.title}
                          </Link>
                          {viewingsByTitle[itemTmdbKey(it)] > 1 && (
                            <span
                              className="rounded-full border border-projector/30 bg-projector/5 px-2 py-0.5 text-[11px] text-projector"
                              title={`${viewingsByTitle[itemTmdbKey(it)]} visioni registrate`}
                            >
                              🔁 rivisto
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5">
                          <StarRating
                            value={e.rating}
                            onChange={(v) => changeRating(e, v)}
                            size="sm"
                          />
                        </div>
                        {e.note && (
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-400">
                            {e.note}
                          </p>
                        )}
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
