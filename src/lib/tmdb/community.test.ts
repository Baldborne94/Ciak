import { describe, it, expect } from 'vitest'
import { ordinaListe, ordinaRecensioni } from './community'

// Le recensioni e le liste arrivano due volte (in italiano e in inglese) e
// TMDB ne ripete parecchie: qui si decide cosa si vede e in che ordine.

function rec(id: string, over: Record<string, unknown> = {}) {
  return { id, author: `autore-${id}`, content: `Testo ${id}`, created_at: '2024-01-01T00:00:00Z', url: `https://tmdb/${id}`, iso_639_1: 'en', ...over }
}

describe('ordinaRecensioni', () => {
  it('mette prima quelle in italiano, poi le altre dalla più recente', () => {
    const out = ordinaRecensioni([
      [rec('it1', { iso_639_1: 'it', created_at: '2020-01-01T00:00:00Z' })],
      [rec('vecchia', { created_at: '2019-05-01T00:00:00Z' }), rec('nuova', { created_at: '2025-05-01T00:00:00Z' })],
    ])
    expect(out.map((r) => r.id)).toEqual(['it1', 'nuova', 'vecchia'])
  })

  it('non ripete la stessa recensione arrivata in entrambe le lingue', () => {
    const out = ordinaRecensioni([[rec('a')], [rec('a'), rec('b')]])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('salta le recensioni vuote, che sarebbero solo una riga col nome', () => {
    expect(ordinaRecensioni([[rec('a', { content: '   ' }), rec('b')]]).map((r) => r.id)).toEqual(['b'])
  })

  it('tiene il voto dell autore solo se l ha dato, e preferisce il nome allo username', () => {
    const [con, senza] = ordinaRecensioni([
      [
        rec('con', { created_at: '2025-01-01T00:00:00Z', author_details: { name: 'Anna', username: 'anna88', rating: 8 } }),
        rec('senza', { author_details: { name: '', rating: null } }),
      ],
    ])
    expect(con).toMatchObject({ autore: 'Anna', voto: 8 })
    expect(senza).toMatchObject({ autore: 'autore-senza', voto: null })
  })
})

describe('ordinaListe', () => {
  it('mette prima le liste più seguite, poi le più lunghe', () => {
    const out = ordinaListe([
      [
        { id: 1, name: 'Poco seguita', item_count: 50, favorite_count: 0 },
        { id: 2, name: 'Seguita', item_count: 10, favorite_count: 12 },
        { id: 3, name: 'Lunga', item_count: 90, favorite_count: 0 },
      ],
    ])
    expect(out.map((l) => l.id)).toEqual([2, 3, 1])
  })

  it('scarta i doppioni, le liste senza nome e quelle con un titolo solo', () => {
    // Una lista con dentro solo il titolo che si sta guardando non porta
    // niente di nuovo: è il caso più comune fra le liste personali.
    const out = ordinaListe([
      [{ id: 1, name: 'Horror coreani', item_count: 20 }],
      [
        { id: 1, name: 'Horror coreani', item_count: 20 },
        { id: 2, name: '', item_count: 30 },
        { id: 3, name: 'Solo questo', item_count: 1 },
      ],
    ])
    expect(out.map((l) => l.nome)).toEqual(['Horror coreani'])
  })
})
