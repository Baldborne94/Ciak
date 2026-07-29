import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCachedSagaOrder, saveCachedSagaOrder } from './sagaCache'

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

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage())
})

describe('sagaCache', () => {
  it('torna null per saghe mai messe in cache', () => {
    expect(getCachedSagaOrder(1241)).toBeNull()
  })

  it('salva e recupera l’ordine per collezione', () => {
    saveCachedSagaOrder(1241, { ids: [671, 672, 673], notes: { 671: 'Primo capitolo' } })
    expect(getCachedSagaOrder(1241)).toEqual({
      ids: [671, 672, 673],
      notes: { 671: 'Primo capitolo' },
    })
    // Collezione diversa: cache separata.
    expect(getCachedSagaOrder(10)).toBeNull()
  })

  it('scarta contenuti corrotti invece di propagarli', () => {
    localStorage.setItem('ciak:saga-order:v1:99', 'non-è-json{')
    expect(getCachedSagaOrder(99)).toBeNull()
    localStorage.setItem('ciak:saga-order:v1:98', JSON.stringify({ ids: 'non-array' }))
    expect(getCachedSagaOrder(98)).toBeNull()
  })

  it('tollera note mancanti nelle cache vecchie', () => {
    localStorage.setItem('ciak:saga-order:v1:97', JSON.stringify({ ids: [1, 2] }))
    expect(getCachedSagaOrder(97)).toEqual({ ids: [1, 2], notes: {} })
  })
})
