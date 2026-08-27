import { useEffect, useState } from 'react'
import { logFailure } from '../lib/logFailure'
import { useToast } from '../lib/toastCtx'
import MediaCard from './MediaCard'
import { EmptyState, ErrorState, Loader } from './States'
import AiCreditsNote from './AiCreditsNote'
import { searchMulti } from '../lib/tmdb'
import { aiFetch } from '../lib/aiClient'
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
import type { MediaItem } from '../lib/types'

// Ask the AI which films use a song, then resolve each to a TMDB item.
async function findSongFilms(song: string): Promise<{ item: MediaItem; note: string }[]> {
  const data = await aiFetch<{ films: { title: string; year?: string; scene: string }[] }>(
    '/api/song-films',
    { song },
  )
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

// "Canzone → film": l'AI trova i film che usano una canzone in scene memorabili.
// Estratto da Search per vivere come scheda dell'hub AI.
export default function SongSearch() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [songTitle, setSongTitle] = useState('')
  const [songArtist, setSongArtist] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [songFilms, setSongFilms] = useState<{ item: MediaItem; note: string }[]>([])
  const [savedSongs, setSavedSongs] = useState<CachedSong[]>([])

  // Saved song searches (cache) — load once per user.
  useEffect(() => {
    if (!user) {
      setSavedSongs([])
      return
    }
    listCachedSongs(user.id).then(setSavedSongs).catch(() => setSavedSongs([]))
  }, [user])

  // Serve dalla cache se presente, altrimenti chiama l'AI e salva.
  async function runSearch(q: string) {
    if (!q.trim()) return
    setQuery(q)
    setLoading(true)
    setError(null)
    try {
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
        await saveCachedSong(user.id, key, q, results).catch(logFailure('ricerca non salvata'))
        listCachedSongs(user.id)
          .then(setSavedSongs)
          .catch(logFailure('elenco delle ricerche salvate non aggiornato'))
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = songTitle.trim()
    const a = songArtist.trim()
    if (!t) return
    runSearch(a ? `${t} - ${a}` : t)
  }

  function reopen(saved: CachedSong) {
    // Split "title - artist" back into the two fields and re-run (from cache).
    const split = saved.query.lastIndexOf(' - ')
    setSongTitle(split > 0 ? saved.query.slice(0, split) : saved.query)
    setSongArtist(split > 0 ? saved.query.slice(split + 3) : '')
    runSearch(saved.query)
  }

  // Cancellazioni ottimistiche: la riga sparisce subito, ma se il database
  // rifiuta va rimessa. Prima l'errore veniva ignorato e la ricerca sembrava
  // cancellata finché non si ricaricava la pagina, dove ricompariva.
  async function removeSavedSong(key: string) {
    if (!user) return
    const before = savedSongs
    setSavedSongs((prev) => prev.filter((s) => s.query_key !== key))
    try {
      await deleteCachedSong(user.id, key)
    } catch (e) {
      setSavedSongs(before)
      showToast(`Non sono riuscito a cancellarla: ${(e as Error).message}`, 'error')
    }
  }

  async function clearSavedSongs() {
    if (!user) return
    const before = savedSongs
    setSavedSongs([])
    try {
      await clearCachedSongs(user.id)
    } catch (e) {
      setSavedSongs(before)
      showToast(`Non sono riuscito a cancellarle: ${(e as Error).message}`, 'error')
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="mb-6 flex flex-col gap-2 sm:flex-row">
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

      <AiCreditsNote className="mb-4" extra="le ricerche già salvate qui sotto non contano." />

      {/* Saved song searches (cache) — instant re-open + delete */}
      {savedSongs.length > 0 && (
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
                  onClick={() => reopen(s)}
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

      {loading ? (
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
      )}
    </div>
  )
}
