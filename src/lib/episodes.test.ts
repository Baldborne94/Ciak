import { describe, it, expect } from 'vitest'
import { epKey, seriesStatusFor } from './episodes'

describe('epKey', () => {
  it('combina stagione ed episodio in una chiave stabile', () => {
    expect(epKey(1, 1)).toBe('1-1')
    expect(epKey(2, 13)).toBe('2-13')
  })
})

describe('seriesStatusFor', () => {
  it('non tocca lo stato con 0 episodi visti', () => {
    expect(seriesStatusFor(0, 10)).toBeNull()
    expect(seriesStatusFor(-1, 10)).toBeNull()
  })

  it('segna "in corso" con visione parziale', () => {
    expect(seriesStatusFor(1, 10)).toBe('in_progress')
    expect(seriesStatusFor(9, 10)).toBe('in_progress')
  })

  it('segna "vista" quando tutti gli episodi sono visti', () => {
    expect(seriesStatusFor(10, 10)).toBe('watched')
    expect(seriesStatusFor(11, 10)).toBe('watched')
  })

  it('resta "in corso" se il totale è sconosciuto (0)', () => {
    // Senza un totale affidabile non possiamo dichiarare completata la serie.
    expect(seriesStatusFor(5, 0)).toBe('in_progress')
  })
})
