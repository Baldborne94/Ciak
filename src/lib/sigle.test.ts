import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DURATA_SIGLA_PREDEFINITA,
  arrivoSalto,
  codaSiglaRaggiunta,
  durataDaPunti,
  dopoLaSigla,
  inSiglaFinale,
  inizioSiglaRaggiunto,
  inSiglaEsatta,
  leggiDurataSigla,
  leggiPuntiSigla,
  leggiSaltaSigle,
  fineDaCorrezione,
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

  it('se la serie ha già il suo punto, il pulsante c è solo intorno alla sigla', () => {
    // South Park: sigla a 0:04 per 0:30. A 3:25 compariva ancora «Salta sigla».
    expect(mostraSaltaSigla(0, 4, 30)).toBe(true)
    expect(mostraSaltaSigla(20, 4, 30)).toBe(true)
    expect(mostraSaltaSigla(205, 4, 30)).toBe(false)
    // Un po' prima del punto sì: la scena d'apertura cambia di qualche secondo.
    expect(mostraSaltaSigla(80, 95, 90)).toBe(true)
    expect(mostraSaltaSigla(60, 95, 90)).toBe(false)
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
    expect(leggiPuntiSigla('tv-1429')).toEqual({ inizio: null, fine: null, coda: null })
    salvaPuntiSigla('tv-1429', { inizio: 95, fine: 185, coda: 120 })
    expect(leggiPuntiSigla('tv-1429')).toEqual({ inizio: 95, fine: 185, coda: 120 })
    expect(leggiPuntiSigla('tv-2190')).toEqual({ inizio: null, fine: null, coda: null })
    memoria.set('ciak:punti-sigla:tv-1', JSON.stringify({ inizio: 'x', fine: Infinity, coda: -3 }))
    expect(leggiPuntiSigla('tv-1')).toEqual({ inizio: null, fine: null, coda: null })
    // Quelli salvati prima che ci fosse la fine della sigla valgono ancora.
    memoria.set('ciak:punti-sigla:tv-2', JSON.stringify({ inizio: 4, coda: 120 }))
    expect(leggiPuntiSigla('tv-2')).toEqual({ inizio: 4, fine: null, coda: 120 })
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

describe('i tempi impostati a mano', () => {
  const punti = { inizio: 35, fine: 125, coda: null }

  it('la durata della sigla viene dai due punti, se hanno senso', () => {
    expect(durataDaPunti(punti, 90)).toBe(90)
    expect(durataDaPunti({ inizio: 4, fine: 34, coda: null }, 90)).toBe(30)
    expect(durataDaPunti({ inizio: 4, fine: null, coda: null }, 45)).toBe(45)
    // La fine prima dell'inizio è un errore di battitura: si ignora.
    expect(durataDaPunti({ inizio: 60, fine: 30, coda: null }, 45)).toBe(45)
  })

  it('«Salta sigla» arriva alla fine della sigla, anche premuto in ritardo', () => {
    expect(arrivoSalto(40, punti, 90, 1300)).toBe(125)
    expect(arrivoSalto(100, punti, 90, 1300)).toBe(125)
    // Senza la fine, avanti della durata; oltre la fine, idem.
    expect(arrivoSalto(40, { ...punti, fine: null }, 90, 1300)).toBe(130)
    expect(arrivoSalto(200, punti, 90, 1300)).toBe(290)
  })

  it('la fine della sigla si impara da chi corregge il salto subito dopo', () => {
    const salto = { da: 10, a: 100, quando: 1000 }
    // Trascinata la barra a 0:55 entro pochi secondi: la sigla finisce lì.
    expect(fineDaCorrezione(salto, 55, 6000)).toBe(55)
    expect(fineDaCorrezione(salto, 130.4, 6000)).toBe(130)
    // Troppo tardi: è un salto qualunque.
    expect(fineDaCorrezione(salto, 55, 1000 + 25_000)).toBeNull()
    // Indietro fino a dove si era (↩ Rivedi), o all'inizio dell'episodio: no.
    expect(fineDaCorrezione(salto, 10, 6000)).toBeNull()
    expect(fineDaCorrezione(salto, 0, 6000)).toBeNull()
    // Rimasti dove il salto era arrivato, o molto più avanti: no.
    expect(fineDaCorrezione(salto, 100.5, 6000)).toBeNull()
    expect(fineDaCorrezione(salto, 400, 6000)).toBeNull()
    expect(fineDaCorrezione(null, 55, 6000)).toBeNull()
  })
})
