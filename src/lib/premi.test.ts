import { describe, it, expect } from 'vitest'
import {
  CATEGORIE,
  DURATA_CACHE,
  leggiPremiDelTitolo,
  leggiRisposta,
  queryPremiDelTitolo,
  querySparql,
  trovaCategoria,
  usaCache,
} from './premi'

// Le liste dei premi arrivano da Wikidata in righe SPARQL: qui si decide cosa
// diventa un vincitore, in che ordine, e quando si richiede.

const riga = (qid: string, tmdb: string, anno?: string, titolo = '', persona?: string) => ({
  film: { value: `http://www.wikidata.org/entity/${qid}` },
  tmdb: { value: tmdb },
  ...(anno ? { anno: { value: anno } } : {}),
  titolo: { value: titolo },
  ...(persona ? { persona: { value: persona } } : {}),
})

describe('leggiRisposta', () => {
  it('dal premio più recente al più vecchio, quelli senza anno in fondo', () => {
    const v = leggiRisposta({
      results: { bindings: [riga('Q1', '238', '1973', 'Il padrino'), riga('Q2', '872585', '2024', 'Oppenheimer'), riga('Q3', '99', undefined, 'Senza data')] },
    })
    expect(v.map((x) => x.titolo)).toEqual(['Oppenheimer', 'Il padrino', 'Senza data'])
    expect(v[0]).toEqual({ qid: 'Q2', tmdbId: 872585, anno: 2024, titolo: 'Oppenheimer', persone: [] })
  })

  it('un film su più righe resta uno, con l anno più vecchio', () => {
    const v = leggiRisposta({ results: { bindings: [riga('Q1', '238', '1974'), riga('Q1', '238', '1973'), riga('Q1', '9999', '1975')] } })
    expect(v).toHaveLength(1)
    expect(v[0].anno).toBe(1973)
  })

  it('nei premi a una persona tiene chi ha vinto, e unisce i pari merito', () => {
    const v = leggiRisposta({
      results: { bindings: [riga('Q5', '497', '2009', 'Il cavaliere oscuro', 'Heath Ledger'), riga('Q6', '1', '1993', 'X', 'Anna'), riga('Q6', '1', '1993', 'X', 'Bruno')] },
    })
    expect(v.find((x) => x.qid === 'Q5')?.persone).toEqual(['Heath Ledger'])
    expect(v.find((x) => x.qid === 'Q6')?.persone).toEqual(['Anna', 'Bruno'])
  })

  it('scarta le righe senza un id TMDB valido', () => {
    expect(leggiRisposta({ results: { bindings: [riga('Q1', 'abc', '2000'), riga('Q2', '0', '2001')] } })).toEqual([])
    expect(leggiRisposta({})).toEqual([])
  })
})

describe('querySparql', () => {
  it('un premio verificato si chiede per codice, solo per chi ha una scheda TMDB', () => {
    const q = querySparql(trovaCategoria('palma').categoria)
    expect(q).toContain('VALUES ?premio { wd:Q179808 }')
    expect(q).toContain('wdt:P4947 ?tmdb')
  })

  it('gli altri per la voce di Wikipedia, e anche quando il premio è sulla persona', () => {
    const q = querySparql(trovaCategoria('oscar-fotografia').categoria)
    expect(q).toContain('schema:name "Academy Award for Best Cinematography"@en')
    // Il premio a un direttore della fotografia sta su di lui, col film in P1686.
    expect(q).toContain('pq:P1686 ?film')
  })

  it('una virgoletta nel nome non può chiudere la stringa della query', () => {
    expect(querySparql({ id: 'x', nome: 'x', voce: 'a"b' })).toContain('"ab"@en')
  })

  it('ogni categoria ha un modo di essere trovata, e un id unico', () => {
    for (const c of CATEGORIE) expect(c.qid || c.voce, c.id).toBeTruthy()
    expect(new Set(CATEGORIE.map((c) => c.id)).size).toBe(CATEGORIE.length)
  })
})

describe('trovaCategoria', () => {
  it('trova il gruppo della categoria, e senza categoria parte dall Oscar al miglior film', () => {
    expect(trovaCategoria('venezia-attrice').gruppo.nome).toBe('Venezia')
    expect(trovaCategoria(null).categoria.qid).toBe('Q102427')
    expect(trovaCategoria('inventata').categoria.id).toBe('oscar')
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
  it('una copia del formato di prima, senza i vincitori per persona, si rinnova', () => {
    const vecchia = { salvato: adesso, vincitori: [{ qid: 'Q1', tmdbId: 1, anno: 2000, titolo: 'X' }] }
    expect(usaCache(vecchia as never, adesso, true)).toBe(false)
  })
})

describe('premi vinti da un titolo', () => {
  const premio = (qid: string, nome: string, anno: string, chi?: string, voce?: string) => ({
    premio: { value: `http://www.wikidata.org/entity/${qid}` },
    premioLabel: { value: nome },
    anno: { value: anno },
    ...(chi ? { chiLabel: { value: chi } } : {}),
    ...(voce ? { voce: { value: voce } } : {}),
  })

  it('i premi maggiori prima, con chi li ha vinti; i premi senza nome si scartano', () => {
    const p = leggiPremiDelTitolo({
      results: {
        bindings: [
          premio('Q900', 'Premio della critica di Boston', '2024'),
          premio('Q901', 'Oscar alla migliore fotografia', '2024', 'Hoyte van Hoytema', 'Academy Award for Best Cinematography'),
          premio('Q102427', 'Oscar al miglior film', '2024'),
          premio('Q902', 'Q902', '2024'),
        ],
      },
    })
    expect(p.map((x) => x.premio)).toEqual(['Oscar al miglior film', 'Oscar alla migliore fotografia', 'Premio della critica di Boston'])
    expect(p[1]).toMatchObject({ persone: ['Hoyte van Hoytema'], maggiore: true })
    expect(p[2].maggiore).toBe(false)
  })

  it('film e serie hanno due proprietà diverse per l id TMDB', () => {
    expect(queryPremiDelTitolo('movie', 872585)).toContain('wdt:P4947 "872585"')
    expect(queryPremiDelTitolo('tv', 1396)).toContain('wdt:P4983 "1396"')
  })
})
