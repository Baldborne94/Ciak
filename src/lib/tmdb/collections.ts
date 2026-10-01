import { tmdbFetch } from './client'
import { normalise, type RawCollection, type RawMedia } from './raw'
import { patchReadableTitles } from './titles'
import { mapLimit } from '../mapLimit'
import { cacheYears, getCachedYears } from '../releaseYearCache'
import { cacheGeneri, cacheSearchTitles, getCachedSearchTitles } from '../searchTitleCache'
import type { CacheLocale } from '../cacheLocale'
import type { Collection, CollectionDetail, MediaItem, TmdbType } from '../types'

export async function resolveSagas(names: string[]): Promise<Collection[]> {
  const found = await Promise.all(
    names.map((n) => searchCollection(n).then((r) => r[0] ?? null).catch(() => null)),
  )
  return found.filter((c): c is Collection => c !== null)
}

// Resolve specific collection IDs (more reliable than name search for the
// curated "famous sagas" — avoids matching "making of" documentaries).
export async function resolveSagaIds(ids: number[]): Promise<Collection[]> {
  const found = await Promise.all(
    ids.map((id) =>
      getCollection(id)
        .then((c): Collection => ({ id: c.id, name: c.name, posterPath: c.posterPath }))
        .catch(() => null),
    ),
  )
  return found.filter((c): c is Collection => c !== null)
}

export async function searchCollection(query: string): Promise<Collection[]> {
  if (!query.trim()) return []
  const data = await tmdbFetch<{ results: RawCollection[] }>('/search/collection', {
    query,
  })
  return data.results.map((c) => ({
    id: c.id,
    name: c.name,
    posterPath: c.poster_path ?? null,
  }))
}

export async function getCollection(id: number): Promise<CollectionDetail> {
  const [raw, enRaw] = await Promise.all([
    tmdbFetch<RawCollection>(`/collection/${id}`),
    tmdbFetch<RawCollection>(`/collection/${id}`, { language: 'en-US' }).catch(
      () => ({ id, name: '', parts: [] as RawMedia[] }) as RawCollection,
    ),
  ])
  // Titoli stranieri non tradotti in it-IT → ripiego sul titolo inglese.
  if (raw.parts) patchReadableTitles(raw.parts, enRaw.parts ?? [])
  const items = (raw.parts ?? [])
    .map((m) => normalise(m, 'movie'))
    // Chronological order by release date.
    .sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''))
  return {
    id: raw.id,
    name: raw.name,
    overview: raw.overview || null,
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    items,
  }
}

// Lightweight collection-membership lookup for a movie (no heavy appends).
export async function getMovieCollectionId(movieId: number): Promise<number | null> {
  try {
    const raw = await tmdbFetch<{
      belongs_to_collection?: { id: number } | null
    }>(`/movie/${movieId}`)
    return raw.belongs_to_collection?.id ?? null
  } catch {
    return null
  }
}

// Lightweight release-year lookup for a batch of saved titles (user_titles
// doesn't store a release date). Used to sort/filter personal lists — e.g. the
// watchlist — by year without a full getDetail call per title. Best-effort:
// items that fail to resolve just have a null year.
// Richieste in volo condivise: se due parti della pagina chiedono l'anno dello
// stesso titolo nello stesso momento, la seconda aspetta la prima invece di
// aprire una richiesta gemella. La cache da sola non basta, perché viene
// scritta solo quando la risposta è arrivata.
// Una sola richiesta, in inglese, porta sia l'anno (che non dipende dalla
// lingua) sia i titoli per la ricerca: originale e inglese. Anno e titoli si
// chiedono insieme all'apertura di una lista, e così costano una richiesta
// per titolo invece di due.
interface TitleLookup {
  year: string | null
  titoli: string[]
  generi: number[]
}
const lookupInFlight = new Map<string, Promise<TitleLookup>>()

