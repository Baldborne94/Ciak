import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import SavedTitleCard from '../components/SavedTitleCard'
import StarRating from '../components/StarRating'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { addDiaryEntry, deleteDiaryEntry, listDiary, updateDiaryEntry } from '../lib/diary'
import { backfillTitlesFromDiary, listAll, upsertUserTitle } from '../lib/userTitles'
import { useToast } from '../lib/toastCtx'
import { logFailure } from '../lib/logFailure'
import { useLibrary } from '../lib/libraryCtx'
import { getGenres, posterUrl } from '../lib/tmdb'
import {
  FILTRI_VUOTI,
  TIPI,
  contaFiltriAttivi,
  filtriAttivi,
  generiPresenti,
  passaIFiltri,
  type FiltroTipo,
  type VoceFiltrabile,
} from '../lib/diaryFilters'
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
// Il voto da mostrare, riconciliando le due fonti: se questa visione non ha
// stelle ma il titolo è votato nella sua scheda, mostriamo quel voto invece di
// stelle vuote — le due pagine devono raccontare la stessa storia.
function itemRating(it: TimelineItem, ratingByTitle?: Map<string, number>): number | null {
  const own = it.kind === 'diary' ? it.entry.rating : it.record.personal_rating
  return own ?? ratingByTitle?.get(itemTmdbKey(it)) ?? null
}
function itemHaystack(it: TimelineItem): string {
  return it.kind === 'diary'
    ? `${it.entry.title} ${it.entry.note ?? ''}`.toLowerCase()
    : it.record.title.toLowerCase()
}

