import { describe, it, expect } from 'vitest'
import { decidiErrore, sessioneInScadenza, TENTATIVI_MAX } from './lettore'

const base = { codice: 2, posizione: 508, tentativi: 0, connesso: true }

describe('decidiErrore', () => {
  it('un errore di rete a metà film riprende da dove si era', () => {
    // Il caso vero: «annullata a causa di un errore di rete» a 8:28.
    expect(decidiErrore(base)).toBe('riprova')
  })

  it('a film già partito riprova anche per errori che non sono di rete', () => {
    expect(decidiErrore({ ...base, codice: 3 })).toBe('riprova')
  })

  it('dopo troppi tentativi di fila lo dice, invece di girare a vuoto', () => {
    expect(decidiErrore({ ...base, tentativi: TENTATIVI_MAX })).toBe('rete')
  })

  it('con la sessione Google scaduta chiede di ricollegarsi', () => {
    expect(decidiErrore({ ...base, connesso: false })).toBe('sessione')
  })

  it('un file che non parte nemmeno è un formato che il browser non legge', () => {
    expect(decidiErrore({ ...base, codice: 4, posizione: 0 })).toBe('formato')
  })

  it('un errore di rete prima di partire si riprova comunque', () => {
    expect(decidiErrore({ ...base, posizione: 0 })).toBe('riprova')
  })
})

describe('sessioneInScadenza', () => {
  const ora = 1_000_000_000
  it('avvisa negli ultimi dieci minuti', () => {
    expect(sessioneInScadenza(ora + 9 * 60_000, ora)).toBe(true)
    expect(sessioneInScadenza(ora - 1, ora)).toBe(true)
  })

  it('tace quando manca ancora tempo, o quando non c’è sessione', () => {
    expect(sessioneInScadenza(ora + 30 * 60_000, ora)).toBe(false)
    expect(sessioneInScadenza(0, ora)).toBe(false)
  })
})
