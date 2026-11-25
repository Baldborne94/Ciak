import { describe, it, expect } from 'vitest'
import { sottotitoliDaChiedere } from './jellyfin'

// Un sottotitolo dentro un MKV Jellyfin lo estrae leggendo il file intero: per
// Interstellar IMAX (2 h 49, molti GB, una dozzina di tracce) chiederle tutte
// teneva il lettore su «Cerco i sottotitoli…» per mezz'ora.

const s = (indice: number, lingua: string | null, esterno = false, titolo = '') => ({ indice, lingua, titolo, esterno })

describe('sottotitoliDaChiedere', () => {
  it('una traccia per l’italiano e una per l’inglese, non tutte', () => {
    const scelti = sottotitoliDaChiedere([s(2, 'ita'), s(3, 'ita', false, 'Forced'), s(4, 'eng'), s(5, 'eng', false, 'SDH'), s(6, 'fre'), s(7, 'spa'), s(8, 'ger')])
    expect(scelti.map((x) => x.indice)).toEqual([2, 4])
  })

  it('prima il file accanto al video, che si legge subito, poi quello dentro', () => {
    expect(sottotitoliDaChiedere([s(2, 'ita'), s(9, 'ita', true)]).map((x) => x.indice)).toEqual([9])
  })

  it('i sottotitoli forzati (solo le scritte in lingua straniera) non valgono come la traccia intera', () => {
    expect(sottotitoliDaChiedere([s(3, 'ita', false, 'Forced'), s(2, 'ita', false, 'Italiano completo')]).map((x) => x.indice)).toEqual([2])
    // Se c'è solo il forzato, meglio quello che niente.
    expect(sottotitoliDaChiedere([s(3, 'ita', false, 'Forced')]).map((x) => x.indice)).toEqual([3])
  })

  it('senza italiano né inglese, uno solo in un’altra lingua', () => {
    expect(sottotitoliDaChiedere([s(6, 'fre'), s(7, 'spa')]).map((x) => x.indice)).toEqual([6])
  })

  it('niente sottotitoli, niente da chiedere', () => {
    expect(sottotitoliDaChiedere([])).toEqual([])
  })
})
