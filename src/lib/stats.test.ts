import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TitleFacts } from './types'

// computeStats aggrega DB (user_titles + user_diary) e dettagli TMDB: mockiamo
// entrambi i confini e verifichiamo l'aggregazione (dedup, precedenza voti,
// istogramma, ore, decenni, recap per anno) — il motore della pagina Statistiche.
vi.mock('./supabase', () => ({ supabase: { from: vi.fn() }, isSupabaseConfigured: true }))
vi.mock('./tmdb', () => ({ fetchTitleFacts: vi.fn() }))

import { computeStats, daRileggere, tipoStatistiche } from './stats'
import { supabase } from './supabase'
import { fetchTitleFacts } from './tmdb'

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

// Le statistiche ora leggono una versione leggera del dettaglio: nomi al posto
// di oggetti, e l'anno già estratto.
function detail(over: Partial<TitleFacts>): TitleFacts {
  return {
    genres: [],
    directors: [],
    cast: [],
    runtime: null,
    year: null,
    episodes: null,
    ...over,
  }
}

beforeEach(() => {
  vi.mocked(fetchTitleFacts).mockResolvedValue(detail({}))
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

  it('anime e cartoni salvati col loro tipo stanno a parte, non fra film e serie', async () => {
    setDb(
      [
        { tmdb_id: 111, media_type: 'anime', title: 'Anime', personal_rating: null },
        { tmdb_id: 112, media_type: 'cartoon', title: 'Cartone', personal_rating: null },
      ],
      [],
    )
    const s = await computeStats('u1')
    expect(s.movies).toBe(0)
    expect(s.series).toBe(0)
    expect(s.anime).toBe(1)
    expect(s.cartoni).toBe(1)
  })

  it('una serie animata salvata come «tv» è un anime se giapponese, se no un cartone', async () => {
    // Konosuba e Gumball arrivano dal catalogo come «tv»: erano contati fra
    // le serie viste.
    setDb(
      [
        { tmdb_id: 65844, media_type: 'tv', title: 'Konosuba', personal_rating: null },
        { tmdb_id: 37606, media_type: 'tv', title: 'Gumball', personal_rating: null },
        { tmdb_id: 1396, media_type: 'tv', title: 'Breaking Bad', personal_rating: null },
      ],
      [{ tmdb_id: 65844, media_type: 'tv', title: 'Konosuba', rating: 4, watched_on: '2025-03-01' }],
    )
    vi.mocked(fetchTitleFacts).mockImplementation(async (_t, id) =>
      id === 65844 ? detail({ genres: ['Animazione', 'Commedia'], lingua: 'ja' })
        : id === 37606 ? detail({ genres: ['Animazione'], lingua: 'en' })
        : detail({ genres: ['Dramma'], lingua: 'en' }),
    )
    const s = await computeStats('u1')
    expect([s.series, s.anime, s.cartoni]).toEqual([1, 1, 1])
    expect(s.yearsInFilm[0]).toMatchObject({ year: 2025, anime: 1, series: 0 })
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

  it('conta le ore di film e serie separatamente, e i decenni dall anno di uscita', async () => {
    setDb(
      [
        { tmdb_id: 131, media_type: 'movie', title: 'Film 90s', personal_rating: null },
        { tmdb_id: 132, media_type: 'tv', title: 'Serie lunga', personal_rating: null },
      ],
      [],
    )
    vi.mocked(fetchTitleFacts).mockImplementation(async (type) =>
      type === 'movie'
        ? detail({ runtime: 120, year: 1994 })
        : detail({ runtime: 45, year: 2008, episodes: 20 }),
    )
    const s = await computeStats('u1')
    expect(s.filmHours).toBe(2) // i 120 minuti del film
    // La serie è segnata come vista e non ha episodi tracciati: vale per
    // intero, 20 × 45 minuti. Prima le serie valevano zero.
    expect(s.seriesHours).toBe(15)
    expect(s.decades).toEqual([
      { decade: 1990, count: 1 },
      { decade: 2000, count: 1 },
    ])
    expect(s.enrichedCount).toBe(2)
  })

  it('per una serie con episodi tracciati conta quelli, non l intera serie', async () => {
    // Tre episodi segnati su cento: 150 minuti, non 5000.
    setDb(
      [{ tmdb_id: 133, media_type: 'tv', title: 'Serie a metà', personal_rating: null }],
      [],
      [{ tv_id: 133 }, { tv_id: 133 }, { tv_id: 133 }],
    )
    vi.mocked(fetchTitleFacts).mockResolvedValue(detail({ runtime: 50, episodes: 100 }))
    const s = await computeStats('u1')
    expect(s.seriesHours).toBe(3)
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
    vi.mocked(fetchTitleFacts).mockImplementation(async (_type, id) => {
      if (id === 152) throw new Error('TMDB down')
      return detail({ runtime: 90, genres: ['Horror'] })
    })
    const s = await computeStats('u1')
    expect(s.totalTitles).toBe(2)
    expect(s.enrichedCount).toBe(1)
    expect(s.topGenres).toEqual([{ name: 'Horror', count: 1 }])
  })
})

describe('una serie animata in cache senza lingua si rilegge', () => {
  it('chiede di nuovo a TMDB solo lei, e la conta come anime', async () => {
    // La cache delle statistiche c'era già prima della lingua: senza
    // rileggerla, Konosuba resterebbe per sempre fra le serie.
    const memoria = new Map<string, string>([
      ['ciak:title-facts:v1', JSON.stringify({
        'tv-65844': { genres: ['Animazione'], directors: [], cast: [], runtime: 24, year: 2016, episodes: 20 },
        'tv-1396': { genres: ['Dramma'], directors: [], cast: [], runtime: 47, year: 2008, episodes: 62 },
      })],
    ])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
      removeItem: (k: string) => void memoria.delete(k),
    })
    try {
      setDb(
        [
          { tmdb_id: 65844, media_type: 'tv', title: 'Konosuba', personal_rating: null },
          { tmdb_id: 1396, media_type: 'tv', title: 'Breaking Bad', personal_rating: null },
        ],
        [],
      )
      vi.mocked(fetchTitleFacts).mockClear()
      vi.mocked(fetchTitleFacts).mockResolvedValue(detail({ genres: ['Animazione'], lingua: 'ja' }))
      const s = await computeStats('u1')
      expect(vi.mocked(fetchTitleFacts).mock.calls).toEqual([['tv', 65844]])
      expect([s.series, s.anime]).toEqual([1, 1])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('tipoStatistiche e daRileggere', () => {
  const f = (over: Partial<TitleFacts>): TitleFacts => ({ genres: [], directors: [], cast: [], runtime: null, year: null, episodes: null, ...over })

  it('senza la lingua (cache di prima) una serie animata resta serie, e si richiede', () => {
    const vecchia = f({ genres: ['Animazione'] })
    expect(tipoStatistiche('tv', vecchia)).toBe('serie')
    expect(daRileggere('tv', vecchia)).toBe(true)
    // con la lingua, o se non è animazione, o se è un film, non serve
    expect(daRileggere('tv', f({ genres: ['Animazione'], lingua: 'ja' }))).toBe(false)
    expect(daRileggere('tv', f({ genres: ['Dramma'] }))).toBe(false)
    expect(daRileggere('movie', f({ genres: ['Animazione'] }))).toBe(false)
  })

  it('un film animato resta un film', () => {
    expect(tipoStatistiche('movie', f({ genres: ['Animazione'], lingua: 'ja' }))).toBe('film')
  })
})
