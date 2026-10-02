import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DURATA_SIGLA_PREDEFINITA,
  codaSiglaRaggiunta,
  dopoLaSigla,
  inSiglaFinale,
  inizioSiglaRaggiunto,
  inSiglaEsatta,
  leggiDurataSigla,
  leggiPuntiSigla,
  leggiSaltaSigle,
  mostraSaltaSigla,
  salvaDurataSigla,
  salvaPuntiSigla,
  salvaSaltaSigle,
  secondiAllaFine,
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

describe('saltarle da sole', () => {
  let memoria: Map<string, string>
  beforeEach(() => {
    memoria = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('le caselle partono vuote e restano come le si lascia', () => {
    expect(leggiSaltaSigle()).toEqual({ inizio: false, fine: false })
    salvaSaltaSigle({ inizio: true, fine: false })
    expect(leggiSaltaSigle()).toEqual({ inizio: true, fine: false })
    memoria.set('ciak:salta-sigle', 'rotto{')
    expect(leggiSaltaSigle()).toEqual({ inizio: false, fine: false })
  })

  it('i punti imparati sono per serie, e uno strano vale come non saputo', () => {
    expect(leggiPuntiSigla('tv-1429')).toEqual({ inizio: null, coda: null })
    salvaPuntiSigla('tv-1429', { inizio: 95, coda: 120 })
    expect(leggiPuntiSigla('tv-1429')).toEqual({ inizio: 95, coda: 120 })
    expect(leggiPuntiSigla('tv-2190')).toEqual({ inizio: null, coda: null })
    memoria.set('ciak:punti-sigla:tv-1', JSON.stringify({ inizio: 'x', coda: -3 }))
    expect(leggiPuntiSigla('tv-1')).toEqual({ inizio: null, coda: null })
  })

  it('la sigla iniziale scatta solo passandoci sopra, non riprendendo più avanti', () => {
    expect(inizioSiglaRaggiunto(94, 95)).toBe(false)
    expect(inizioSiglaRaggiunto(95.3, 95)).toBe(true)
    expect(inizioSiglaRaggiunto(400, 95)).toBe(false)
    expect(inizioSiglaRaggiunto(95.3, null)).toBe(false)
  })

  it('la sigla finale si misura dalla fine', () => {
    expect(codaSiglaRaggiunta(1300, 1450, 120)).toBe(false)
    expect(codaSiglaRaggiunta(1331, 1450, 120)).toBe(true)
    expect(codaSiglaRaggiunta(1331, null, 120)).toBe(false)
    expect(codaSiglaRaggiunta(1449, 1450, null)).toBe(false)
    expect(secondiAllaFine(1330.4, 1450)).toBe(120)
    expect(secondiAllaFine(10, null)).toBeNull()
  })
})

describe('con i tempi esatti dell episodio', () => {
  it('il pulsante c è solo mentre la sigla c è', () => {
    const sigla = { da: 32, a: 122 }
    expect(inSiglaEsatta(20, sigla)).toBe(false)
    expect(inSiglaEsatta(31.5, sigla)).toBe(true)
    expect(inSiglaEsatta(100, sigla)).toBe(true)
    expect(inSiglaEsatta(121.5, sigla)).toBe(false)
    expect(inSiglaEsatta(0, { da: 0, a: 90 })).toBe(true)
  })
})
