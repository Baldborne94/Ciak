import { beforeEach, describe, expect, it } from 'vitest'
import { indiceSottotitolo, leggiLinguaSottotitoli, salvaLinguaSottotitoli } from './sceltaSottotitoli'

// Su `node` non c'è localStorage: se ne monta uno in memoria.
beforeEach(() => {
  const dati = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => dati.get(k) ?? null,
    setItem: (k: string, v: string) => void dati.set(k, v),
    removeItem: (k: string) => void dati.delete(k),
    clear: () => dati.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

const IT_EN = [{ lingua: 'it' }, { lingua: 'en' }]

describe('indiceSottotitolo', () => {
  it('senza scelta i sottotitoli sono spenti', () => {
    expect(indiceSottotitolo(IT_EN, null)).toBe(-1)
  })

  it('segue la lingua, non la posizione', () => {
    expect(indiceSottotitolo(IT_EN, 'en')).toBe(1)
    expect(indiceSottotitolo([{ lingua: 'en' }, { lingua: 'it' }], 'en')).toBe(0)
  })

  it('una lingua che manca in questo video vuol dire spenti', () => {
    expect(indiceSottotitolo([{ lingua: 'en' }], 'it')).toBe(-1)
  })

  it('con due tracce nella stessa lingua vince quella toccata', () => {
    const due = [{ lingua: 'it' }, { lingua: 'it' }]
    expect(indiceSottotitolo(due, 'it', 1)).toBe(1)
    expect(indiceSottotitolo(due, 'it')).toBe(0)
  })

  it('una traccia senza lingua si ritrova lo stesso', () => {
    expect(indiceSottotitolo([{ lingua: null }], 'und')).toBe(0)
  })
})

describe('la scelta salvata', () => {
  it('la prima volta non c è: spenti', () => {
    expect(leggiLinguaSottotitoli()).toBeNull()
  })

  it('resta, anche «nessuno»', () => {
    salvaLinguaSottotitoli('en')
    expect(leggiLinguaSottotitoli()).toBe('en')
    salvaLinguaSottotitoli(null)
    expect(leggiLinguaSottotitoli()).toBeNull()
  })
})
