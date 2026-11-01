import { describe, it, expect } from 'vitest'
import { DURATA_CACHE, leggiRisposta, querySparql, usaCache } from './premi'

// La lista dei premi arriva da Wikidata in righe SPARQL: qui si decide cosa
// diventa un vincitore, in che ordine, e quando si richiede.

const riga = (qid: string, tmdb: string, anno?: string, titolo = '') => ({
  film: { value: `http://www.wikidata.org/entity/${qid}` },
  tmdb: { value: tmdb },
  ...(anno ? { anno: { value: anno } } : {}),
  titolo: { value: titolo },
})

describe('leggiRisposta', () => {
  it('dal premio più recente al più vecchio, quelli senza anno in fondo', () => {
    const v = leggiRisposta({
      results: { bindings: [riga('Q1', '238', '1973', 'Il padrino'), riga('Q2', '872585', '2024', 'Oppenheimer'), riga('Q3', '99', undefined, 'Senza data')] },
    })
    expect(v.map((x) => x.titolo)).toEqual(['Oppenheimer', 'Il padrino', 'Senza data'])
    expect(v[0]).toEqual({ qid: 'Q2', tmdbId: 872585, anno: 2024, titolo: 'Oppenheimer' })
  })

  it('un film su più righe resta uno, con l anno più vecchio', () => {
    const v = leggiRisposta({ results: { bindings: [riga('Q1', '238', '1974'), riga('Q1', '238', '1973'), riga('Q1', '9999', '1975')] } })
    expect(v).toHaveLength(1)
    expect(v[0].anno).toBe(1973)
  })

  it('scarta le righe senza un id TMDB valido', () => {
    expect(leggiRisposta({ results: { bindings: [riga('Q1', 'abc', '2000'), riga('Q2', '0', '2001')] } })).toEqual([])
    expect(leggiRisposta({})).toEqual([])
  })
})

describe('querySparql', () => {
  it('chiede il premio indicato, solo per chi ha una scheda TMDB', () => {
    const q = querySparql('Q179808')
    expect(q).toContain('ps:P166 wd:Q179808')
    expect(q).toContain('wdt:P4947 ?tmdb')
  })
})

describe('usaCache', () => {
  const adesso = 1_000_000_000_000
  it('una copia fresca si usa, una vecchia si rinnova', () => {
    expect(usaCache({ salvato: adesso - 1000, vincitori: [] }, adesso, true)).toBe(true)
    expect(usaCache({ salvato: adesso - DURATA_CACHE - 1, vincitori: [] }, adesso, true)).toBe(false)
  })
  it('senza rete si usa anche vecchia, e senza copia si prova comunque', () => {
    expect(usaCache({ salvato: 0, vincitori: [] }, adesso, false)).toBe(true)
    expect(usaCache(null, adesso, false)).toBe(false)
  })
})
