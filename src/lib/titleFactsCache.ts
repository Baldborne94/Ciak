import type { TitleFacts } from './types'

// Generi, regista, cast e durata di un film non cambiano: chiederli a TMDB a
// ogni apertura delle Statistiche è puro spreco, ed è il motivo per cui
// l'analisi era limitata ai primi duecento titoli. Messi in cache, l'intera
// collezione diventa analizzabile e la seconda visita è istantanea.
//
// Una sola chiave di localStorage invece di una per titolo: meno scritture, e
// un tetto facile da rispettare.

const KEY = 'ciak:title-facts:v1'
// Oltre questo numero la cache viene svuotata: è una difesa contro la crescita
// illimitata, non un limite di funzionamento. Ricostruirla costa una visita.
const MAX_ENTRIES = 3000

type Store = Record<string, TitleFacts>

export const factsKey = (type: string, id: number) => `${type}-${id}`

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // localStorage negato o contenuto illeggibile: si tira dritto senza cache.
    return {}
  }
}

export function getCachedFacts(keys: string[]): Map<string, TitleFacts> {
  const store = read()
  const out = new Map<string, TitleFacts>()
  for (const k of keys) {
    const f = store[k]
    // Una voce va usata solo se ha la forma attesa: una cache di una versione
    // precedente non deve produrre statistiche sbagliate in silenzio.
    if (f && Array.isArray(f.genres) && Array.isArray(f.directors)) out.set(k, f)
  }
  return out
}

export function cacheFacts(facts: Map<string, TitleFacts>): void {
  if (facts.size === 0) return
  let store = read()
  if (Object.keys(store).length + facts.size > MAX_ENTRIES) store = {}
  for (const [k, f] of facts) store[k] = f
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* quota piena: la cache è un acceleratore, non un requisito */
  }
}
