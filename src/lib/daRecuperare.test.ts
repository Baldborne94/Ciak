import { describe, it, expect } from 'vitest'
import {
  chiaviConosciute,
  escludiConosciuti,
  generiPreferiti,
  intervalloDecennio,
  raccogliNonVisti,
} from './daRecuperare'
import type { MediaItem, MediaType, UserTitle } from './types'

function titolo(over: Partial<UserTitle> = {}): UserTitle {
  return {
    id: 't', user_id: 'u1', tmdb_id: 1, media_type: 'movie' as MediaType, title: 'X',
    poster_path: null, status: 'watched', is_favorite: false, personal_rating: null,
    notes: null, watched_at: null, genre_ids: [], rewatch: false,
    created_at: '', updated_at: '', ...over,
  } as UserTitle
}

function film(id: number, mediaType: 'movie' | 'tv' = 'movie'): MediaItem {
  return {
    id, mediaType, title: `Film ${id}`, originalTitle: null, overview: '',
    posterPath: null, backdropPath: null, releaseDate: null, voteAverage: 8,
    genreIds: [], originalLanguage: 'en',
  }
}

describe('chiaviConosciute', () => {
  it('traduce anime e cartoni in `tv`, che è ciò che TMDB manda', () => {
    // Senza, un anime già visto tornerebbe fra i suggerimenti: la sua riga dice
    // `anime`, il risultato di TMDB dice `tv`, e le chiavi non si incontrano.
    const s = chiaviConosciute([
      titolo({ tmdb_id: 5, media_type: 'anime' as MediaType }),
      titolo({ tmdb_id: 6, media_type: 'cartoon' as MediaType }),
    ])
    expect(s.has('tv-5')).toBe(true)
    expect(s.has('tv-6')).toBe(true)
  })

  it('tiene separati un film e una serie con lo stesso numero', () => {
    const s = chiaviConosciute([
      titolo({ tmdb_id: 42, media_type: 'movie' as MediaType }),
    ])
    expect(s.has('movie-42')).toBe(true)
    expect(s.has('tv-42')).toBe(false)
  })

  it('conta anche gli abbandonati e i «da vedere»', () => {
    // Un film già in lista non è un suggerimento: è una cosa che sai già.
    const s = chiaviConosciute([
      titolo({ tmdb_id: 1, status: 'to_watch' }),
      titolo({ tmdb_id: 2, status: 'abandoned' }),
    ])
    expect(s.size).toBe(2)
  })
})

describe('escludiConosciuti', () => {
  it('toglie solo ciò che è già in archivio', () => {
    const out = escludiConosciuti([film(1), film(2)], new Set(['movie-1']))
    expect(out.map((i) => i.id)).toEqual([2])
  })

  it('non confonde il film 42 con la serie 42', () => {
    const out = escludiConosciuti([film(42, 'tv')], new Set(['movie-42']))
    expect(out).toHaveLength(1)
  })
})

describe('generiPreferiti', () => {
  it('prende quelli che frequenti di più', () => {
    const out = generiPreferiti(
      [
        titolo({ tmdb_id: 1, genre_ids: [27, 18] }),
        titolo({ tmdb_id: 2, genre_ids: [27] }),
        titolo({ tmdb_id: 3, genre_ids: [35] }),
      ],
      2,
    )
    expect(out[0]).toBe(27)
    expect(out).toHaveLength(2)
  })

  it('un titolo con lo stesso genere ripetuto conta una volta', () => {
    expect(generiPreferiti([titolo({ genre_ids: [27, 27] })])).toEqual([27])
  })

  it('senza generi non inventa preferenze', () => {
    expect(generiPreferiti([titolo({ genre_ids: [] })])).toEqual([])
  })
})

describe('intervalloDecennio', () => {
  it('copre il decennio intero, estremi compresi', () => {
    expect(intervalloDecennio(1990)).toEqual({ dal: '1990-01-01', al: '1999-12-31' })
  })
})

describe('raccogliNonVisti', () => {
  // Una finta TMDB: `perPagina` titoli a pagina, id progressivi.
  function catalogo(totalPages: number, perPagina = 20) {
    const chiamate: number[] = []
    return {
      chiamate,
      carica: async (page: number) => {
        chiamate.push(page)
        const base = (page - 1) * perPagina + 1
        return {
          items: Array.from({ length: perPagina }, (_, i) => film(base + i)),
          totalPages,
        }
      },
    }
  }

  it('riempie la schermata sfogliando più pagine quando hai già visto quasi tutto', async () => {
    // È il punto della funzione: a chi ha visto molto, la prima pagina di TMDB
    // può essere quasi tutta roba sua. Mostrare tre film sarebbe un risultato
    // sbagliato, non un archivio ben fornito.
    const c = catalogo(10)
    const conosciute = new Set<string>()
    for (let id = 1; id <= 35; id++) conosciute.add(`movie-${id}`)

    const out = await raccogliNonVisti(c.carica, conosciute, { quanti: 20 })

    expect(out.items).toHaveLength(20)
    expect(c.chiamate.length).toBeGreaterThan(1)
    expect(out.items.every((i) => i.id > 35)).toBe(true)
  })

  it('si ferma appena ne ha abbastanza', async () => {
    const c = catalogo(10)
    const out = await raccogliNonVisti(c.carica, new Set(), { quanti: 20 })
    expect(out.items).toHaveLength(20)
    expect(c.chiamate).toEqual([1])
  })

  it('non ripete un titolo che TMDB manda su due pagine', async () => {
    let n = 0
    const carica = async () => {
      n++
      return { items: [film(7), film(8)], totalPages: 5 }
    }
    const out = await raccogliNonVisti(carica, new Set(), { quanti: 10, maxPagine: 3 })
    expect(out.items.map((i) => i.id)).toEqual([7, 8])
    expect(n).toBe(3)
  })

  it('dice che non c è una pagina dopo, quando il catalogo finisce', async () => {
    const c = catalogo(1)
    const out = await raccogliNonVisti(c.carica, new Set(), { quanti: 50 })
    expect(out.prossimaPagina).toBeNull()
  })

  it('riparte dopo l ultima pagina letta, non da quella dopo la prima', async () => {
    // Senza questo, «Carica altri» rileggerebbe pagine già scartate e la
    // seconda schermata tornerebbe mezza vuota.
    const c = catalogo(10)
    const conosciute = new Set<string>()
    for (let id = 1; id <= 35; id++) conosciute.add(`movie-${id}`)

    const out = await raccogliNonVisti(c.carica, conosciute, { quanti: 20 })

    expect(out.prossimaPagina).toBe(c.chiamate[c.chiamate.length - 1] + 1)
  })

  it('non sfoglia all infinito', async () => {
    // Se tutto è già visto, senza un tetto si continuerebbe a chiedere pagine
    // finché TMDB ne ha — centinaia di richieste per non mostrare niente.
    const c = catalogo(500)
    const conosciute = new Set<string>()
    for (let id = 1; id <= 10000; id++) conosciute.add(`movie-${id}`)

    const out = await raccogliNonVisti(c.carica, conosciute, { quanti: 20, maxPagine: 4 })

    expect(out.items).toEqual([])
    expect(c.chiamate).toHaveLength(4)
  })
})
