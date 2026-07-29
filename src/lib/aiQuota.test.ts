import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setAiCreditsLeft, aiUsesLeft, AI_DAILY_LIMIT } from './aiQuota'

// L'ambiente di test è node (niente DOM): simuliamo localStorage in memoria
// con la stessa interfaccia usata dal modulo (getItem/setItem/removeItem/key).
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

describe('aiQuota', () => {
  it('parte dal limite pieno finché il server non riporta un valore', () => {
    expect(aiUsesLeft()).toBe(AI_DAILY_LIMIT)
  })

  it('riflette il valore riportato dal server', () => {
    setAiCreditsLeft(2)
    expect(aiUsesLeft()).toBe(2)
  })

  it('non scende mai sotto zero', () => {
    setAiCreditsLeft(-5)
    expect(aiUsesLeft()).toBe(0)
  })

  it('ripulisce i contatori dei giorni precedenti senza toccare altre chiavi', () => {
    localStorage.setItem('cv_ai_left_2020-01-01', '1')
    localStorage.setItem('altra_chiave', 'resta')
    setAiCreditsLeft(1)
    expect(localStorage.getItem('cv_ai_left_2020-01-01')).toBeNull()
    expect(localStorage.getItem('altra_chiave')).toBe('resta')
    expect(aiUsesLeft()).toBe(1)
  })
})