function fetchLookupOnce(mediaType: TmdbType, tmdbId: number, key: string): Promise<TitleLookup> {
  const pending = lookupInFlight.get(key)
  if (pending) return pending

  const p = tmdbFetch<{
    release_date?: string
    first_air_date?: string
    title?: string
    name?: string
    original_title?: string
    original_name?: string
    genres?: { id: number }[]
  }>(`/${mediaType}/${tmdbId}`, { language: 'en-US' })
    .then((raw) => ({
      year: (raw.release_date || raw.first_air_date)?.slice(0, 4) ?? null,
      titoli: [...new Set([raw.title ?? raw.name, raw.original_title ?? raw.original_name].filter((x): x is string => !!x))],
      generi: (raw.genres ?? []).map((g) => g.id),
    }))
    .finally(() => lookupInFlight.delete(key))

  lookupInFlight.set(key, p)
  return p
}

function fetchYearOnce(mediaType: TmdbType, tmdbId: number, key: string): Promise<string | null> {
  // Un titolo che non risponde non deve far fallire tutta la lista.
  return fetchLookupOnce(mediaType, tmdbId, key).then((l) => l.year, () => null)
}

export async function getReleaseYears(
  refs: { tmdbId: number; mediaType: TmdbType }[],
): Promise<Map<string, string | null>> {
  const keyOf = (r: { tmdbId: number; mediaType: TmdbType }) => `${r.mediaType}-${r.tmdbId}`

  // Una lista può contenere lo stesso titolo più volte: chiederlo una volta sola.
  const unique = new Map(refs.map((r) => [keyOf(r), r]))
  const years = getCachedYears([...unique.keys()])
  const missing = [...unique.values()].filter((r) => !years.has(keyOf(r)))

  // Tetto alla concorrenza: senza, una watchlist lunga apriva una richiesta per
  // titolo tutte insieme, e la pagina restava ferma ad aspettare la valanga.
  const fetched = await mapLimit(missing, 6, async (r) => {
    const key = keyOf(r)
    return [key, await fetchYearOnce(r.mediaType, r.tmdbId, key)] as const
  })

  const nuovi = new Map(fetched)
  cacheYears(nuovi)
  for (const [k, v] of nuovi) years.set(k, v)
  return years
}

// Un dato per titolo preso dalla stessa richiesta degli anni
// (`fetchLookupOnce`), con la sua cache sul dispositivo. Offline si usa solo
// ciò che c'è già. `falliti` conta le richieste andate male, per segnalarle
// una volta sola col totale.
async function perTitolo<T>(
  refs: { tmdbId: number; mediaType: TmdbType }[],
  cache: CacheLocale<T>,
  estrai: (l: TitleLookup) => T,
): Promise<{ valori: Map<string, T>; falliti: number }> {
  const keyOf = (r: { tmdbId: number; mediaType: TmdbType }) => `${r.mediaType}-${r.tmdbId}`
  const unique = new Map(refs.map((r) => [keyOf(r), r]))
  const valori = cache.leggi([...unique.keys()])
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { valori, falliti: 0 }
  const missing = [...unique.values()].filter((r) => !valori.has(keyOf(r)))
  let falliti = 0
  const fetched = await mapLimit(missing, 6, async (r) => {
    try {
      return [keyOf(r), estrai(await fetchLookupOnce(r.mediaType, r.tmdbId, keyOf(r)))] as const
    } catch {
      falliti++
      return null
    }
  })
  const nuovi = new Map(fetched.filter((x): x is readonly [string, Awaited<T>] => x !== null))
  cache.scrivi(nuovi)
  for (const [k, v] of nuovi) valori.set(k, v)
  return { valori, falliti }
}

// I titoli con cui cercare nelle liste personali, oltre a quello italiano
// salvato: l'originale e quello inglese («Song of the Sea» per «La canzone del
// mare»).
export async function getSearchTitles(
  refs: { tmdbId: number; mediaType: TmdbType }[],
): Promise<{ titoli: Map<string, string[]>; falliti: number }> {
  const cache: CacheLocale<string[]> = { leggi: getCachedSearchTitles, scrivi: cacheSearchTitles }
  const { valori, falliti } = await perTitolo(refs, cache, (l) => l.titoli)
  return { titoli: valori, falliti }
}

// I generi (id di TMDB) di ogni titolo, per filtrare la videoteca.
export async function getTitleGenres(
  refs: { tmdbId: number; mediaType: TmdbType }[],
): Promise<{ generi: Map<string, number[]>; falliti: number }> {
  const { valori, falliti } = await perTitolo(refs, cacheGeneri, (l) => l.generi)
  return { generi: valori, falliti }
}

