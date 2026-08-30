import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { MediaDetail } from './types'

// computeStats aggrega DB (user_titles + user_diary) e dettagli TMDB: mockiamo
// entrambi i confini e verifichiamo l'aggregazione (dedup, precedenza voti,
// istogramma, ore, decenni, recap per anno) — il motore della pagina Statistiche.
vi.mock('./supabase', () => ({ supabase: { from: vi.fn() }, isSupabaseConfigured: true }))
vi.mock('./tmdb', () => ({ getDetail: vi.fn() }))

import { computeStats } from './stats'
import { supabase } from './supabase'
import { getDetail } from './tmdb'

interface TitleRow {
  tmdb_id: number
  media_type: string
  title: string
  personal_rating: number | null
}
interface DiaryRow {
  tmdb_id: number
  media_type: string
  title: string
  rating: number | null
  watched_on: string
}

// Query builder finto: i metodi di filtro tornano se stessi, l'await risolve il
// risultato. `range` affetta davvero le righe, perché computeStats ora sfoglia
// le pagine: un finto che ignorasse gli estremi restituirebbe sempre tutto e il
// ciclo non finirebbe mai — il test passerebbe per il motivo sbagliato.
function fakeTable(rows: unknown[]) {
  const b: Record<string, unknown> = {}
  let slice: [number, number] | null = null
  const chain = () => b
  b.select = chain
  b.eq = chain
  b.order = chain
  b.range = (from: number, to: number) => {
    slice = [from, to]
    return b
  }
  b.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: slice ? rows.slice(slice[0], slice[1] + 1) : rows, error: null })
  return b
}

function setDb(titles: TitleRow[], diary: DiaryRow[], episodes: { tv_id: number }[] = []) {
  vi.mocked(supabase!.from).mockImplementation((table: string) => {
    const rows =
      table === 'user_titles' ? titles : table === 'user_diary' ? diary : episodes
    return fakeTable(rows) as unknown as ReturnType<NonNullable<typeof supabase>['from']>
  })
}

function detail(over: Partial<MediaDetail>): MediaDetail {
  return {
    genres: [],
    directors: [],
    cast: [],
    runtime: null,
    releaseDate: null,
    ...over,
  } as unknown as MediaDetail
}

beforeEach(() => {
  vi.mocked(getDetail).mockResolvedValue(detail({}))
})

describe('computeStats', () => {
  it('unisce visti e diario senza duplicati; il voto del diario vince', async () => {
    setDb(
      [{ tmdb_id: 101, media_type: 'movie', title: 'Film', personal_rating: 3 }],
      [
        { tmdb_id: 101, media_type: 'movie', title: 'Film', rating: 4.5, watched_on: '2025-06-01' },
        { tmdb_id: 102, media_type: 'tv', title: 'Serie solo a diario', rating: null, watched_on: '2025-01-10' },
      ],
    )
    const s = await computeStats('u1')
    expect(s.totalTitles).toBe(2)
    expect(s.movies).toBe(1)
    expect(s.series).toBe(1)
    expect(s.ratedCount).toBe(1)
    expect(s.avgRating).toBe(4.5) // il diario ha la precedenza sui 3 di user_titles
  })

  it('anime e cartoni contano come serie (non film)', async () => {
    setDb(
      [
        { tmdb_id: 111, media_type: 'anime', title: 'Anime', personal_rating: null },
        { tmdb_id: 112, media_type: 'cartoon', title: 'Cartone', personal_rating: null },
      ],
      [],
    )
    const s = await computeStats('u1')
    expect(s.movies).toBe(0)
    expect(s.series).toBe(2)
  })

  it('istogramma a mezze stelle e media arrotondata a 2 decimali', async () => {
    setDb(
      [
        { tmdb_id: 121, media_type: 'movie', title: 'A', personal_rating: 3.5 },
        { tmdb_id: 122, media_type: 'movie', title: 'B', personal_rating: 3.5 },
        { tmdb_id: 123, media_type: 'movie', title: 'C', personal_rating: 5 },
      ],
      [],
    )
    const s = await computeStats('u1')
    expect(s.avgRating).toBe(4)
    expect(s.ratingHistogram.find((h) => h.half === 3.5)?.count).toBe(2)
    expect(s.ratingHistogram.find((h) => h.half === 5)?.count).toBe(1)
    expect(s.ratingHistogram.find((h) => h.half === 1)?.count).toBe(0)
  })

  it('conta le ore solo dai film e i decenni dalla data di uscita', async () => {
    setDb(
      [
        { tmdb_id: 131, media_type: 'movie', title: 'Film 90s', personal_rating: null },
        { tmdb_id: 132, media_type: 'tv', title: 'Serie lunga', personal_rating: null },
      ],
      [],
    )
    vi.mocked(getDetail).mockImplementation(async (type) =>
      type === 'movie'
        ? detail({ runtime: 120, releaseDate: '1994-09-23' })
        : detail({ runtime: 45, releaseDate: '2008-01-20' }),
    )
    const s = await computeStats('u1')
    expect(s.filmHours).toBe(2) // solo i 120 min del film, non la serie
    expect(s.decades).toEqual([
      { decade: 1990, count: 1 },
      { decade: 2000, count: 1 },
    ])
    expect(s.enrichedCount).toBe(2)
  })

  it('recap per anno di visione: volume, composizione e capolavori (5 stelle)', async () => {
    setDb(
      [],
      [
        { tmdb_id: 141, media_type: 'movie', title: 'A', rating: 5, watched_on: '2025-02-01' },
        { tmdb_id: 142, media_type: 'tv', title: 'B', rating: 3, watched_on: '2025-07-15' },
        { tmdb_id: 143, media_type: 'movie', title: 'C', rating: null, watched_on: '2024-12-31' },
      ],
    )
    const s = await computeStats('u1')
    expect(s.yearsInFilm.map((y) => y.year)).toEqual([2025, 2024]) // più recente prima
    const y2025 = s.yearsInFilm[0]
    expect(y2025.count).toBe(2)
    expect(y2025.movies).toBe(1)
    expect(y2025.series).toBe(1)
    expect(y2025.avgRating).toBe(4)
    expect(y2025.fiveStars).toBe(1)
    expect(s.yearsInFilm[1].avgRating).toBeNull()
  })

  it('un dettaglio TMDB non risolvibile non fa saltare le statistiche', async () => {
    setDb(
      [
        { tmdb_id: 151, media_type: 'movie', title: 'Ok', personal_rating: null },
        { tmdb_id: 152, media_type: 'movie', title: 'Rotto', personal_rating: null },
      ],
      [],
    )
    vi.mocked(getDetail).mockImplementation(async (_type, id) => {
      if (id === 152) throw new Error('TMDB down')
      return detail({ runtime: 90, genres: [{ id: 27, name: 'Horror' }] })
    })
    const s = await computeStats('u1')
    expect(s.totalTitles).toBe(2)
    expect(s.enrichedCount).toBe(1)
    expect(s.topGenres).toEqual([{ name: 'Horror', count: 1 }])
  })
})
