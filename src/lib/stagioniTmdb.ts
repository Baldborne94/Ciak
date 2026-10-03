import { getDetail } from './tmdb'
import type { EpisodioVideoteca } from './videoteca'

// Quanti episodi ha davvero ogni stagione di una serie, da TMDB: la videoteca
// elenca solo i file che ci sono su Drive, e un episodio mancante (download
// saltato, file scartato da prepara-ciak) non si vedeva. Con i conti di TMDB
// i buchi si mostrano in grigio, al loro posto.

export interface StagioneTmdb {
  stagione: number
  episodi: number
}

// Una serie in corso aggiunge episodi: la cache dura una settimana.
const CHIAVE = 'ciak:stagioni-tmdb:v1'
const DURATA_CACHE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SERIE = 500

type Store = Record<string, { s: StagioneTmdb[]; t: number }>

function leggiStore(): Store {
  try {
    const raw = localStorage.getItem(CHIAVE)
    const parsed = raw ? (JSON.parse(raw) as Store) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {} // storage negato o illeggibile: si chiede a TMDB
  }
}

function scriviStore(store: Store): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(store))
  } catch {
    /* quota piena o storage negato: la cache è un di più */
  }
}

export function leggiStagioniInCache(tvId: number, ora = Date.now()): StagioneTmdb[] | null {
  const voce = leggiStore()[String(tvId)]
  if (!voce || ora - voce.t > DURATA_CACHE_MS) return null
  return voce.s
}

export function salvaStagioniInCache(tvId: number, stagioni: StagioneTmdb[], ora = Date.now()): void {
  let store = leggiStore()
  if (Object.keys(store).length >= MAX_SERIE) store = {}
  store[String(tvId)] = { s: stagioni, t: ora }
  scriviStore(store)
}

// Le stagioni numerate (la 0 sono gli speciali, che su TMDB non hanno un
// conto affidabile), dalla cache o da TMDB.
export async function stagioniSerie(tvId: number): Promise<StagioneTmdb[]> {
  const inCache = leggiStagioniInCache(tvId)
  if (inCache) return inCache
  const dettaglio = await getDetail('tv', tvId)
  const stagioni = dettaglio.seasons
    .filter((s) => s.seasonNumber > 0 && s.episodeCount > 0)
    .map((s) => ({ stagione: s.seasonNumber, episodi: s.episodeCount }))
  salvaStagioniInCache(tvId, stagioni)
  return stagioni
}

export interface BucoStagione {
  stagione: number
  totale: number
  suDrive: number
  mancanti: number[] // i numeri degli episodi che su Drive non ci sono
}

// Per ogni stagione che TMDB conosce, quali episodi mancano su Drive. Le
// stagioni di cui non c'è nessun file compaiono lo stesso, con tutti gli
// episodi mancanti: è così che si vede che una stagione intera non c'è.
export function episodiMancanti(
  episodi: Pick<EpisodioVideoteca, 'stagione' | 'episodio'>[],
  stagioni: StagioneTmdb[],
): BucoStagione[] {
  return stagioni
    .filter((s) => s.episodi > 0)
    .map((s) => {
      const presenti = new Set(episodi.filter((e) => e.stagione === s.stagione && e.episodio !== null).map((e) => e.episodio as number))
      const mancanti: number[] = []
      for (let n = 1; n <= s.episodi; n++) if (!presenti.has(n)) mancanti.push(n)
      return { stagione: s.stagione, totale: s.episodi, suDrive: presenti.size, mancanti }
    })
    .sort((a, b) => a.stagione - b.stagione)
}

export function totaleMancanti(buchi: BucoStagione[]): number {
  return buchi.reduce((n, b) => n + b.mancanti.length, 0)
}

// «manca l'ep. 5», «mancano gli ep. 5 e 9», «mancano 12 episodi».
export function descriviMancanti(mancanti: number[]): string {
  if (mancanti.length === 0) return ''
  if (mancanti.length === 1) return `manca l'ep. ${mancanti[0]}`
  if (mancanti.length <= 3) return `mancano gli ep. ${mancanti.slice(0, -1).join(', ')} e ${mancanti[mancanti.length - 1]}`
  return `mancano ${mancanti.length} episodi`
}
