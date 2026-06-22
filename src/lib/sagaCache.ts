// Cache locale dell'ordine cronologico di una saga.
// L'ordine «secondo la storia» è deterministico per collezione e uguale per
// tutti, quindi non serve una tabella per-utente: basta il localStorage. Così
// evitiamo di richiamare Claude (latenza + credito AI) per la stessa saga.

export interface SagaOrder {
  ids: number[] // tmdb id in ordine di storia
  notes: Record<number, string> // tmdb id → nota dell'AI
}

const PREFIX = 'ciak:saga-order:'
// Bump per invalidare cache vecchie se cambia il formato/prompt.
const VERSION = 'v1'

function key(collectionId: number): string {
  return `${PREFIX}${VERSION}:${collectionId}`
}

export function getCachedSagaOrder(collectionId: number): SagaOrder | null {
  try {
    const raw = localStorage.getItem(key(collectionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SagaOrder
    if (!Array.isArray(parsed.ids)) return null
    return { ids: parsed.ids, notes: parsed.notes ?? {} }
  } catch {
    return null
  }
}

export function saveCachedSagaOrder(collectionId: number, order: SagaOrder): void {
  try {
    localStorage.setItem(key(collectionId), JSON.stringify(order))
  } catch {
    // storage pieno o non disponibile: la cache è best-effort.
  }
}
