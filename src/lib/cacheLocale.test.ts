import { describe, it, expect, beforeEach, vi } from 'vitest'
import { creaCacheLocale } from './cacheLocale'

function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

const ORA = new Date('2026-10-01T12:00:00Z').getTime()

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage())
})

describe('creaCacheLocale', () => {
  const generi = () =>
    creaCacheLocale<number[]>('prova', { durataMs: 1000, valido: (v): v is number[] => Array.isArray(v), max: 3 })

  it('salva, rilegge e scade', () => {
    generi().scrivi(new Map([['movie-1', [16]]]), ORA)
    expect(generi().leggi(['movie-1'], ORA + 1000).get('movie-1')).toEqual([16])
    expect(generi().leggi(['movie-1'], ORA + 1001).has('movie-1')).toBe(false)
  })

  it('scarta le voci di forma sbagliata invece di passarle avanti', () => {
    localStorage.setItem('prova', JSON.stringify({ 'movie-1': ['non un array', ORA], 'movie-2': 'rotta' }))
    expect(generi().leggi(['movie-1', 'movie-2'], ORA).size).toBe(0)
  })

  it('oltre il tetto ricomincia da capo invece di crescere senza fine', () => {
    generi().scrivi(new Map([['a', [1]], ['b', [2]]]), ORA)
    generi().scrivi(new Map([['c', [3]], ['d', [4]]]), ORA)
    const letti = generi().leggi(['a', 'b', 'c', 'd'], ORA)
    expect([...letti.keys()]).toEqual(['c', 'd'])
  })
})
