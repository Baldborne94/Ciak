import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cacheSearchTitles, getCachedSearchTitles } from './searchTitleCache'

// I test unitari girano in node, dove localStorage non esiste.
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

const ORA = new Date('2026-09-30T12:00:00Z').getTime()
const GIORNO = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage())
})

describe('searchTitleCache', () => {
  it('restituisce ciò che è stato salvato', () => {
    cacheSearchTitles(new Map([['movie-110420', ['Song of the Sea']]]), ORA)
    expect(getCachedSearchTitles(['movie-110420'], ORA).get('movie-110420')).toEqual(['Song of the Sea'])
  })

  it('tiene separati film e serie con lo stesso id', () => {
    cacheSearchTitles(new Map([['movie-7', ['Un film']], ['tv-7', ['Una serie']]]), ORA)
    const letti = getCachedSearchTitles(['movie-7', 'tv-7'], ORA)
    expect(letti.get('movie-7')).toEqual(['Un film'])
    expect(letti.get('tv-7')).toEqual(['Una serie'])
  })

  it('dopo un mese la voce si richiede', () => {
    cacheSearchTitles(new Map([['movie-1', ['Vecchio']]]), ORA)
    expect(getCachedSearchTitles(['movie-1'], ORA + 29 * GIORNO).has('movie-1')).toBe(true)
    expect(getCachedSearchTitles(['movie-1'], ORA + 31 * GIORNO).has('movie-1')).toBe(false)
  })

  it('non si rompe con dati corrotti o senza storage', () => {
    localStorage.setItem('ciak:titoli-ricerca:v2', '{non json')
    expect(getCachedSearchTitles(['movie-1'], ORA).size).toBe(0)
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('negato')
      },
      setItem: () => {
        throw new Error('negato')
      },
    })
    expect(() => cacheSearchTitles(new Map([['movie-1', ['X']]]), ORA)).not.toThrow()
    expect(getCachedSearchTitles(['movie-1'], ORA).size).toBe(0)
  })
})