export default function DiaryPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { refresh } = useLibrary()
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  // Tutte le righe di user_titles, non solo i "Visto": servono anche i voti dei
  // titoli con altro stato, così una visione senza stelle può mostrare il voto
  // che l'utente ha dato nella scheda.
  const [titles, setTitles] = useState<UserTitle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Filtri: ricerca testuale (titolo/recensione), anno di visione, voto minimo.
  const [query, setQuery] = useState('')
  const [yearFilter, setYearFilter] = useState('all')
  const [minRating, setMinRating] = useState(0)
  const [tipo, setTipo] = useState<FiltroTipo>('all')
  const [genere, setGenere] = useState<number | 'all'>('all')
  const [soloConNota, setSoloConNota] = useState(false)
  // Su telefono i filtri stanno chiusi: aperti sono sei controlli impilati, cioè
  // uno schermo intero prima di vedere anche solo un film. La ricerca invece
  // resta sempre fuori, perché è quella che si usa.
  const [filtriAperti, setFiltriAperti] = useState(false)
  // id → nome dei generi, da TMDB. Se non arrivano, il menu dei generi non
  // compare: meglio nasconderlo che offrire scelte senza etichetta.
  const [nomiGeneri, setNomiGeneri] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    if (!user) return
    setLoading(true)
    // Carichiamo sia il diario (visioni datate) sia la collezione: così questa è
    // l'unica pagina di tutto ciò che hai guardato, e i due lati si allineano.
    Promise.all([listDiary(user.id), listAll(user.id)])
      .then(async ([diary, all]) => {
        setEntries(diary)
        setTitles(all)

        // Riparazione una tantum dello storico: per un periodo una visione
        // senza voto non creava la scheda del titolo, quindi quei film
        // risultavano visti qui ma non avevano il badge sulle card né
        // entravano nelle statistiche. Il flag evita di riscansionare a ogni
        // apertura, come per la riparazione dei generi nel Profilo di gusto.
        const flag = `ciak:diary-titles-backfill:${user.id}`
        if (localStorage.getItem(flag)) return
        const create = await backfillTitlesFromDiary(user.id, diary, all).catch((e: Error) => {
          logFailure('schede mancanti non ricostruite dal diario')(e)
          return 0
        })
        localStorage.setItem(flag, '1')
        if (create > 0) {
          // Ricarichiamo la collezione e l'indice dei badge, così le schede
          // appena ricostruite si vedono senza dover ricaricare la pagina.
          await listAll(user.id).then(setTitles).catch(logFailure('collezione non ricaricata'))
          refresh()
          showToast(
            create === 1
              ? 'Ho ritrovato 1 titolo visto che mancava dalla collezione.'
              : `Ho ritrovato ${create} titoli visti che mancavano dalla collezione.`,
            'success',
          )
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    // refresh e showToast sono stabili (useCallback nei rispettivi provider):
    // dichiararli non fa ripartire il caricamento a ogni render.
  }, [user, refresh, showToast])

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
  // Aggiornamento ottimistico del voto di un titolo in collezione.
  function patchTitleRating(id: string, personal_rating: number | null) {
    setTitles((ts) => ts.map((t) => (t.id === id ? { ...t, personal_rating } : t)))
  }

  async function rateWatched(record: UserTitle, rating: number | null) {
    if (!user) return

    // Voto azzerato su un titolo senza voce di diario: aggiorniamo solo il voto
    // in user_titles, la riga resta "Visto" senza data di visione registrata.
    if (rating == null) {
      const prev = record.personal_rating
      patchTitleRating(record.id, null)
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
        patchTitleRating(record.id, prev)
        showToast(`Voto non salvato: ${(e as Error).message}`)
      }
      return
    }

    // Feedback immediato sulle stelle mentre registriamo la visione.
    patchTitleRating(record.id, rating)
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
      // Ora è una voce del diario: aggiungendola alle voci datate la riga smette
      // di essere un "Visto senza data" (esce da watchedNotInDiary da sola).
      setEntries((prev) => [entry, ...prev])
    } catch (e) {
      patchTitleRating(record.id, record.personal_rating)
      showToast(`Voto non salvato: ${(e as Error).message}`)
    }
  }

  // I nomi dei generi arrivano da TMDB (film e serie insieme: un id vale per
  // entrambi i cataloghi). Best effort — senza, il filtro per genere non si
  // mostra e il resto della pagina funziona lo stesso.
  useEffect(() => {
    let annullato = false
    Promise.all([getGenres('movie'), getGenres('tv')])
      .then(([film, serie]) => {
        if (annullato) return
        const m = new Map<number, string>()
        for (const g of [...film, ...serie]) m.set(g.id, g.name)
        setNomiGeneri(m)
      })
      .catch(logFailure('generi del diario non caricati'))
    return () => {
      annullato = true
    }
  }, [])

  // I titoli segnati "Visto": alimentano la timeline come prima.
  const watched = useMemo(() => titles.filter((t) => t.status === 'watched'), [titles])

  // Voti e stato "visto" per titolo, chiave "tmdbId:mediaType". Sono il ponte fra
  // la scheda del titolo e il diario: qui la pagina legge ciò che l'altra ha salvato.
  const ratingByTitle = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of titles) {
      if (t.personal_rating != null) map.set(`${t.tmdb_id}:${t.media_type}`, t.personal_rating)
    }
    return map
  }, [titles])
  const watchedKeys = useMemo(
    () => new Set(watched.map((w) => `${w.tmdb_id}:${w.media_type}`)),
    [watched],
  )

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

  // I generi di un titolo stanno in user_titles, non nella voce di diario:
  // si recuperano dalla riga corrispondente (chiave composta tipo+id, perché
  // un film e una serie possono avere lo stesso numero).
  const generiPerTitolo = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const t of titles) m.set(`${t.tmdb_id}:${t.media_type}`, t.genre_ids ?? [])
    return m
  }, [titles])

  // Ogni voce ridotta alla forma che i filtri sanno leggere.
  const voci = useMemo(() => {
    const m = new Map<TimelineItem, VoceFiltrabile>()
    for (const it of timeline) {
      const chiave = itemTmdbKey(it)
      m.set(it, {
        mediaType: it.kind === 'diary' ? it.entry.media_type : it.record.media_type,
        genreIds: generiPerTitolo.get(chiave) ?? [],
        testo: itemHaystack(it),
        anno: it.date.slice(0, 4),
        voto: itemRating(it, ratingByTitle),
        haNota: it.kind === 'diary' ? Boolean(it.entry.note?.trim()) : false,
      })
    }
    return m
  }, [timeline, generiPerTitolo, ratingByTitle])

  const filtri = useMemo(
    () => ({ query, anno: yearFilter, votoMin: minRating, tipo, genere, soloConNota }),
    [query, yearFilter, minRating, tipo, genere, soloConNota],
  )

  // Applica i filtri alle voci datate.
  const filtered = useMemo(
    () => timeline.filter((it) => passaIFiltri(voci.get(it) as VoceFiltrabile, filtri)),
    [timeline, voci, filtri],
  )

  // I generi da offrire: solo quelli presenti nel diario, col più frequente in
  // cima. Contati sull'intera timeline, non su ciò che è già filtrato — se no
  // scegliere un genere farebbe sparire tutti gli altri dal menu.
  const generi = useMemo(
    () => generiPresenti([...voci.values()], nomiGeneri),
    [voci, nomiGeneri],
  )

  const filtersActive = filtriAttivi(filtri)

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

  // Passa dagli stessi filtri della timeline, così «Horror» o «Solo film»
  // valgono anche qui invece di lasciare un blocco che ignora le tue scelte.
  // `anno` resta l'eccezione dichiarata: questi titoli un anno non ce l'hanno.
  const watchedOnly =
    yearFilter !== 'all'
      ? []
      : watchedUndated.filter((w) =>
          passaIFiltri(
            {
              mediaType: w.media_type,
              genreIds: w.genre_ids ?? [],
              testo: w.title.toLowerCase(),
              anno: '',
              voto: w.personal_rating,
              haNota: Boolean(w.notes?.trim()),
            },
            { ...filtri, anno: 'all' },
          ),
        )

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
        <div className="mb-8">
         <div className="flex flex-wrap items-end gap-3">
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
          <button
            type="button"
            onClick={() => setFiltriAperti((a) => !a)}
            aria-expanded={filtriAperti}
            aria-controls="diary-filtri"
            className="btn-ghost py-2 text-sm sm:hidden"
          >
            Filtri{contaFiltriAttivi(filtri) > 0 ? ` (${contaFiltriAttivi(filtri)})` : ''}
          </button>
         </div>

         <div
           id="diary-filtri"
           className={`mt-3 flex-wrap items-end gap-3 sm:flex ${filtriAperti ? 'flex' : 'hidden'}`}
         >
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
          <div>
            <label htmlFor="diary-tipo" className="text-xs uppercase tracking-wider text-zinc-500">
              Tipo
            </label>
            <select
              id="diary-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as FiltroTipo)}
              className="input-cine mt-1 py-2 text-sm"
            >
              {TIPI.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {/* Il menu dei generi compare solo se ce ne sono: su un diario appena
              iniziato una tendina con una voce sola è solo ingombro. */}
          {generi.length > 0 && (
            <div>
              <label htmlFor="diary-genere" className="text-xs uppercase tracking-wider text-zinc-500">
                Genere
              </label>
              <select
                id="diary-genere"
                value={genere}
                onChange={(e) =>
                  setGenere(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="input-cine mt-1 py-2 text-sm"
              >
                <option value="all">Tutti</option>
                {generi.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome} ({g.quanti})
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 self-end py-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={soloConNota}
              onChange={(e) => setSoloConNota(e.target.checked)}
              className="h-4 w-4 accent-projector"
            />
            Solo con recensione
          </label>
          {filtersActive && (
            <button
              onClick={() => {
                setQuery(FILTRI_VUOTI.query)
                setYearFilter(FILTRI_VUOTI.anno)
                setMinRating(FILTRI_VUOTI.votoMin)
                setTipo(FILTRI_VUOTI.tipo)
                setGenere(FILTRI_VUOTI.genere)
                setSoloConNota(FILTRI_VUOTI.soloConNota)
              }}
              className="btn-ghost self-end py-2 text-sm"
            >
              Azzera filtri
            </button>
          )}
         </div>
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
                          {watchedKeys.has(itemTmdbKey(it)) && (
                            <span
                              className="rounded-full border border-emerald-600/30 bg-emerald-600/5 px-2 py-0.5 text-[11px] text-emerald-400"
                              title="Segnato come visto nella tua collezione"
                            >
                              ✓ Visto
                            </span>
                          )}
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
                            value={itemRating(it, ratingByTitle)}
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
