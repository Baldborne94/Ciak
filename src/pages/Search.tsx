import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import MediaGrid from '../components/MediaGrid'
import MediaCard from '../components/MediaCard'
import ImageIdentify from '../components/ImageIdentify'
import { EmptyState, ErrorState, Loader } from '../components/States'
import {
  searchMulti,
  searchPerson,
  searchCompany,
  searchCollection,
  getGenres,
  getAnime,
  getPervertitoAnime,
  getCartoons,
  getTrending,
  resolveStudios,
  resolveSagaIds,
  resolvePeople,
  profileUrl,
  logoUrl,
  posterUrl,
  isTmdbConfigured,
} from '../lib/tmdb'
import { MediaRow } from '../components/MediaRow'
import { LANGUAGES, YEARS } from '../lib/filters'
import { assertAiQuota, recordAiUse, aiUsesLeft, AI_DAILY_LIMIT } from '../lib/aiQuota'
import { useAuth } from '../lib/auth'
import {
  clearCachedSongs,
  deleteCachedSong,
  getCachedSong,
  listCachedSongs,
  saveCachedSong,
  songKey,
  type CachedSong,
} from '../lib/songCache'
import type {
  MediaItem,
  Person,
  Company,
  Collection,
  Genre,
  TmdbType,
} from '../lib/types'

type Mode = 'titles' | 'people' | 'studios' | 'collections' | 'song' | 'image'
// "Kind" filter inside the Titoli tab: real media types + the derived
// animation catalogs (anime / cartoons), so they live under Titoli instead of
// taking their own top-level tabs.
type Kind = 'all' | 'movie' | 'tv' | 'anime' | 'cartoons'

const MODES: { value: Mode; label: string; icon: string; placeholder?: string }[] = [
  { value: 'titles', label: 'Titoli', icon: '🎬', placeholder: 'Cerca un film, una serie, un anime… (IT o EN)' },
  { value: 'people', label: 'Persone', icon: '🌟', placeholder: 'Cerca attore, regista, compositore…' },
  { value: 'studios', label: 'Studi', icon: '🏛️', placeholder: 'Cerca uno studio… (es. Pixar, A24, Ghibli)' },
  { value: 'collections', label: 'Saghe', icon: '📚', placeholder: 'Cerca una saga… (es. Harry Potter, Marvel)' },
  { value: 'song', label: 'Canzone', icon: '🎵', placeholder: 'In quali film c’è questa canzone? (es. Stayin’ Alive)' },
  { value: 'image', label: 'Foto', icon: '📷' },
]

// Tools that don't do a plain catalog search — set apart in the tab bar.
const AI_MODES = new Set<Mode>(['song', 'image'])

const KIND_FILTERS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'movie', label: 'Film' },
  { value: 'tv', label: 'Serie TV' },
  { value: 'anime', label: '⛩️ Anime' },
  { value: 'cartoons', label: '🎨 Cartoni' },
]

// People role filter — maps to TMDB known_for_department.
const ROLES: { value: string; label: string; dept: string | null }[] = [
  { value: 'all', label: 'Tutti', dept: null },
  { value: 'acting', label: 'Attori', dept: 'Acting' },
  { value: 'directing', label: 'Registi', dept: 'Directing' },
  { value: 'composing', label: 'Compositori', dept: 'Sound' },
  { value: 'writing', label: 'Sceneggiatori', dept: 'Writing' },
]

const ROLE_LABEL: Record<string, string> = {
  Acting: 'Attore',
  Directing: 'Regista',
  Sound: 'Compositore',
  Writing: 'Sceneggiatore',
  Production: 'Produttore',
  Camera: 'Direttore della fotografia',
}

