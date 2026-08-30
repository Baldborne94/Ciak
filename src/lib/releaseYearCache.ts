// Gli anni di uscita servono per ordinare le liste, e finora venivano richiesti
// a TMDB da capo a ogni apertura: una richiesta per titolo, ogni volta, per un
// dato che per un film già uscito non cambierà mai più.
//
// Sta tutto in una sola chiave di localStorage invece di una per titolo: meno
// scritture, e un tetto facile da rispettare.

const KEY = 'ciak:release-years:v1'
// Oltre questo numero la cache viene svuotata: è un accorgimento contro la
// crescita illimitata, non un limite di funzionamento (le liste personali
// stanno molto sotto, e ricostruirla costa una visita).
const MAX_ENTRIES = 5000
const GIORNO_MS = 24 * 60 * 60 * 1000

type Entry = [year: string | null, savedAt: number]
type Store = Record<string, Entry>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // localStorage negato (navigazione privata, impostazioni): si tira dritto
    // senza cache, non è un errore da mostrare.
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

// L'anno di un film GIÀ USCITO non cambia più, quindi si tiene per sempre.
// Un anno futuro o sconosciuto invece si sposta (rinvii, date non annunciate),
// quindi vale un giorno.
function isStale([year, savedAt]: Entry, now: number): boolean {
  if (year === null) return now - savedAt > GIORNO_MS
  return Number(year) >= new Date(now).getFullYear() && now - savedAt > GIORNO_MS
}

// `undefined` = non in cache (da chiedere a TMDB); `null` = anno sconosciuto.
export function getCachedYears(
  keys: string[],
  now = Date.now(),
): Map<string, string | null> {
  const store = read()
  const out = new Map<string, string | null>()
  for (const k of keys) {
    const entry = store[k]
    if (entry && !isStale(entry, now)) out.set(k, entry[0])
  }
  return out
}

export function cacheYears(years: Map<string, string | null>, now = Date.now()): void {
  if (years.size === 0) return
  let store = read()
  if (Object.keys(store).length + years.size > MAX_ENTRIES) store = {}
  for (const [k, year] of years) store[k] = [year, now]
  write(store)
}
