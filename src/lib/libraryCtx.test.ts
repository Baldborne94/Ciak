import { describe, it, expect } from 'vitest'
import { cercaInIndice, libKey } from './libraryCtx'

// L'indice dei badge: le card chiedono col tipo di TMDB, l'archivio salva col
// tipo di Ciak.

describe('cercaInIndice', () => {
  const indice = new Map([
    [libKey('anime', 30983), 'anime visto'],
    [libKey('cartoon', 246), 'cartone visto'],
    [libKey('movie', 550), 'film visto'],
  ])

  it('una card «tv» trova l anime e il cartone salvati col loro tipo', () => {
    expect(cercaInIndice(indice, 'tv', 30983)).toBe('anime visto')
    expect(cercaInIndice(indice, 'tv', 246)).toBe('cartone visto')
  })

  it('un film non diventa una serie: gli id sono unici solo dentro un tipo', () => {
    expect(cercaInIndice(indice, 'movie', 30983)).toBeUndefined()
    expect(cercaInIndice(indice, 'tv', 550)).toBeUndefined()
    expect(cercaInIndice(indice, 'movie', 550)).toBe('film visto')
  })
})
