import { describe, it, expect } from 'vitest'
import { corrispondeRicerca, normalizzaRicerca, titoloTrovato } from './ricercaLista'

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

  it('cerca dall inizio delle parole, non a metà', () => {
    // «long» trovava «Insieme agli Dei», il cui originale è «Along with the Gods».
    expect(corrispondeRicerca('long', ['Insieme agli Dei: I Due Mondi', 'Along with the Gods: The Two Worlds'])).toBe(false)
    expect(corrispondeRicerca('long', ['Longlegs'])).toBe(true)
    expect(corrispondeRicerca('zone', ['La canzone del mare'])).toBe(false)
    expect(corrispondeRicerca('del ma', ['La canzone del mare'])).toBe(true)
  })

  it('negli alfabeti senza spazi si cerca ovunque, perché lì le parole non si separano', () => {
    expect(corrispondeRicerca('千尋', ['千と千尋の神隠し'])).toBe(true)
  })
})

describe('titoloTrovato', () => {
  it('dice quale titolo ha risposto, per mostrarlo quando non è quello a schermo', () => {
    const titoli = ['South Park: Il film - Più grosso, più lungo & tutto intero', 'South Park: Bigger, Longer & Uncut']
    expect(titoloTrovato('long', titoli)).toBe('South Park: Bigger, Longer & Uncut')
    expect(titoloTrovato('più grosso', titoli)).toBe(titoli[0])
    expect(titoloTrovato('xyz', titoli)).toBeNull()
    expect(titoloTrovato('', titoli)).toBeNull()
  })
})
