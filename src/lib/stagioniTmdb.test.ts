import { beforeEach, describe, expect, it } from 'vitest'
import { descriviMancanti, episodiMancanti, leggiStagioniInCache, salvaStagioniInCache, totaleMancanti } from './stagioniTmdb'

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

const ep = (stagione: number, episodio: number | null) => ({ stagione, episodio })

describe('episodiMancanti', () => {
  it('trova i buchi dentro una stagione', () => {
    const buchi = episodiMancanti([ep(1, 1), ep(1, 2), ep(1, 4)], [{ stagione: 1, episodi: 5 }])
    expect(buchi).toEqual([{ stagione: 1, totale: 5, suDrive: 3, mancanti: [3, 5] }])
  })

  it('una stagione senza nessun file manca tutta', () => {
    const buchi = episodiMancanti([ep(1, 1)], [
      { stagione: 1, episodi: 1 },
      { stagione: 2, episodi: 3 },
    ])
    expect(buchi[1]).toEqual({ stagione: 2, totale: 3, suDrive: 0, mancanti: [1, 2, 3] })
    expect(totaleMancanti(buchi)).toBe(3)
  })

  it('niente manca quando ci sono tutti, e gli speciali senza numero non contano', () => {
    const buchi = episodiMancanti([ep(1, 1), ep(1, 2), ep(0, null)], [{ stagione: 1, episodi: 2 }])
    expect(buchi).toEqual([{ stagione: 1, totale: 2, suDrive: 2, mancanti: [] }])
    expect(totaleMancanti(buchi)).toBe(0)
  })

  it('le stagioni escono in ordine, e una con zero episodi su TMDB si ignora', () => {
    const buchi = episodiMancanti([], [
      { stagione: 3, episodi: 1 },
      { stagione: 2, episodi: 0 },
      { stagione: 1, episodi: 1 },
    ])
    expect(buchi.map((b) => b.stagione)).toEqual([1, 3])
  })
})

describe('descriviMancanti', () => {
  it('parla come una persona', () => {
    expect(descriviMancanti([])).toBe('')
    expect(descriviMancanti([5])).toBe("manca l'ep. 5")
    expect(descriviMancanti([5, 9])).toBe('mancano gli ep. 5 e 9')
    expect(descriviMancanti([2, 5, 9])).toBe('mancano gli ep. 2, 5 e 9')
    expect(descriviMancanti([1, 2, 3, 4])).toBe('mancano 4 episodi')
  })
})

describe('la cache delle stagioni', () => {
  it('ricorda per una settimana, poi chiede di nuovo', () => {
    const ora = 1_000_000_000_000
    expect(leggiStagioniInCache(1429, ora)).toBeNull()
    salvaStagioniInCache(1429, [{ stagione: 1, episodi: 25 }], ora)
    expect(leggiStagioniInCache(1429, ora + 6 * 24 * 3600 * 1000)).toEqual([{ stagione: 1, episodi: 25 }])
    expect(leggiStagioniInCache(1429, ora + 8 * 24 * 3600 * 1000)).toBeNull()
  })

  it('una cache illeggibile vale come vuota', () => {
    localStorage.setItem('ciak:stagioni-tmdb:v1', 'rotto{')
    expect(leggiStagioniInCache(1)).toBeNull()
  })
})
