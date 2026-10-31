import { describe, expect, it } from 'vitest'
import { NESSUN_FILTRO, filtriAttivi, opzioniLista, passaFiltri, type DatiTitolo } from './filtriLista'

// I filtri delle liste personali: genere, anno, lingua e voto, come nella ricerca.

const riga = (tmdb_id: number, genre_ids: number[], media_type: 'movie' | 'tv' = 'movie') => ({ tmdb_id, genre_ids, media_type })
const dati = (anno: string | null, lingua: string | null, voto: number | null): DatiTitolo => ({ anno, lingua, voto })

describe('passaFiltri', () => {
  const horror = riga(1, [27, 53])
  const suoi = dati('2023', 'ko', 7.2)

  it('senza filtri passa tutto, anche senza i dati di TMDB', () => {
    expect(passaFiltri(horror, undefined, NESSUN_FILTRO)).toBe(true)
    expect(filtriAttivi(NESSUN_FILTRO)).toBe(false)
  })

  it('genere, anno, lingua e voto minimo', () => {
    expect(passaFiltri(horror, suoi, { ...NESSUN_FILTRO, genere: 27 })).toBe(true)
    expect(passaFiltri(horror, suoi, { ...NESSUN_FILTRO, genere: 35 })).toBe(false)
    expect(passaFiltri(horror, suoi, { ...NESSUN_FILTRO, anno: '2023' })).toBe(true)
    expect(passaFiltri(horror, suoi, { ...NESSUN_FILTRO, anno: '2022' })).toBe(false)
    expect(passaFiltri(horror, suoi, { ...NESSUN_FILTRO, lingua: 'ko' })).toBe(true)
    expect(passaFiltri(horror, suoi, { ...NESSUN_FILTRO, lingua: 'ja' })).toBe(false)
    expect(passaFiltri(horror, suoi, { ...NESSUN_FILTRO, votoMinimo: 7 })).toBe(true)
    expect(passaFiltri(horror, suoi, { ...NESSUN_FILTRO, votoMinimo: 8 })).toBe(false)
  })

  it('si combinano: tutti devono valere', () => {
    expect(passaFiltri(horror, suoi, { genere: 27, anno: '2023', lingua: 'ko', votoMinimo: 7 })).toBe(true)
    expect(passaFiltri(horror, suoi, { genere: 27, anno: '2023', lingua: 'en', votoMinimo: 7 })).toBe(false)
  })

  it('con un filtro sull’anno, un titolo di cui l’anno non si sa non passa', () => {
    expect(passaFiltri(horror, undefined, { ...NESSUN_FILTRO, anno: '2023' })).toBe(false)
    expect(filtriAttivi({ ...NESSUN_FILTRO, anno: '2023' })).toBe(true)
  })
})

describe('opzioniLista', () => {
  it('solo ciò che c’è nella lista: generi e lingue per frequenza, anni dal più recente', () => {
    const righe = [riga(1, [27, 53]), riga(2, [27]), riga(3, [35], 'tv')]
    const d = new Map([
      ['movie-1', dati('2023', 'ko', 7)],
      ['movie-2', dati('1987', 'en', 6)],
      ['tv-3', dati('2023', 'en', 8)],
    ])
    expect(opzioniLista(righe, d)).toEqual({
      generi: [
        { id: 27, quanti: 2 },
        { id: 53, quanti: 1 },
        { id: 35, quanti: 1 },
      ],
      anni: ['2023', '1987'],
      lingue: [
        { codice: 'en', quanti: 2 },
        { codice: 'ko', quanti: 1 },
      ],
    })
  })
})
