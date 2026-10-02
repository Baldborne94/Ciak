import { describe, it, expect } from 'vitest'
import { deveRinnovare, PAUSA_RINNOVO_MS } from './driveAutomatico'

const ORA = 10_000_000
const base = { ricordato: true, provato: true, connesso: false, online: true, inRiproduzione: false, ultimo: null, ora: ORA }

describe('deveRinnovare', () => {
  it('rinnova da solo un permesso scaduto su un dispositivo già collegato', () => {
    expect(deveRinnovare(base)).toBe(true)
  })

  it('la prima volta su un dispositivo prova una volta sola, senza domande', () => {
    expect(deveRinnovare({ ...base, ricordato: false, provato: false })).toBe(true)
    expect(deveRinnovare({ ...base, ricordato: false, provato: true })).toBe(false)
  })

  it('non tocca chi l ha scollegato a mano', () => {
    // «Scollega» dimentica il dispositivo e segna il tentativo come fatto.
    expect(deveRinnovare({ ...base, ricordato: false, provato: true })).toBe(false)
  })

  it('non serve col permesso ancora valido, e senza rete non si può', () => {
    expect(deveRinnovare({ ...base, connesso: true })).toBe(false)
    expect(deveRinnovare({ ...base, online: false })).toBe(false)
  })

  it('non lascia mai la pagina con un film in corso', () => {
    expect(deveRinnovare({ ...base, inRiproduzione: true })).toBe(false)
  })

  it('dopo un tentativo aspetta, e dopo un fallimento lascia il pulsante', () => {
    expect(deveRinnovare({ ...base, ultimo: { quando: ORA - 1000 } })).toBe(false)
    expect(deveRinnovare({ ...base, ultimo: { quando: ORA - PAUSA_RINNOVO_MS } })).toBe(true)
    expect(deveRinnovare({ ...base, ultimo: { quando: ORA - 2 * PAUSA_RINNOVO_MS, fallito: true } })).toBe(false)
  })
})
