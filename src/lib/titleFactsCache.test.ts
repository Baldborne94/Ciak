import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cacheFacts, factsKey, getCachedFacts } from './titleFactsCache'
import type { TitleFacts } from './types'

function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
    clear: () => store.clear(),
  }
}

const facts = (over: Partial<TitleFacts> = {}): TitleFacts => ({
  genres: ['Thriller'],
  directors: ['Peter Jackson'],
  cast: ['Viggo Mortensen'],
  runtime: 178,
  year: 2001,
  episodes: null,
  ...over,
})

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage())
})

describe('titleFactsCache', () => {
  it('restituisce ciò che è stato salvato', () => {
    cacheFacts(new Map([[factsKey('movie', 120), facts()]]))
    const out = getCachedFacts([factsKey('movie', 120)])
    expect(out.get('movie-120')?.directors).toEqual(['Peter Jackson'])
  })

  it('non riporta i titoli mai visti, così vengono chiesti a TMDB', () => {
    cacheFacts(new Map([[factsKey('movie', 120), facts()]]))
    const out = getCachedFacts([factsKey('movie', 120), factsKey('movie', 121)])
    expect(out.size).toBe(1)
    expect(out.has('movie-121')).toBe(false)
  })

  it('tiene distinti un film e una serie con lo stesso id TMDB', () => {
    cacheFacts(
      new Map([
        [factsKey('movie', 550), facts({ genres: ['Dramma'] })],
        [factsKey('tv', 550), facts({ genres: ['Commedia'] })],
      ]),
    )
    const out = getCachedFacts([factsKey('movie', 550), factsKey('tv', 550)])
    expect(out.get('movie-550')?.genres).toEqual(['Dramma'])
    expect(out.get('tv-550')?.genres).toEqual(['Commedia'])
  })

  it('scarta le voci con una forma inattesa invece di usarle', () => {
    // Una cache scritta da una versione precedente non deve produrre
    // statistiche sbagliate in silenzio: meglio richiedere il dato.
    localStorage.setItem('ciak:title-facts:v1', JSON.stringify({ 'movie-1': { boh: true } }))
    expect(getCachedFacts(['movie-1']).size).toBe(0)
  })

  it('non esplode se localStorage contiene spazzatura', () => {
    localStorage.setItem('ciak:title-facts:v1', 'non è JSON')
    expect(() => getCachedFacts(['movie-1'])).not.toThrow()
    expect(getCachedFacts(['movie-1']).size).toBe(0)
  })

  it('salvare una mappa vuota non tocca nulla', () => {
    cacheFacts(new Map([[factsKey('movie', 120), facts()]]))
    cacheFacts(new Map())
    expect(getCachedFacts([factsKey('movie', 120)]).size).toBe(1)
  })
})
