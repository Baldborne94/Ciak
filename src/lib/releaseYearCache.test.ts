import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cacheYears, getCachedYears } from './releaseYearCache'

// Stesso finto localStorage usato dagli altri test di cache (sagaCache):
// i test unitari girano in ambiente node, dove non esiste.
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

const ORA = new Date('2026-06-12T12:00:00Z').getTime()
const GIORNO = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage())
})

describe('releaseYearCache', () => {
  it('restituisce ciò che è stato salvato', () => {
    cacheYears(new Map([['movie-550', '1999']]), ORA)
    expect(getCachedYears(['movie-550'], ORA).get('movie-550')).toBe('1999')
  })

  it('non riporta le chiavi mai viste, così vengono chieste a TMDB', () => {
    cacheYears(new Map([['movie-550', '1999']]), ORA)
    const out = getCachedYears(['movie-550', 'tv-1399'], ORA)
    expect(out.has('tv-1399')).toBe(false)
    expect(out.size).toBe(1)
  })

  it('tiene per sempre l anno di un film già uscito', () => {
    // Non cambierà mai più: richiederlo ogni volta è puro spreco.
    cacheYears(new Map([['movie-550', '1999']]), ORA)
    const fraDieciAnni = ORA + 3650 * GIORNO
    expect(getCachedYears(['movie-550'], fraDieciAnni).get('movie-550')).toBe('1999')
  })

  it('riscade dopo un giorno un anno di uscita futuro', () => {
    // Le date non ancora arrivate slittano: vanno ricontrollate.
    cacheYears(new Map([['movie-999', '2027']]), ORA)
    expect(getCachedYears(['movie-999'], ORA + GIORNO / 2).size).toBe(1)
    expect(getCachedYears(['movie-999'], ORA + 2 * GIORNO).size).toBe(0)
  })

  it('riscade dopo un giorno anche un anno sconosciuto', () => {
    cacheYears(new Map([['movie-123', null]]), ORA)
    expect(getCachedYears(['movie-123'], ORA).get('movie-123')).toBeNull()
    expect(getCachedYears(['movie-123'], ORA + 2 * GIORNO).size).toBe(0)
  })

  it('non esplode se localStorage contiene spazzatura', () => {
    localStorage.setItem('ciak:release-years:v1', 'non è JSON')
    expect(() => getCachedYears(['movie-550'], ORA)).not.toThrow()
    expect(getCachedYears(['movie-550'], ORA).size).toBe(0)
  })

  it('salvare una mappa vuota non tocca nulla', () => {
    cacheYears(new Map([['movie-550', '1999']]), ORA)
    cacheYears(new Map(), ORA)
    expect(getCachedYears(['movie-550'], ORA).get('movie-550')).toBe('1999')
  })
})
