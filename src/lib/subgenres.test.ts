import { describe, it, expect } from 'vitest'
import { SUBGENRES, subgenresFor, findSubgenre } from './subgenres'

const GUERRA = 10752
const HORROR = 27
const TV_GUERRA_POLITICA = 10768
const DOCUMENTARIO = 99

describe('subgenresFor', () => {
  it('torna i sottogeneri del genere richiesto', () => {
    const labels = subgenresFor(GUERRA).map((s) => s.label)
    expect(labels).toContain('Antimilitarista')
    expect(labels).toContain('Seconda guerra mondiale')
  })

  it('torna una lista vuota per un genere senza sottogeneri curati', () => {
    expect(subgenresFor(999999)).toEqual([])
  })

  it('i generi solo-serie riusano i sottogeneri del genere film equivalente', () => {
    // "Guerra e Politica" (serie) include i sottogeneri di Guerra più i suoi.
    const labels = subgenresFor(TV_GUERRA_POLITICA).map((s) => s.label)
    expect(labels).toContain('Politica')
    expect(labels).toContain('Antimilitarista')
  })
})

describe('findSubgenre', () => {
  it('trova un sottogenere per etichetta', () => {
    expect(findSubgenre(HORROR, 'Slasher')?.keywords).toEqual(['slasher'])
  })

  it('non confonde i sottogeneri fra generi diversi', () => {
    // "Slasher" esiste in Horror, non in Documentario.
    expect(findSubgenre(DOCUMENTARIO, 'Slasher')).toBeUndefined()
  })

  it('torna undefined per un’etichetta inesistente', () => {
    expect(findSubgenre(HORROR, 'Non Esiste')).toBeUndefined()
  })
})

describe('integrità della tabella', () => {
  const entries = Object.entries(SUBGENRES)

  it('ogni sottogenere ha un’etichetta e almeno una keyword', () => {
    for (const [genreId, subs] of entries) {
      for (const s of subs) {
        expect(s.label.trim(), `genere ${genreId}`).not.toBe('')
        expect(s.keywords.length, `${genreId} → ${s.label}`).toBeGreaterThan(0)
        // Le keyword sono nomi TMDB, sempre in inglese minuscolo.
        for (const k of s.keywords) {
          expect(k, `${genreId} → ${s.label}`).toBe(k.toLowerCase())
        }
      }
    }
  })

  it('nessuna etichetta duplicata dentro lo stesso genere', () => {
    for (const [genreId, subs] of entries) {
      const labels = subs.map((s) => s.label)
      expect(new Set(labels).size, `genere ${genreId} ha etichette duplicate`).toBe(labels.length)
    }
  })
})
