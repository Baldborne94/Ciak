import { describe, it, expect } from 'vitest'
import { daChiedere, DURATA_SAGA_DEL_FILM, filtraSaghe, ordinaSaghe, riepilogoSaga, type RiepilogoSaga } from './sagheDaCompletare'
import type { CollectionDetail, MediaItem } from './types'

const OGGI = '2026-11-08'
function film(id: number, releaseDate: string | null): MediaItem {
  return { id, mediaType: 'movie', title: `F${id}`, originalTitle: null, overview: '', posterPath: null, backdropPath: null, releaseDate, voteAverage: 7, genreIds: [], originalLanguage: 'en' }
}
function saga(id: number, nome: string, items: MediaItem[]): CollectionDetail {
  return { id, name: nome, overview: null, posterPath: null, backdropPath: null, items }
}

describe('riepilogoSaga', () => {
  it('conta i visti fra i capitoli usciti, e separa quelli che devono uscire', () => {
    // Come la ordina TMDB: i capitoli senza data finiscono in cima.
    const r = riepilogoSaga(saga(1, 'Dune', [film(4, null), film(1, '2021-09-15'), film(2, '2024-02-28'), film(3, '2026-12-18')]), new Set([1]), OGGI)
    expect(r).toMatchObject({ visti: 1, usciti: 2 })
    expect(r.mancanti.map((f) => f.id)).toEqual([2])
    // Prima quelli con la data, poi gli annunciati senza.
    expect(r.inArrivo.map((f) => f.id)).toEqual([3, 4])
  })
})

describe('ordinaSaghe e filtraSaghe', () => {
  const r = (nome: string, visti: number, usciti: number, inArrivo = 0): RiepilogoSaga => ({
    id: nome.length,
    nome,
    posterPath: null,
    visti,
    usciti,
    mancanti: Array.from({ length: usciti - visti }, (_, i) => film(i, '2000-01-01')),
    inArrivo: Array.from({ length: inArrivo }, (_, i) => film(100 + i, null)),
  })

  it('prima le quasi finite, le complete in fondo', () => {
    const ordine = ordinaSaghe([r('Completa', 3, 3), r('A metà', 2, 4), r('Quasi', 4, 5)]).map((s) => s.nome)
    expect(ordine).toEqual(['Quasi', 'A metà', 'Completa'])
  })

  it('«Da completare» toglie le complete, «In arrivo» tiene solo chi ha capitoli annunciati', () => {
    const tutte = [r('Completa', 3, 3, 1), r('A metà', 2, 4)]
    expect(filtraSaghe(tutte, 'da-completare').map((s) => s.nome)).toEqual(['A metà'])
    expect(filtraSaghe(tutte, 'in-arrivo').map((s) => s.nome)).toEqual(['Completa'])
    expect(filtraSaghe(tutte, 'tutte')).toHaveLength(2)
  })
})

describe('daChiedere', () => {
  it('chiede a TMDB solo i film mai visti o ricordati da più di un mese', () => {
    const adesso = 10 * DURATA_SAGA_DEL_FILM
    const cache = { 1: { saga: 10, quando: adesso - 1000 }, 2: { saga: null, quando: adesso - 1000 }, 3: { saga: 5, quando: 0 } }
    expect(daChiedere([1, 2, 3, 4], cache, adesso)).toEqual([3, 4])
  })
})
