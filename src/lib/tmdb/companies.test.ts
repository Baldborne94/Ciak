import { describe, it, expect, vi, beforeEach } from 'vitest'

// TMDB ha più studi «A24» col logo uguale: quello vero ha 148 film, un
// doppione uno solo, e la ricerca dava il doppione per primo.

const risposte = vi.hoisted(() => ({ studi: [] as { id: number; name: string; logo_path: string | null }[], film: {} as Record<number, number>, chiamate: [] as string[] }))
vi.mock('./client', () => ({
  tmdbFetch: vi.fn(async (path: string, params: Record<string, string> = {}) => {
    risposte.chiamate.push(`${path}${params.with_companies ? `?${params.with_companies}` : ''}`)
    if (path === '/search/company') return { results: risposte.studi }
    if (path === '/discover/movie') return { total_results: risposte.film[Number(params.with_companies)] ?? 0, results: [] }
    throw new Error(`inatteso: ${path}`)
  }),
}))

const { ordinaOmonimi, resolveStudios, searchCompany, studioOmonimoPiuGrande } = await import('./companies')

const studio = (id: number, name: string) => ({ id, name, logo_path: '/a24.png' })

beforeEach(() => {
  risposte.chiamate.length = 0
  risposte.studi = [studio(9001, 'A24'), studio(41077, 'A24'), studio(500, 'A24 Television')]
  risposte.film = { 9001: 1, 41077: 148 }
})

describe('ordinaOmonimi', () => {
  it('fra omonimi prima chi ha più film, al posto del primo; gli altri restano dove sono', () => {
    const out = ordinaOmonimi(
      [
        { id: 1, name: 'Altro', logoPath: null },
        { id: 2, name: 'A24', logoPath: null },
        { id: 3, name: 'Zeta', logoPath: null },
        { id: 4, name: 'a24 ', logoPath: null },
      ],
      new Map([
        [2, 1],
        [4, 148],
      ]),
    )
    expect(out.map((c) => [c.id, c.film])).toEqual([
      [1, undefined],
      [4, 148],
      [2, 1],
      [3, undefined],
    ])
  })
})

describe('searchCompany', () => {
  it('conta i film dei soli omonimi e mette per primo quello vero', async () => {
    const out = await searchCompany('A24')
    expect(out.map((c) => [c.id, c.film])).toEqual([
      [41077, 148],
      [9001, 1],
      [500, undefined],
    ])
    // «A24 Television» non è un omonimo: nessuna domanda in più per lui.
    expect(risposte.chiamate.filter((c) => c.startsWith('/discover'))).toEqual(['/discover/movie?9001', '/discover/movie?41077'])
  })

  it('fra gli studi famosi «A24» è quello coi suoi film', async () => {
    expect((await resolveStudios(['A24'])).map((c) => c.id)).toEqual([41077])
  })
})

describe('studioOmonimoPiuGrande', () => {
  it('dal doppione porta a quello vero', async () => {
    expect(await studioOmonimoPiuGrande({ id: 9001, name: 'A24', logoPath: null })).toMatchObject({ id: 41077, film: 148 })
  })

  it('da quello vero, niente', async () => {
    expect(await studioOmonimoPiuGrande({ id: 41077, name: 'A24', logoPath: null })).toBeNull()
  })

  it('fra due omonimi con gli stessi film non si manda da nessuna parte', async () => {
    risposte.studi = [studio(71, 'Gemelli'), studio(72, 'Gemelli')]
    risposte.film = { 71: 3, 72: 3 }
    expect(await studioOmonimoPiuGrande({ id: 72, name: 'Gemelli', logoPath: null })).toBeNull()
  })

  it('uno studio senza omonimi non ha niente da proporre', async () => {
    risposte.studi = [studio(3, 'Pixar')]
    expect(await studioOmonimoPiuGrande({ id: 3, name: 'Pixar', logoPath: null })).toBeNull()
  })
})
