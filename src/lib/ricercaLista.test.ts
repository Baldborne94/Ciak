import { describe, it, expect } from 'vitest'
import { corrispondeRicerca, normalizzaRicerca } from './ricercaLista'

describe('ricerca nella lista', () => {
  it('trova il titolo italiano, anche solo con l inizio', () => {
    expect(corrispondeRicerca('la can', ['La canzone del mare'])).toBe(true)
  })

  it('trova il titolo originale quando lo si scrive in lingua originale', () => {
    // Il caso da cui è nata: «Song of the Sea» non trovava «La canzone del mare».
    expect(corrispondeRicerca('song of the', ['La canzone del mare', 'Song of the Sea'])).toBe(true)
    expect(corrispondeRicerca('song of the', ['La canzone del mare'])).toBe(false)
  })

  it('ignora maiuscole, accenti e punteggiatura', () => {
    expect(corrispondeRicerca('shogun', ['Shōgun'])).toBe(true)
    expect(corrispondeRicerca('mr pickles', ['Mr. Pickles'])).toBe(true)
    expect(corrispondeRicerca('SAKAMOTO', ['Sakamoto Days'])).toBe(true)
  })

  it('un campo vuoto trova tutto', () => {
    expect(corrispondeRicerca('   ', ['Qualunque'])).toBe(true)
  })

  it('non riduce a nulla un alfabeto non latino', () => {
    // Altrimenti «千と» diventerebbe una ricerca vuota, che trova tutto.
    expect(normalizzaRicerca('千と千尋の神隠し')).toBe('千と千尋の神隠し')
    expect(corrispondeRicerca('千と', ['La città incantata', '千と千尋の神隠し'])).toBe(true)
    expect(corrispondeRicerca('千と', ['Sakamoto Days'])).toBe(false)
  })

  it('salta i titoli mancanti', () => {
    expect(corrispondeRicerca('sea', [null, undefined, 'Song of the Sea'])).toBe(true)
  })
})
