import type { CollectionDetail, MediaItem } from './types'

// «Saghe da completare»: per ogni saga di cui hai visto almeno un film, quanti
// capitoli usciti hai visto, quali ti mancano e quali devono ancora uscire.

export interface RiepilogoSaga {
  id: number
  nome: string
  posterPath: string | null
  visti: number
  // Solo i capitoli già usciti: uno annunciato non è una lacuna.
  usciti: number
  mancanti: MediaItem[]
  // Annunciati, con la data se c'è; senza data per ultimi.
  inArrivo: MediaItem[]
}

export function riepilogoSaga(saga: CollectionDetail, visti: Set<number>, oggi: string): RiepilogoSaga {
  const usciti = saga.items.filter((f) => !!f.releaseDate && f.releaseDate <= oggi)
  const inArrivo = saga.items
    .filter((f) => !f.releaseDate || f.releaseDate > oggi)
    .sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999'))
  return {
    id: saga.id,
    nome: saga.name,
    posterPath: saga.posterPath,
    visti: usciti.filter((f) => visti.has(f.id)).length,
    usciti: usciti.length,
    mancanti: usciti.filter((f) => !visti.has(f.id)),
    inArrivo,
  }
}

export type FiltroSaghe = 'da-completare' | 'in-arrivo' | 'tutte'

// Prima le saghe quasi finite (ti manca un film: è il recupero più facile),
// poi le altre; quelle complete in fondo. A parità, per nome.
export function ordinaSaghe(saghe: RiepilogoSaga[]): RiepilogoSaga[] {
  const quota = (s: RiepilogoSaga) => (s.usciti ? s.visti / s.usciti : 0)
  return [...saghe].sort(
    (a, b) =>
      Number(a.mancanti.length === 0) - Number(b.mancanti.length === 0) ||
      quota(b) - quota(a) ||
      a.mancanti.length - b.mancanti.length ||
      a.nome.localeCompare(b.nome),
  )
}

export function filtraSaghe(saghe: RiepilogoSaga[], filtro: FiltroSaghe): RiepilogoSaga[] {
  if (filtro === 'da-completare') return saghe.filter((s) => s.mancanti.length > 0)
  if (filtro === 'in-arrivo') return saghe.filter((s) => s.inArrivo.length > 0)
  return saghe
}

// La saga di un film cambia di rado (TMDB ne crea una quando esce il secondo
// capitolo): si ricorda per un mese, così la pagina non richiede centinaia di
// film a ogni visita. `null` = il film non ha una saga, ed è un'informazione.
export const DURATA_SAGA_DEL_FILM = 30 * 24 * 3600 * 1000
export type CacheSaghe = Record<string, { saga: number | null; quando: number }>

export function daChiedere(ids: number[], cache: CacheSaghe, adesso: number): number[] {
  return ids.filter((id) => {
    const voce = cache[id]
    return !voce || adesso - voce.quando > DURATA_SAGA_DEL_FILM
  })
}
