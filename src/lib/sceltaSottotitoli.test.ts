import { beforeEach, describe, expect, it } from 'vitest'
import {
  DIMENSIONI_SOTTOTITOLI,
  indiceSottotitolo,
  leggiDimensioneSottotitoli,
  leggiLinguaSottotitoli,
  nomiSottotitoli,
  salvaDimensioneSottotitoli,
  salvaLinguaSottotitoli,
  siglaSottotitolo,
  testoSottotitoli,
} from './sceltaSottotitoli'

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

describe('la dimensione dei sottotitoli', () => {
  it('di base sono medi, e la scelta resta', () => {
    expect(DIMENSIONI_SOTTOTITOLI[leggiDimensioneSottotitoli()].nome).toBe('Medi')
    salvaDimensioneSottotitoli(3)
    expect(DIMENSIONI_SOTTOTITOLI[leggiDimensioneSottotitoli()].nome).toBe('Molto grandi')
  })

  it('un valore strano salvato torna medi', () => {
    localStorage.setItem('ciak:sottotitoli-dimensione', '9')
    expect(leggiDimensioneSottotitoli()).toBe(1)
    localStorage.setItem('ciak:sottotitoli-dimensione', 'boh')
    expect(leggiDimensioneSottotitoli()).toBe(1)
  })
})

describe('nomi e sigla nel menu CC', () => {
  it('la lingua, col numero solo quando due tracce la condividono', () => {
    expect(nomiSottotitoli(IT_EN)).toEqual(['Italiano', 'Inglese'])
    expect(nomiSottotitoli([{ lingua: 'it' }, { lingua: 'it' }, { lingua: 'en' }])).toEqual(['Italiano 1', 'Italiano 2', 'Inglese'])
  })

  it('sul pulsante: off, la lingua in due lettere o il numero', () => {
    expect(siglaSottotitolo(IT_EN, -1)).toBe('off')
    expect(siglaSottotitolo(IT_EN, 1)).toBe('EN')
    expect(siglaSottotitolo([{ lingua: null }], 0)).toBe('1')
  })
})

describe('la riga dei sottotitoli sotto il lettore', () => {
  const base = { salvati: false, etichette: [] as string[], stato: 'pronti' as const, messaggio: null }

  it('dice quali ci sono, e quale lingua manca', () => {
    expect(testoSottotitoli({ ...base, etichette: ['Italiano · accanto al video'], messaggio: 'Inglese non trovato.' })).toBe(
      'Italiano · accanto al video · Inglese non trovato.',
    )
  })

  it('mentre cerca lo dice; la copia in Ciak non cerca niente', () => {
    expect(testoSottotitoli({ ...base, stato: 'cerco' })).toBe('Cerco i sottotitoli…')
    expect(testoSottotitoli({ ...base, stato: 'cerco', salvati: true })).toBe('Nessun sottotitolo salvato con il film.')
  })

  it('senza sottotitoli dice perché', () => {
    expect(testoSottotitoli({ ...base, stato: 'errore', messaggio: 'quota finita' })).toBe('Sottotitoli non disponibili: quota finita')
    expect(testoSottotitoli({ ...base, stato: 'nessuno' })).toBe('Nessun sottotitolo, né accanto al video né su OpenSubtitles.')
  })
})
