import { useEffect, useMemo, useState } from 'react'
import { logFailure } from '../lib/logFailure'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StarRating from '../components/StarRating'
import { EmptyState, ErrorState, Loader } from '../components/States'
import { useAuth } from '../lib/auth'
import { backfillGenreIds, getIdentity, listAll, saveIdentity } from '../lib/userTitles'
import { listDiary } from '../lib/diary'
import { getGenres, posterUrl } from '../lib/tmdb'
import { useIdentityCtx } from '../lib/identityCtx'
import { analyzeTaste, buildIdentity, personaById, type TasteInput } from '../lib/cinephileIdentity'
import type { DiaryEntry, MediaType, UserTitle } from '../lib/types'

const TYPE_LABELS: Record<string, string> = {
  movie: 'Film',
  tv: 'Serie TV',
  anime: 'Anime',
  cartoon: 'Cartoni',
}

function Bar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-sm text-zinc-300" title={label}>{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-theatre-800">
        <div className="h-full rounded-full bg-projector" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-semibold text-projector">
        {value}{suffix ?? ''}
      </span>
    </div>
  )
}

// Identità Cinefila: card in cima al profilo. Analizza i gusti, propone
// persona/tema/avatar/nickname e lascia all'utente «Applica» o «Rigenera».
function IdentityHero({
  titles,
  genreMap,
  userId,
}: {
  titles: TasteInput[]
  genreMap: Map<number, string>
  userId: string
}) {
  const { setIdentity } = useIdentityCtx()
  const analysis = useMemo(() => analyzeTaste(titles), [titles])
  const [variant, setVariant] = useState(0)
  // Persona scelta a mano (se ne hai più di una forte); null = quella dominante.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Nickname digitato/scelto a mano; null = quello suggerito dalla variante.
  const [customNickname, setCustomNickname] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [appliedNickname, setAppliedNickname] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  // Persona effettiva: quella scelta a mano, altrimenti la dominante.
  const persona =
    analysis.rankedPersonas.find((p) => p.id === selectedId) ?? analysis.persona

  // Allinea la card all'identità già salvata: stessa persona, stesso nickname.
  useEffect(() => {
    let cancelled = false
    getIdentity(userId)
      .then((stored) => {
        if (cancelled || !stored?.nickname) return
        setAppliedNickname(stored.nickname)
        const savedPersona = personaById(stored.avatar_seed)
        if (savedPersona && analysis.rankedPersonas.some((p) => p.id === savedPersona.id)) {
          setSelectedId(savedPersona.id)
        }
        const pool = (savedPersona ?? analysis.persona).nicknames
        const idx = pool.findIndex((n) => n === stored.nickname)
        // Se il nome salvato non è tra i suggerimenti, era personalizzato.
        if (idx >= 0) setVariant(idx)
        else setCustomNickname(stored.nickname)
      })
      .catch(logFailure('profilo di gusto non aggiornato'))
    return () => {
      cancelled = true
    }
  }, [userId, analysis.persona, analysis.rankedPersonas])

  const base = buildIdentity(persona, variant)
  const nickname = customNickname?.trim() ? customNickname.trim() : base.nickname
  const isActive = appliedNickname === nickname
  const topNames = analysis.topGenreIds
    .map((g) => genreMap.get(g))
    .filter((n): n is string => !!n)
    .slice(0, 3)

  function chooseInstead(p: typeof persona) {
    setSelectedId(p.id)
    setCustomNickname(null)
    setVariant(0)
  }

  async function apply() {
    setApplying(true)
    // Aggiorno subito Navbar e tema (ottimistico): il nome in alto deve cambiare
    // al click, anche se poi il salvataggio su Supabase dovesse fallire.
    setIdentity({ nickname, avatarUrl: base.avatarUrl, theme: persona.theme })
    setAppliedNickname(nickname)
    try {
      // avatar_style = icona, avatar_seed = id persona (per ricostruire i colori).
      await saveIdentity(userId, {
        nickname,
        avatarStyle: base.emoji,
        avatarSeed: persona.id,
        theme: persona.theme,
      })
    } catch {
      // best-effort: un errore di rete/permessi non deve rompere la pagina né
      // annullare l'aggiornamento già mostrato nel Navbar.
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="mb-10 flex flex-col items-center gap-6 rounded-2xl border border-projector/30 bg-theatre-900/60 p-6 shadow-reel sm:flex-row sm:p-8">
      <div className="shrink-0">
        <img
          src={base.avatarUrl}
          alt={nickname}
          className="h-28 w-28 rounded-2xl border-2 border-projector/40 bg-theatre-800"
        />
      </div>

      <div className="flex-1 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          La tua identità cinefila
        </p>
        <h2 className="mt-1 font-display text-3xl tracking-wide text-projector">
          {nickname}
        </h2>
        <p className="mt-1 text-sm text-zinc-300">
          {persona.emoji} {persona.label} — {persona.tagline}
        </p>
        {topNames.length > 0 && (
          <p className="mt-2 text-xs text-zinc-500">
            Basata sui tuoi {analysis.watchedCount} titoli visti, soprattutto{' '}
            <span className="text-zinc-400">{topNames.join(', ')}</span>.
          </p>
        )}

        {/* Scelta tra le persone affini (solo se ne hai più di una). */}
        {analysis.rankedPersonas.length > 1 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs text-zinc-500">Il tuo stile spazia — scegli l'identità:</p>
            <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {analysis.rankedPersonas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => chooseInstead(p)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    p.id === persona.id
                      ? 'border-projector/60 bg-projector/15 text-projector'
                      : 'border-theatre-800 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Editor del nickname: suggerimenti + campo libero. */}
        {editingName && (
          <div className="mt-4 rounded-xl border border-theatre-800 bg-theatre-950/40 p-3">
            <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
              {persona.nicknames.map((n) => (
                <button
                  key={n}
                  onClick={() => setCustomNickname(n)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    n === nickname
                      ? 'border-projector/60 bg-projector/15 text-projector'
                      : 'border-theatre-800 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customNickname ?? ''}
              onChange={(e) => setCustomNickname(e.target.value)}
              placeholder="…oppure scrivi il tuo nickname"
              maxLength={40}
              className="mt-2 w-full rounded-lg border border-theatre-800 bg-theatre-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-projector/50"
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <button onClick={apply} disabled={applying || isActive} className="btn-primary px-4 py-2 text-sm">
            {isActive ? '✓ Identità attiva' : applying ? 'Applico…' : '✨ Applica identità'}
          </button>
          <button
            onClick={() => {
              setCustomNickname(null)
              setVariant((v) => v + 1)
            }}
            disabled={applying || persona.nicknames.length <= 1}
            className="btn-ghost px-4 py-2 text-sm"
          >
            🎲 Rigenera
          </button>
          <button
            onClick={() => setEditingName((v) => !v)}
            disabled={applying}
            className="btn-ghost px-4 py-2 text-sm"
          >
            {editingName ? '✕ Chiudi' : '✏️ Scegli nome'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TasteProfile() {
  const { user } = useAuth()
  const [rows, setRows] = useState<UserTitle[]>([])
  const [diary, setDiary] = useState<DiaryEntry[]>([])
  const [genreMap, setGenreMap] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([
      listAll(user.id),
      listDiary(user.id).catch(() => [] as DiaryEntry[]),
      getGenres('movie'),
      getGenres('tv'),
    ])
      .then(([titles, diaryEntries, gm, gt]) => {
        setRows(titles)
        setDiary(diaryEntries)
        const map = new Map<number, string>()
        for (const g of [...gm, ...gt]) map.set(g.id, g.name)
        setGenreMap(map)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  // Backfill una tantum dei generi mancanti (titoli salvati prima del fix):
  // gira in background e, se aggiorna qualcosa, ricarica i titoli così i
  // "Generi preferiti" si popolano senza dover ri-toccare ogni titolo.
  // Il flag in localStorage evita di ri-scansionare tutto lo storico a ogni
  // apertura del Profilo: una volta sistemato, non serve più ripeterlo.
  useEffect(() => {
    if (!user) return
    const flag = `ciak:genre-backfill:${user.id}`
    if (localStorage.getItem(flag)) return
    let cancelled = false
    backfillGenreIds(user.id)
      .then((esito) => {
        if (cancelled) return
        // Il flag si mette solo se non è rimasto niente indietro: segnarlo
        // «fatto» dopo una passata in cui metà titoli non hanno risposto
        // significa non riprovarci mai più su questo browser.
        if (esito.falliti === 0) localStorage.setItem(flag, '1')
        if (esito.aggiornati > 0) {
          listAll(user.id).then(setRows).catch(logFailure('collezione non ricaricata'))
        }
      })
      .catch(logFailure('profilo di gusto non aggiornato'))
    return () => {
      cancelled = true
    }
  }, [user])

  const stats = useMemo(() => {
    const watched = rows.filter((r) => r.status === 'watched')
    const favs = rows.filter((r) => r.is_favorite)

    // I voti vivono in due posti: user_titles (scheda titolo) e user_diary
    // (visioni registrate). Li uniamo per titolo: vale il voto della scheda,
    // altrimenti il voto del diario più recente.
    interface RatedItem {
      id: string
      tmdb_id: number
      media_type: MediaType
      title: string
      poster_path: string | null
      rating: number
      isFavorite: boolean
      when: string // data della visione o del salvataggio, per i pari merito
    }
    const ratedByTitle = new Map<string, RatedItem>()
    const keyOf = (tmdbId: number, mediaType: string) => `${mediaType}:${tmdbId}`
    for (const e of diary) {
      // listDiary è ordinato dal più recente: la prima occorrenza vince.
      if (e.rating == null) continue
      const k = keyOf(e.tmdb_id, e.media_type)
      if (!ratedByTitle.has(k)) {
        ratedByTitle.set(k, {
          id: `diary-${e.id}`,
          tmdb_id: e.tmdb_id,
          media_type: e.media_type,
          title: e.title,
          poster_path: e.poster_path,
          rating: e.rating,
          isFavorite: false,
          when: e.watched_on ?? e.created_at ?? '',
        })
      }
    }
    for (const r of rows) {
      if (r.personal_rating == null) continue
      ratedByTitle.set(keyOf(r.tmdb_id, r.media_type), {
        id: r.id,
        tmdb_id: r.tmdb_id,
        media_type: r.media_type,
        title: r.title,
        poster_path: r.poster_path,
        rating: r.personal_rating,
        isFavorite: r.is_favorite,
        when: r.watched_at ?? r.updated_at ?? '',
      })
    }
    const rated = [...ratedByTitle.values()]
    // Taste = watched + favorites
    const taste = rows.filter((r) => r.status === 'watched' || r.is_favorite)

    const genreCounts = new Map<number, number>()
    for (const r of taste) {
      for (const id of r.genre_ids ?? []) {
        genreCounts.set(id, (genreCounts.get(id) ?? 0) + 1)
      }
    }
    const topGenres = [...genreCounts.entries()]
      .map(([id, count]) => ({ name: genreMap.get(id) ?? `#${id}`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    const typeCounts = new Map<string, number>()
    for (const r of taste) typeCounts.set(r.media_type, (typeCounts.get(r.media_type) ?? 0) + 1)
    const types = [...typeCounts.entries()]
      .map(([t, count]) => ({ label: TYPE_LABELS[t] ?? t, count }))
      .sort((a, b) => b.count - a.count)

    const ratingDist = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((star) => ({
      star,
      count: rated.filter((r) => r.rating === star).length,
    }))
    const avg =
      rated.length > 0 ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0

    // A parità di voto serve un criterio, altrimenti "i tuoi titoli col voto
    // più alto" sono solo i primi dieci capitati: con molti 5 stelle
    // l'ordinamento per solo voto lascia decidere all'ordine di inserimento.
    // Prima i preferiti (li hai scelti due volte), poi i più recenti.
    const topRated = [...rated]
      .sort(
        (a, b) =>
          b.rating - a.rating ||
          Number(b.isFavorite) - Number(a.isFavorite) ||
          b.when.localeCompare(a.when),
      )
      .slice(0, 10)

    return { watched, rated, favs, topGenres, types, ratingDist, avg, topRated }
  }, [rows, diary, genreMap])

  if (loading) return <Loader label="Analizzo i tuoi gusti…" />
  if (error) return <ErrorState title="Profilo non disponibile" message={error} />

  if (rows.length === 0 && diary.length === 0)
    return (
      <div>
        <PageHeader eyebrow="Su di te" title="Profilo di gusto" />
        <EmptyState
          title="Ancora nessun dato"
          message="Segna qualche titolo come visto e dai dei voti: qui costruirò il tuo profilo cinefilo."
          icon="📊"
        />
      </div>
    )

  const maxGenre = stats.topGenres[0]?.count ?? 1
  const maxType = stats.types[0]?.count ?? 1
  const maxRating = Math.max(1, ...stats.ratingDist.map((r) => r.count))

  return (
    <div>
      <PageHeader
        eyebrow="Su di te"
        title="Profilo di gusto"
        subtitle="Cosa raccontano i tuoi voti e i titoli che hai visto."
      />

      {user && <IdentityHero titles={rows} genreMap={genreMap} userId={user.id} />}

      {/* Headline numbers */}
      <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Visti', value: stats.watched.length, icon: '🎬' },
          { label: 'Votati', value: stats.rated.length, icon: '⭐' },
          { label: 'Preferiti', value: stats.favs.length, icon: '❤️' },
          { label: 'Voto medio', value: stats.avg ? stats.avg.toFixed(1) : '—', icon: '📈' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-theatre-800 bg-theatre-900/60 p-4">
            <div className="text-2xl">{s.icon}</div>
            <div className="mt-2 font-display text-3xl tracking-wide text-projector">{s.value}</div>
            <div className="text-xs text-zinc-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Top genres */}
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">🎭 Generi preferiti</h2>
          {stats.topGenres.length === 0 ? (
            <p className="text-sm text-zinc-500">Aggiungi titoli per scoprire i tuoi generi.</p>
          ) : (
            <div className="space-y-3">
              {stats.topGenres.map((g) => (
                <Bar key={g.name} label={g.name} value={g.count} max={maxGenre} />
              ))}
            </div>
          )}
        </section>

        {/* Content types */}
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">🍿 Cosa guardi</h2>
          <div className="space-y-3">
            {stats.types.map((t) => (
              <Bar key={t.label} label={t.label} value={t.count} max={maxType} />
            ))}
          </div>
        </section>

        {/* Rating distribution */}
        <section>
          <h2 className="mb-4 font-display text-2xl tracking-wide text-zinc-100">⭐ Come voti</h2>
          <div className="space-y-3">
            {stats.ratingDist.map((r) => (
              <Bar
                key={r.star}
                label={'★'.repeat(Math.floor(r.star)) + (r.star % 1 ? '½' : '')}
                value={r.count}
                max={maxRating}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Top rated titles */}
      {stats.topRated.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-1 font-display text-2xl tracking-wide text-zinc-100">
            🏅 I tuoi titoli col voto più alto
          </h2>
          {/* Il criterio dichiarato: con molti 5 stelle "i dieci col voto più
              alto" non significa niente se non si dice come si scelgono. */}
          <p className="mb-4 text-xs text-zinc-500">
            A parità di voto vengono prima i preferiti, poi i visti più di recente.
          </p>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {stats.topRated.map((r) => {
              const poster = posterUrl(r.poster_path)
              const type = r.media_type === 'movie' ? 'movie' : 'tv'
              return (
                <Link
                  key={r.id}
                  to={`/title/${type}/${r.tmdb_id}`}
                  className="group overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40"
                >
                  <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
                    {poster ? (
                      <img src={poster} alt={r.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">🎞️</div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-1 text-xs font-semibold text-zinc-100">{r.title}</p>
                    <StarRating value={r.rating} size="sm" />
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