export interface SagaContinuation {
  collectionId: number
  item: MediaItem
}

// "Continua la saga": given the user's watched movies, find the collections they
// belong to and return the next film they *haven't watched yet* in each — so the
// Dashboard can nudge them to finish sagas they've started. Il capitolo proposto
// è il primo NON ANCORA VISTO in ordine cronologico, anche se ce l'hanno già in
// watchlist: così la Sala punta ad Hellraiser 2 (che devi ancora vedere) invece
// di saltare al 3 solo perché il 2 è già in una lista. Bounded (samples watched
// movies, caps collections) to limit API load, but wide enough to cover most
// libraries so older watches aren't missed.
export async function getSagaContinuations(
  watchedMovieIds: number[],
): Promise<SagaContinuation[]> {
  const watchedSet = new Set(watchedMovieIds)
  const sample = watchedMovieIds.slice(0, 60)
  const collectionIds = await Promise.all(sample.map(getMovieCollectionId))
  const uniqueCollections = [...new Set(collectionIds.filter((c): c is number => c != null))].slice(0, 20)
  if (uniqueCollections.length === 0) return []

  const today = new Date().toISOString().slice(0, 10)
  const nexts = await Promise.all(
    uniqueCollections.map(async (cid): Promise<SagaContinuation | null> => {
      try {
        const col = await getCollection(cid) // items sorted chronologically
        // Il primo capitolo che l'utente non ha ancora visto, già uscito e con
        // locandina. Ci si basa sui "visti", non sull'intera collezione: un
        // capitolo già in watchlist va comunque proposto (è quello da guardare).
        const next = col.items.find(
          (f) =>
            !watchedSet.has(f.id) &&
            !!f.releaseDate &&
            f.releaseDate <= today &&
            !!f.posterPath,
        )
        return next ? { collectionId: cid, item: next } : null
      } catch {
        return null
      }
    }),
  )

  const seen = new Set<number>()
  const out: SagaContinuation[] = []
  for (const n of nexts) {
    if (n && !seen.has(n.item.id)) {
      seen.add(n.item.id)
      out.push(n)
    }
  }
  return out
}

// Collections related to a saga, from TMDB recommendations for the saga's
// films grouped by the collection the recommended films belong to. Note:
// recommendations are genre-based ("who liked X also liked Y"), so results
// can include franchises from other universes (e.g. Alien → Riddick).
export async function getRelatedCollections(c: CollectionDetail): Promise<Collection[]> {
  // Seed with up to 3 films spread across the saga (first / middle / last).
  const films = c.items
  const seeds = [...new Set([films[0], films[Math.floor(films.length / 2)], films[films.length - 1]])]
    .filter((f): f is MediaItem => !!f)

  // movieId → relevance score (higher rank in recommendations = more points)
  const recScores = new Map<number, number>()
  await Promise.all(
    seeds.map(async (f) => {
      try {
        const data = await tmdbFetch<{ results: { id: number }[] }>(
          `/movie/${f.id}/recommendations`,
        )
        data.results.slice(0, 12).forEach((r, idx) => {
          recScores.set(r.id, (recScores.get(r.id) ?? 0) + (12 - idx))
        })
      } catch {
        /* seed failed — ignore */
      }
    }),
  )

  const own = new Set(films.map((i) => i.id))
  const top = [...recScores.entries()]
    .filter(([movieId]) => !own.has(movieId))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Fetch each top movie's collection membership and aggregate.
  const byCollection = new Map<number, { col: Collection; score: number }>()
  await Promise.all(
    top.map(async ([movieId, score]) => {
      try {
        const raw = await tmdbFetch<{
          belongs_to_collection?: { id: number; name: string; poster_path?: string | null } | null
        }>(`/movie/${movieId}`)
        const btc = raw.belongs_to_collection
        if (!btc || btc.id === c.id) return
        const existing = byCollection.get(btc.id)
        if (existing) existing.score += score
        else {
          byCollection.set(btc.id, {
            col: { id: btc.id, name: btc.name, posterPath: btc.poster_path ?? null },
            score,
          })
        }
      } catch {
        /* ignore */
      }
    }),
  )

  return [...byCollection.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((e) => e.col)
}

// ── Production companies / studios ─────────────────────────────────────────
