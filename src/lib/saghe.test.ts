import { describe, it, expect } from 'vitest'
import { nomeSaga, raggruppaSaghe } from './saghe'
import type { Collection } from './types'

const ALIEN: Collection = { id: 8091, name: 'Alien', posterPath: '/alien.jpg' }
const POTTER: Collection = { id: 1241, name: 'Harry Potter', posterPath: '/hp.jpg' }

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
  const saghe = new Map<string, Collection | null>([
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
