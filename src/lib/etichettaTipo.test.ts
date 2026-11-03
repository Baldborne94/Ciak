import { describe, it, expect } from 'vitest'
import { etichettaTipo } from './etichettaTipo'

describe('etichettaTipo', () => {
  it('una serie animata giapponese è un anime, le altre animate sono cartoni', () => {
    expect(etichettaTipo({ mediaType: 'tv', genreIds: [16, 10759], originalLanguage: 'ja' })).toBe('Anime')
    expect(etichettaTipo({ mediaType: 'tv', genreIds: [16, 35], originalLanguage: 'en' })).toBe('Cartone')
  })

  it('serie e film dal vero restano tali, e un film animato lo dice', () => {
    expect(etichettaTipo({ mediaType: 'tv', genreIds: [80], originalLanguage: 'en' })).toBe('Serie TV')
    expect(etichettaTipo({ mediaType: 'movie', genreIds: [18], originalLanguage: 'it' })).toBe('Film')
    expect(etichettaTipo({ mediaType: 'movie', genreIds: [16], originalLanguage: 'ja' })).toBe('Film d’animazione')
  })

  it('senza generi non indovina', () => {
    expect(etichettaTipo({ mediaType: 'tv', genreIds: [], originalLanguage: 'ja' })).toBe('Serie TV')
  })
})
