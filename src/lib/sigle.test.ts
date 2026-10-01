import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DURATA_SIGLA_PREDEFINITA,
  dopoLaSigla,
  inSiglaFinale,
  leggiDurataSigla,
  mostraSaltaSigla,
  salvaDurataSigla,
} from './sigle'

describe('saltare la sigla iniziale', () => {
  it('il pulsante c è solo nei primi minuti', () => {
    expect(mostraSaltaSigla(0)).toBe(true)
    expect(mostraSaltaSigla(5 * 60)).toBe(true)
    expect(mostraSaltaSigla(7 * 60)).toBe(false)
  })

  it('salta della durata della sigla, ma mai oltre la fine', () => {
    expect(dopoLaSigla(120, 90, 1450)).toBe(210)
    expect(dopoLaSigla(1400, 90, 1450)).toBe(1449)
    expect(dopoLaSigla(10, 90, null)).toBe(100)
  })
})

describe('la sigla finale', () => {
  it('comincia negli ultimi minuti, gli stessi in cui l episodio conta come visto', () => {
    expect(inSiglaFinale(20 * 60, 1450)).toBe(false)
    expect(inSiglaFinale(1450 - 170, 1450)).toBe(true)
    expect(inSiglaFinale(1000, null)).toBe(false)
  })
})

describe('la durata della sigla, per serie', () => {
  let memoria: Map<string, string>
  beforeEach(() => {
    memoria = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('senza scelta è quella di base, e ogni serie tiene la sua', () => {
    expect(leggiDurataSigla('tv-1429')).toBe(DURATA_SIGLA_PREDEFINITA)
    salvaDurataSigla('tv-2190', 30)
    expect(leggiDurataSigla('tv-2190')).toBe(30)
    expect(leggiDurataSigla('tv-1429')).toBe(DURATA_SIGLA_PREDEFINITA)
  })

  it('un valore strano salvato non diventa un salto strano', () => {
    memoria.set('ciak:durata-sigla:tv-1', 'abc')
    expect(leggiDurataSigla('tv-1')).toBe(DURATA_SIGLA_PREDEFINITA)
    memoria.set('ciak:durata-sigla:tv-1', '9999')
    expect(leggiDurataSigla('tv-1')).toBe(DURATA_SIGLA_PREDEFINITA)
  })

  it('senza storage si usa quella di base', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('negato')
      },
    })
    expect(leggiDurataSigla('tv-1429')).toBe(DURATA_SIGLA_PREDEFINITA)
  })
})