// Curated lists resolved to real TMDB entities for the idle "famous" previews.
const FAMOUS_STUDIOS = ['Pixar', 'Studio Ghibli', 'A24', 'Marvel Studios', 'Warner Bros. Pictures', 'DreamWorks Animation', 'Universal Pictures', 'Walt Disney Pictures', 'Lucasfilm', 'Columbia Pictures']
// TMDB collection IDs (reliable: name search can match "making of" docs).
// Harry Potter 1241 · Star Wars 10 · LOTR 119 · Avengers 86311 · Jurassic 328
// Fast&Furious 9485 · James Bond 645 · Pirates 295 · Dark Knight 263 · Toy Story 10194
const FAMOUS_SAGAS = [1241, 10, 119, 86311, 328, 9485, 645, 295, 263, 10194]
const FAMOUS_ACTORS = ['Al Pacino', 'Robert De Niro', 'Meryl Streep', 'Leonardo DiCaprio', 'Tom Hanks', 'Denzel Washington', 'Anthony Hopkins', 'Morgan Freeman', 'Cate Blanchett', 'Joaquin Phoenix', 'Christian Bale', 'Daniel Day-Lewis', 'Natalie Portman', 'Gary Oldman', 'Brad Pitt']

// Ask the AI which films use a song, then resolve each to a TMDB item.
async function findSongFilms(song: string): Promise<{ item: MediaItem; note: string }[]> {
  assertAiQuota()
  const res = await fetch('/api/song-films', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song }),
  })
  recordAiUse()
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.error ?? 'Servizio AI non disponibile.')
  }
  const data = (await res.json()) as { films: { title: string; year?: string; scene: string }[] }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const resolved = await Promise.all(
    (data.films ?? []).map(async (f) => {
      try {
        const items = await searchMulti(f.title)
        if (items.length === 0) return null
        const target = norm(f.title)
        // Rank by title match + year + prefer movies, to avoid casual mismatches
        // (e.g. a same-sounding anime instead of the actual film).
        const ranked = items
          .map((r) => {
            let score = 0
            if (norm(r.title) === target || norm(r.originalTitle ?? '') === target) score += 10
            else if (norm(r.title).includes(target) || target.includes(norm(r.title))) score += 4
            if (f.year && r.releaseDate?.slice(0, 4) === String(f.year)) score += 5
            if (r.mediaType === 'movie') score += 1
            return { r, score }
          })
          .sort((a, b) => b.score - a.score)
        const best = ranked[0]
        // If nothing matches the title at all, the AI title is unreliable → skip.
        if (!best || best.score === 0) return null
        return { item: best.r, note: f.scene }
      } catch {
        return null
      }
    }),
  )
  const seen = new Set<string>()
  const out: { item: MediaItem; note: string }[] = []
  for (const r of resolved) {
    if (!r) continue
    const key = `${r.item.mediaType}-${r.item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

// Filter title search results down to anime (Japanese animation) or
// cartoons (non-Japanese animation) using genre + original language.
function filterKind(kind: 'anime' | 'cartoons', items: MediaItem[]): MediaItem[] {
  const isAnimation = (i: MediaItem) => i.genreIds.includes(16)
  if (kind === 'anime') return items.filter((i) => isAnimation(i) && i.originalLanguage === 'ja')
  return items.filter((i) => isAnimation(i) && i.originalLanguage !== 'ja')
}

function PersonCard({ p }: { p: Person }) {
  const photo = profileUrl(p.profilePath)
  return (
    <Link
      to={`/person/${p.id}`}
      className="group rounded-xl border border-theatre-800 bg-theatre-900 p-3 text-center transition hover:-translate-y-1 hover:border-projector/40"
    >
      <div className="mx-auto aspect-square w-full overflow-hidden rounded-full border border-theatre-700 bg-theatre-800">
        {photo ? (
          <img src={photo} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-30">👤</div>
        )}
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-semibold text-zinc-100">{p.name}</p>
      <p className="line-clamp-1 text-xs text-projector/70">
        {p.department ? ROLE_LABEL[p.department] ?? p.department : ''}
      </p>
      {p.knownFor && <p className="line-clamp-1 text-xs text-zinc-500">{p.knownFor}</p>}
    </Link>
  )
}

function StudioCard({ c }: { c: Company }) {
  const logo = logoUrl(c.logoPath)
  return (
    <Link
      to={`/studio/${c.id}`}
      className="group flex h-32 flex-col items-center justify-center gap-3 rounded-xl border border-theatre-800 bg-theatre-900 p-4 text-center transition hover:-translate-y-1 hover:border-projector/40"
    >
      {logo ? (
        <img src={logo} alt={c.name} loading="lazy" className="max-h-14 max-w-[80%] rounded bg-white/90 px-3 py-2" />
      ) : (
        <span className="text-4xl opacity-40">🏛️</span>
      )}
      <p className="line-clamp-1 text-sm font-medium text-zinc-200">{c.name}</p>
    </Link>
  )
}

function CollectionCard({ c }: { c: Collection }) {
  const poster = posterUrl(c.posterPath)
  return (
    <Link
      to={`/collection/${c.id}`}
      className="group overflow-hidden rounded-xl border border-theatre-800 bg-theatre-900 transition hover:-translate-y-1 hover:border-projector/40"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-theatre-800">
        {poster ? (
          <img src={poster} alt={c.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-30">📚</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-zinc-100">{c.name}</h3>
      </div>
    </Link>
  )
}

// Paginated browse list for anime / cartoons.
function BrowseList({
  fetcher,
}: {
  fetcher: (page: number) => Promise<{ items: MediaItem[]; totalPages: number }>
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setItems([])
    setPage(1)
    fetcher(1)
      .then(({ items: it, totalPages: tp }) => {
        setItems(it)
        setTotalPages(tp)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetcher])

  async function loadMore() {
    const next = page + 1
    setLoadingMore(true)
    try {
      const { items: it } = await fetcher(next)
      setItems((prev) => [...prev, ...it])
      setPage(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) return <Loader label="Carico il catalogo…" />
  if (error) return <ErrorState title="Catalogo non disponibile" message={error} />
  if (items.length === 0) return <EmptyState title="Nessun titolo" message="Riprova più tardi." />

  return (
    <>
      <MediaGrid items={items} />
      {page < totalPages && (
        <div className="mt-8 flex justify-center">
          <button onClick={loadMore} disabled={loadingMore} className="btn-primary">
            {loadingMore ? 'Carico…' : 'Carica altri'}
          </button>
        </div>
      )}
    </>
  )
}

export default function Search() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const rawMode = params.get('mode')
  // Old links used mode=anime / mode=cartoons; those now live under Titoli.
  const mode: Mode = MODES.some((m) => m.value === rawMode) ? (rawMode as Mode) : 'titles'

  const [input, setInput] = useState(query)
  // Song mode uses two fields (title + artist); split an existing "title - artist".
  const songSplit = rawMode === 'song' ? query.lastIndexOf(' - ') : -1
  const [songTitle, setSongTitle] = useState(() =>
    rawMode === 'song' ? (songSplit > 0 ? query.slice(0, songSplit) : query) : '',
  )
  const [songArtist, setSongArtist] = useState(() =>
    songSplit > 0 ? query.slice(songSplit + 3) : '',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [titles, setTitles] = useState<MediaItem[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [studios, setStudios] = useState<Company[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [songFilms, setSongFilms] = useState<{ item: MediaItem; note: string }[]>([])
  const [savedSongs, setSavedSongs] = useState<CachedSong[]>([])

  const [kind, setKind] = useState<Kind>(
    rawMode === 'anime' || rawMode === 'cartoons' ? rawMode : 'all',
  )
  const [minRating, setMinRating] = useState(0)
  const [titleYear, setTitleYear] = useState('')
  const [titleLang, setTitleLang] = useState('')
  const [sortBy, setSortBy] = useState<'relevance' | 'date_desc' | 'date_asc' | 'rating_desc'>('relevance')
  const [role, setRole] = useState('all')

  const [genreType, setGenreType] = useState<TmdbType>('movie')
  const [genres, setGenres] = useState<Genre[]>([])

  // Idle previews
  const [previewTitles, setPreviewTitles] = useState<MediaItem[]>([])
  const [famousActors, setFamousActors] = useState<Person[]>([])
  const [famousStudios, setFamousStudios] = useState<Company[]>([])
  const [famousSagas, setFamousSagas] = useState<Collection[]>([])

  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0]
  const isAnimationKind = kind === 'anime' || kind === 'cartoons'
  const isSongMode = mode === 'song'
  const isImageMode = mode === 'image'

  useEffect(() => {
    if (!query.trim()) {
      setTitles([]); setPeople([]); setStudios([]); setCollections([]); setSongFilms([])
      return
    }
    if (!isTmdbConfigured) {
      setError('Configura VITE_TMDB_API_KEY per cercare nel catalogo.')
      return
    }
    setLoading(true)
    setError(null)
    const run =
      mode === 'people' ? searchPerson(query).then(setPeople)
      : mode === 'studios' ? searchCompany(query).then(setStudios)
      : mode === 'collections' ? searchCollection(query).then(setCollections)
      : mode === 'song' ? runSongSearch(query)
      // Titoli (anche anime/cartoni): cerca per nome; il filtro "kind" è applicato lato client.
      : searchMulti(query).then(setTitles)
    run.catch((e: Error) => setError(e.message)).finally(() => setLoading(false))

    // Song search: serve dalla cache se presente, altrimenti chiama l'AI e salva.
    async function runSongSearch(q: string) {
      const key = songKey(q)
      if (user) {
        const cached = await getCachedSong(user.id, key).catch(() => null)
        if (cached) {
          setSongFilms(cached)
          return
        }
      }
      const results = await findSongFilms(q)
      setSongFilms(results)
      if (user && results.length > 0) {
        await saveCachedSong(user.id, key, q, results).catch(() => {})
        listCachedSongs(user.id).then(setSavedSongs).catch(() => {})
      }
    }
  }, [query, mode, user])

  useEffect(() => {
    if (mode !== 'titles' || !isTmdbConfigured) return
    getGenres(genreType).then(setGenres).catch(() => setGenres([]))
  }, [genreType, mode])

  // Saved song searches (cache) for the Canzone tab.
  useEffect(() => {
    if (mode !== 'song' || !user) {
      setSavedSongs([])
      return
    }
    listCachedSongs(user.id).then(setSavedSongs).catch(() => setSavedSongs([]))
  }, [mode, user])

  async function removeSavedSong(key: string) {
    if (!user) return
    setSavedSongs((prev) => prev.filter((s) => s.query_key !== key))
    await deleteCachedSong(user.id, key).catch(() => {})
  }

  async function clearSavedSongs() {
    if (!user) return
    setSavedSongs([])
    await clearCachedSongs(user.id).catch(() => {})
  }

  // Idle previews — loaded lazily only for the active tab, once.
  useEffect(() => {
    if (!isTmdbConfigured || query.trim()) return
    if (mode === 'titles' && previewTitles.length === 0) {
      getTrending().then(setPreviewTitles).catch(() => {})
    }
    if (mode === 'people' && famousActors.length === 0) {
      resolvePeople(FAMOUS_ACTORS).then(setFamousActors).catch(() => {})
    }
    if (mode === 'studios' && famousStudios.length === 0) {
      resolveStudios(FAMOUS_STUDIOS).then(setFamousStudios).catch(() => {})
    }
    if (mode === 'collections' && famousSagas.length === 0) {
      resolveSagaIds(FAMOUS_SAGAS).then(setFamousSagas).catch(() => {})
    }
  }, [mode, query, previewTitles.length, famousActors.length, famousStudios.length, famousSagas.length])

  // Trending row respects the Tipo filter (Film / Serie TV).
  const trendingPreview = useMemo(
    () =>
      kind === 'movie' || kind === 'tv'
        ? previewTitles.filter((i) => i.mediaType === kind)
        : previewTitles,
    [previewTitles, kind],
  )

  const filteredTitles = useMemo(() => {
    const base = isAnimationKind ? filterKind(kind as 'anime' | 'cartoons', titles) : titles
    const list = base.filter((r) => {
      if ((kind === 'movie' || kind === 'tv') && r.mediaType !== kind) return false
      if (r.voteAverage < minRating) return false
      if (titleYear && r.releaseDate?.slice(0, 4) !== titleYear) return false
      if (titleLang && r.originalLanguage !== titleLang) return false
      return true
    })
    // Sort: relevance keeps the API order; date/rating sort explicitly (no-date last).
    const byDate = (a: MediaItem, b: MediaItem, dir: 'asc' | 'desc') => {
      if (!a.releaseDate && !b.releaseDate) return 0
      if (!a.releaseDate) return 1
      if (!b.releaseDate) return -1
      return dir === 'asc'
        ? a.releaseDate.localeCompare(b.releaseDate)
        : b.releaseDate.localeCompare(a.releaseDate)
    }
    if (sortBy === 'date_desc') return [...list].sort((a, b) => byDate(a, b, 'desc'))
    if (sortBy === 'date_asc') return [...list].sort((a, b) => byDate(a, b, 'asc'))
    if (sortBy === 'rating_desc') return [...list].sort((a, b) => b.voteAverage - a.voteAverage)
    return list
  }, [titles, kind, isAnimationKind, minRating, titleYear, titleLang, sortBy])

  const filteredPeople = useMemo(() => {
    const dept = ROLES.find((r) => r.value === role)?.dept
    if (!dept) return people
    return people.filter((p) => p.department === dept)
  }, [people, role])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = new URLSearchParams(params)
    if (input.trim()) next.set('q', input.trim())
    else next.delete('q')
    next.set('mode', mode)
    setParams(next)
  }

  function switchMode(m: Mode) {
    const next = new URLSearchParams(params)
    next.set('mode', m)
    setParams(next)
  }

  // Clear the field and return to the idle preview state.
  function clearSearch() {
    setInput('')
    const next = new URLSearchParams(params)
    next.delete('q')
    setParams(next)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Catalogo"
        title="Cerca & Esplora"
        subtitle="Titoli, anime, cartoni, persone, studi e saghe — più gli strumenti AI (canzone, foto)."
      />

      {/* Mode selector — catalog/entity tabs, then the AI tools set apart */}
      <div className="mb-4 flex items-stretch gap-1 overflow-x-auto border-b border-theatre-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MODES.filter((m) => !AI_MODES.has(m.value)).map((m) => (
          <button
            key={m.value}
            onClick={() => switchMode(m.value)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
              mode === m.value
                ? 'border-projector text-projector'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {m.icon} {m.label}
          </button>
        ))}

        {/* Divider + label introducing the AI-powered tools */}
        <span aria-hidden className="mx-2 my-2 w-px self-stretch bg-theatre-700" />
        <span className="flex items-center whitespace-nowrap pr-1 text-xs font-semibold uppercase tracking-wider text-zinc-600">
          ✨ AI
        </span>

        {MODES.filter((m) => AI_MODES.has(m.value)).map((m) => (
          <button
            key={m.value}
            onClick={() => switchMode(m.value)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
              mode === m.value
                ? 'border-projector text-projector'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Song mode — two fields (title + artist) compose the query */}
      {isSongMode && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const t = songTitle.trim()
            const a = songArtist.trim()
            const next = new URLSearchParams(params)
            if (t) next.set('q', a ? `${t} - ${a}` : t)
            else next.delete('q')
            next.set('mode', 'song')
            setParams(next)
          }}
          className="mb-6 flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            placeholder="Titolo canzone (es. Thunderstruck)"
            className="input-cine flex-1"
            autoFocus
          />
          <input
            value={songArtist}
            onChange={(e) => setSongArtist(e.target.value)}
            placeholder="Artista — consigliato (es. AC/DC)"
            className="input-cine flex-1"
          />
          <button type="submit" disabled={!songTitle.trim()} className="btn-primary whitespace-nowrap">
            🔍 Cerca
          </button>
        </form>
      )}
      {isSongMode && (
        <p className="mb-4 text-xs text-zinc-500">
          🤖 Ricerche AI rimaste oggi: <span className="text-projector">{aiUsesLeft()}</span>/{AI_DAILY_LIMIT}
          {' '}· le ricerche già salvate qui sotto non contano.
        </p>
      )}

      {/* Saved song searches (cache) — instant re-open + delete */}
      {isSongMode && savedSongs.length > 0 && (
        <div className="mb-6 rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-zinc-500">💾 Ricerche salvate</span>
            <button onClick={clearSavedSongs} className="text-xs text-curtain-light/80 hover:text-curtain-light">
              Cancella tutte
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedSongs.map((s) => (
              <span
                key={s.query_key}
                className="group inline-flex items-center gap-1 rounded-full border border-theatre-700 bg-theatre-800 py-1 pl-3 pr-1 text-sm text-zinc-200"
              >
                <button
                  onClick={() => {
                    const next = new URLSearchParams(params)
                    next.set('q', s.query)
                    next.set('mode', 'song')
                    setParams(next)
                  }}
                  className="hover:text-projector"
                  title="Riapri (dalla cache)"
                >
                  🎵 {s.query}
                </button>
                <button
                  onClick={() => removeSavedSong(s.query_key)}
                  aria-label="Cancella"
                  className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 transition hover:bg-curtain hover:text-white"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search bar — every mode except photo and song (which have custom inputs) */}
      {!isImageMode && !isSongMode && (
        <form onSubmit={onSubmit} className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <input
              value={input}
              onChange={(e) => {
                const v = e.target.value
                setInput(v)
                // Emptying the field resets to the idle preview state.
                if (v === '' && query) {
                  const next = new URLSearchParams(params)
                  next.delete('q')
                  setParams(next)
                }
              }}
              placeholder={activeMode.placeholder}
              className="input-cine w-full pr-10"
              autoFocus
            />
            {input && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Pulisci ricerca"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-lg text-zinc-500 transition hover:text-zinc-200"
              >
                ✕
              </button>
            )}
          </div>
          <button type="submit" className="btn-primary whitespace-nowrap">
            🔍 Cerca
          </button>
        </form>
      )}

      {/* Title-mode filters — type (incl. anime/cartoons) always, rating when searching */}
      {mode === 'titles' && (
        <div className="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Tipo</span>
            <div className="flex flex-wrap gap-1">
              {KIND_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setKind(f.value)}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    kind === f.value
                      ? 'bg-projector text-theatre-950'
                      : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {query.trim() && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-zinc-500">Voto minimo</span>
                <input
                  type="range" min={0} max={9} step={1} value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="accent-projector"
                />
                <span className="w-8 text-sm font-semibold text-projector">
                  {minRating > 0 ? `${minRating}+` : '—'}
                </span>
              </div>
              <select
                value={titleYear}
                onChange={(e) => setTitleYear(e.target.value)}
                className="input-cine w-auto py-1.5 text-sm"
              >
                <option value="">Anno: qualsiasi</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={titleLang}
                onChange={(e) => setTitleLang(e.target.value)}
                className="input-cine w-auto py-1.5 text-sm"
              >
                <option value="">Lingua: qualsiasi</option>
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="input-cine w-auto py-1.5 text-sm"
              >
                <option value="relevance">Ordina: rilevanza</option>
                <option value="date_desc">Più recenti</option>
                <option value="date_asc">Più vecchi</option>
                <option value="rating_desc">Voto più alto</option>
              </select>
            </>
          )}
        </div>
      )}

      {/* People-mode role filter */}
      {mode === 'people' && query.trim() && people.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border border-theatre-800 bg-theatre-900/40 p-4">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Ruolo</span>
          {ROLES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRole(r.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                role === r.value
                  ? 'bg-projector text-theatre-950'
                  : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Canzone → film (via AI) ── */}
      {isSongMode && (
        loading ? (
          <Loader label="🎵 Cerco i film con questa canzone…" />
        ) : error ? (
          <ErrorState title="Ricerca non riuscita" message={error} />
        ) : !query.trim() ? (
          <EmptyState
            title="In quali film c'è una canzone?"
            message="Scrivi il titolo di una canzone — meglio con l'artista (es. «Stuck in the Middle with You - Stealers Wheel»). L'AI trova i film che la usano in scene memorabili. Funziona meglio con brani celebri usati in film noti."
            icon="🎵"
          />
        ) : songFilms.length === 0 ? (
          <EmptyState
            title="Nessun film trovato"
            message={`Non ho trovato film noti che usano "${query}". Prova ad aggiungere l'artista (es. «${query} - nome artista») o un brano più celebre — es. Layla, Bohemian Rhapsody, In the Air Tonight.`}
            icon="🎵"
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {songFilms.map(({ item, note }) => (
              <div key={`${item.mediaType}-${item.id}`}>
                <MediaCard item={item} />
                {note && <p className="mt-1 px-1 text-xs italic text-zinc-500">🎬 {note}</p>}
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Foto → riconosci il titolo (via AI vision) ── */}
      {isImageMode && <ImageIdentify />}

      {/* ── Search modes (titoli, persone, studi, saghe) ── */}
      {!isSongMode && !isImageMode && (
        loading ? (
          <Loader label="Sfoglio la pellicola…" />
        ) : error ? (
          <ErrorState title="Ricerca non riuscita" message={error} />
        ) : !query.trim() ? (
          mode === 'titles' ? (
            isAnimationKind ? (
              kind === 'anime' ? (
                <div className="space-y-12">
                  <BrowseList fetcher={getAnime} />
                  <div>
                    <h2 className="mb-1 font-display text-2xl tracking-wide text-zinc-100">
                      😏 Pervertito
                    </h2>
                    <p className="mb-4 text-sm text-zinc-500">
                      Ecchi, fan-service, harem e hentai: tutto ciò che è «sus», nel suo angolo.
                    </p>
                    <BrowseList fetcher={getPervertitoAnime} />
                  </div>
                </div>
              ) : (
                <BrowseList fetcher={getCartoons} />
              )
            ) : (
            <div className="space-y-10">
              {trendingPreview.length > 0 && (
                <div>
                  <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                    🔥 Di tendenza ora
                    {kind === 'movie' ? ' · Film' : kind === 'tv' ? ' · Serie TV' : ''}
                  </h2>
                  <MediaRow items={trendingPreview} />
                </div>
              )}
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <span className="font-display text-xl tracking-wide text-zinc-100">
                    🎭 Sfoglia per genere
                  </span>
                  <div className="ml-auto flex gap-1">
                    {(['movie', 'tv'] as TmdbType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setGenreType(t)}
                        className={`rounded-md px-3 py-1.5 text-sm transition ${
                          genreType === t
                            ? 'bg-projector text-theatre-950'
                            : 'bg-theatre-800 text-zinc-300 hover:bg-theatre-700'
                        }`}
                      >
                        {t === 'movie' ? 'Film' : 'Serie TV'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {genres.map((g) => (
                    <Link
                      key={g.id}
                      to={`/genre/${genreType}/${g.id}`}
                      className="rounded-xl border border-theatre-700 bg-theatre-900/60 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:-translate-y-0.5 hover:border-projector/40 hover:text-projector"
                    >
                      {g.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            )
          ) : mode === 'people' ? (
            <div>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                🌟 Attori celebri
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {famousActors.map((p) => <PersonCard key={p.id} p={p} />)}
              </div>
            </div>
          ) : mode === 'studios' ? (
            <div>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                🏛️ Studi celebri
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {famousStudios.map((c) => <StudioCard key={c.id} c={c} />)}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="mb-4 font-display text-xl tracking-wide text-zinc-100">
                📚 Saghe celebri
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {famousSagas.map((c) => <CollectionCard key={c.id} c={c} />)}
              </div>
            </div>
          )
        ) : mode === 'titles' ? (
          filteredTitles.length === 0 ? (
            <EmptyState title="Nessun risultato" message={`Nessun titolo per "${query}" con i filtri attuali.`} />
          ) : (
            <MediaGrid items={filteredTitles} />
          )
        ) : mode === 'people' ? (
          filteredPeople.length === 0 ? (
            <EmptyState title="Nessuna persona trovata" message={`Nessun risultato per "${query}" in questo ruolo.`} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredPeople.map((p) => <PersonCard key={p.id} p={p} />)}
            </div>
          )
        ) : mode === 'studios' ? (
          studios.length === 0 ? (
            <EmptyState title="Nessuno studio trovato" message={`Nessun risultato per "${query}".`} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {studios.map((c) => <StudioCard key={c.id} c={c} />)}
            </div>
          )
        ) : (
          // collections
          collections.length === 0 ? (
            <EmptyState title="Nessuna saga trovata" message={`Nessun risultato per "${query}".`} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {collections.map((c) => <CollectionCard key={c.id} c={c} />)}
            </div>
          )
        )
      )}
    </div>
  )
}
