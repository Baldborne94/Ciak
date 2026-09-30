// I titoli con cui cercare un titolo salvato, oltre a quello italiano che
// user_titles già conserva: l'originale e quello inglese. Si chiedono a TMDB
// una volta per dispositivo, come gli anni di uscita (`releaseYearCache`), in
// una sola chiave di localStorage.

const KEY = 'ciak:titoli-ricerca:v1'
const MAX_ENTRIES = 5000
// Un titolo cambia di rado (una traduzione che arriva tardi), ma cambia: dopo
// un mese si richiede.
const DURATA_MS = 30 * 24 * 60 * 60 * 1000

type Entry = [titoli: string[], savedAt: number]
type Store = Record<string, Entry>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // localStorage negato: si cerca solo col titolo italiano, non è un errore.
    return {}
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* quota piena o storage negato: la cache è un di più */
  }
}

// Solo le voci presenti e fresche: le altre vanno chieste a TMDB.
export function getCachedSearchTitles(keys: string[], now = Date.now()): Map<string, string[]> {
  const store = read()
  const out = new Map<string, string[]>()
  for (const k of keys) {
    const entry = store[k]
    if (entry && Array.isArray(entry[0]) && now - entry[1] <= DURATA_MS) out.set(k, entry[0])
  }
  return out
}

export function cacheSearchTitles(titoli: Map<string, string[]>, now = Date.now()): void {
  if (titoli.size === 0) return
  let store = read()
  if (Object.keys(store).length + titoli.size > MAX_ENTRIES) store = {}
  for (const [k, t] of titoli) store[k] = [t, now]
  write(store)
}
