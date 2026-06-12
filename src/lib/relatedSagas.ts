import type { Collection } from './types'

// Filtra le collezioni candidate (raccomandazioni TMDB, basate sul genere)
// tenendo solo quelle dello stesso universo narrativo. Il verdetto AI viene
// salvato in localStorage per saga, così la chiamata avviene una sola volta.

const CACHE_KEY = (collectionId: number) => `cinevault_related_sagas_v1_${collectionId}`

const STOPWORDS = new Set([
  'collection', 'collezione', 'saga', 'the', 'la', 'il', 'lo', 'le', 'gli', 'i',
  'of', 'di', 'and', 'e', 'a', 'an', 'un', 'una',
])

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  )
}

// Fallback senza AI: tieni solo le candidate che condividono una parola
// significativa con il nome della saga (es. "Alien" → "Alien: Romulus").
// Conservativo: meglio nascondere un legame vero che mostrare Riddick.
function nameOverlapFilter(sagaName: string, candidates: Collection[]): Collection[] {
  const sagaTokens = nameTokens(sagaName)
  return candidates.filter((c) => {
    const tokens = nameTokens(c.name)
    for (const t of tokens) if (sagaTokens.has(t)) return true
    return false
  })
}

function readCache(collectionId: number): number[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(collectionId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeCache(collectionId: number, ids: number[]) {
  try {
    localStorage.setItem(CACHE_KEY(collectionId), JSON.stringify(ids))
  } catch {
    /* storage pieno o non disponibile — pazienza */
  }
}

export async function filterRelatedCollections(
  collectionId: number,
  sagaName: string,
  candidates: Collection[],
): Promise<Collection[]> {
  if (candidates.length === 0) return []

  const cached = readCache(collectionId)
  if (cached) {
    const ok = new Set(cached)
    return candidates.filter((c) => ok.has(c.id))
  }

  try {
    const res = await fetch('/api/related-sagas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sagaName,
        candidates: candidates.map((c) => ({ id: c.id, name: c.name })),
      }),
    })
    if (!res.ok) throw new Error('Servizio AI non disponibile.')
    const data = (await res.json()) as { ids: number[] }
    const ids = Array.isArray(data.ids) ? data.ids : []
    writeCache(collectionId, ids)
    const ok = new Set(ids)
    return candidates.filter((c) => ok.has(c.id))
  } catch {
    // AI non disponibile: fallback conservativo per nome (non viene cachato,
    // così al prossimo caricamento si ritenta il filtro AI).
    return nameOverlapFilter(sagaName, candidates)
  }
}
