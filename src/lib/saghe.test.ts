import { describe, it, expect } from 'vitest'
import { daCollezione, nomeSaga, raggruppaSaghe, unisciSaghe, type SagaVideoteca } from './saghe'
import type { Collection } from './types'
import type { Raccolta } from './raccolte'

const ALIEN_TMDB: Collection = { id: 8091, name: 'Alien', posterPath: '/alien.jpg' }
const ALIEN = daCollezione(ALIEN_TMDB)
const POTTER = daCollezione({ id: 1241, name: 'Harry Potter', posterPath: '/hp.jpg' })

describe('nomeSaga', () => {
  it('toglie «Collection» dal nome inglese di TMDB', () => {
    expect(nomeSaga('Alien Collection')).toBe('Alien')
    expect(nomeSaga('The Lord of the Rings Collection')).toBe('The Lord of the Rings')
  })

  it('lascia stare un nome senza suffisso', () => {
    expect(nomeSaga('Wallace & Gromit')).toBe('Wallace & Gromit')
  })
})

describe('raggruppaSaghe', () => {
  const saghe = new Map<string, SagaVideoteca | null>([
    ['movie-348', ALIEN],
    ['movie-679', ALIEN],
    ['movie-8077', ALIEN],
    ['movie-671', POTTER],
    ['movie-490', null],
  ])

  it('raccoglie in una cartella i film della stessa saga, in ordine di uscita', () => {
    const { saghe: gruppi, sciolti } = raggruppaSaghe(
      [
        { id: 'f-alien3', chiave: 'movie-8077', anno: '1992' },
        { id: 'f-alien', chiave: 'movie-348', anno: '1979' },
        { id: 'f-sigillo', chiave: 'movie-490', anno: '1957' },
        { id: 'f-aliens', chiave: 'movie-679', anno: '1986' },
      ],
      saghe,
    )
    expect(gruppi).toEqual([{ chiave: 'saga-8091', saga: ALIEN, ids: ['f-alien', 'f-aliens', 'f-alien3'] }])
    expect(sciolti).toEqual(['f-sigillo'])
  })

  it('un film solo della sua saga resta una riga: una cartella con un film non serve', () => {
    const { saghe: gruppi, sciolti } = raggruppaSaghe(
      [
        { id: 'f-hp1', chiave: 'movie-671', anno: '2001' },
        { id: 'f-alien', chiave: 'movie-348', anno: '1979' },
      ],
      saghe,
    )
    expect(gruppi).toEqual([])
    expect(sciolti).toEqual(['f-hp1', 'f-alien'])
  })

  it('due file dello stesso film (due versioni) bastano a fare la cartella', () => {
    const { saghe: gruppi } = raggruppaSaghe(
      [
        { id: 'f-alien-dc', chiave: 'movie-348', anno: '1979' },
        { id: 'f-alien-tc', chiave: 'movie-348', anno: '1979' },
      ],
      saghe,
    )
    expect(gruppi.map((g) => g.ids)).toEqual([['f-alien-dc', 'f-alien-tc']])
  })

  it('i film non riconosciuti o di cui la saga non si sa ancora restano righe', () => {
    const { saghe: gruppi, sciolti } = raggruppaSaghe(
      [
        { id: 'f-ignoto', chiave: null, anno: null },
        { id: 'f-nuovo', chiave: 'movie-999', anno: '2020' },
      ],
      saghe,
    )
    expect(gruppi).toEqual([])
    expect(sciolti).toEqual(['f-ignoto', 'f-nuovo'])
  })
})

describe('unisciSaghe: le saghe fatte a mano', () => {
  const manuale = (over: Partial<Raccolta> = {}): Raccolta => ({
    id: 'l-pixar',
    nome: 'Pixar anni 90',
    chiavi: new Set(['movie-862', 'movie-9487']),
    voci: new Map(),
    copertina: null,
    comeSaga: true,
    ...over,
  })

  it('una lista segnata come saga raccoglie i suoi film, anche senza saga su TMDB', () => {
    const saghe = unisciSaghe(new Map([['movie-862', null], ['movie-9487', null]]), [manuale()])
    const { saghe: gruppi, sciolti } = raggruppaSaghe(
      [
        { id: 'f-toy', chiave: 'movie-862', anno: '1995' },
        { id: 'f-bug', chiave: 'movie-9487', anno: '1998' },
        { id: 'f-altro', chiave: 'movie-1', anno: '2000' },
      ],
      saghe,
    )
    expect(gruppi.map((g) => [g.chiave, g.saga.name, g.saga.listaId, g.ids])).toEqual([
      ['lista-l-pixar', 'Pixar anni 90', 'l-pixar', ['f-toy', 'f-bug']],
    ])
    expect(sciolti).toEqual(['f-altro'])
  })

  it('una saga di TMDB modificata a mano la sostituisce: i film tolti restano sciolti', () => {
    // Transformers modificata togliendo Bumblebee: niente seconda cartella
    // «Transformers» rifatta da TMDB col solo Bumblebee.
    const tf = { id: 8650, name: 'Transformers', posterPath: '/tf.jpg' }
    const saghe = unisciSaghe(
      new Map([['movie-1858', tf], ['movie-8373', tf], ['movie-424783', tf]]),
      [manuale({ id: 'l-tf', nome: 'Transformers', chiavi: new Set(['movie-1858', 'movie-8373']), sagaTmdb: 8650 })],
    )
    const { saghe: gruppi, sciolti } = raggruppaSaghe(
      [
        { id: 'f-1', chiave: 'movie-1858', anno: '2007' },
        { id: 'f-2', chiave: 'movie-8373', anno: '2009' },
        { id: 'f-bb', chiave: 'movie-424783', anno: '2018' },
      ],
      saghe,
    )
    expect(gruppi.map((g) => [g.chiave, g.ids])).toEqual([['lista-l-tf', ['f-1', 'f-2']]])
    expect(sciolti).toEqual(['f-bb'])
  })

  it('anche con un film solo: l’hai voluta tu', () => {
    const saghe = unisciSaghe(new Map(), [manuale({ chiavi: new Set(['movie-862']) })])
    const { saghe: gruppi } = raggruppaSaghe([{ id: 'f-toy', chiave: 'movie-862', anno: '1995' }], saghe)
    expect(gruppi.map((g) => g.ids)).toEqual([['f-toy']])
  })

  it('vince sulla saga di TMDB: il film va dove l’hai messo', () => {
    const saghe = unisciSaghe(new Map([['movie-348', ALIEN_TMDB]]), [manuale({ chiavi: new Set(['movie-348']) })])
    expect(saghe.get('movie-348')?.chiave).toBe('lista-l-pixar')
  })

  it('le liste che non sono saghe non toccano niente', () => {
    const saghe = unisciSaghe(new Map([['movie-348', ALIEN_TMDB]]), [manuale({ comeSaga: false, chiavi: new Set(['movie-348']) })])
    expect(saghe.get('movie-348')).toEqual(ALIEN)
  })
})
