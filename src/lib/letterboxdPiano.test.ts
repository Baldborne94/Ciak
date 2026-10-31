import { describe, expect, it } from 'vitest'
import { chiaveFilm, type ExportLetterboxd, type FilmLetterboxd } from './letterboxd'
import { pianoImport } from './letterboxdPiano'
import type { MediaItem } from './types'

// Cosa entra in Ciak da Letterboxd: ciò che c'è già in Ciak vince sempre.

const item = (id: number, title: string, genreIds: number[] = []): MediaItem => ({
  id, mediaType: 'movie', title, originalTitle: null, overview: '', posterPath: `/p${id}.jpg`, backdropPath: null,
  releaseDate: null, voteAverage: 0, genreIds, originalLanguage: null,
})
const f = (nome: string, anno: number): FilmLetterboxd => ({ nome, anno })
const LEONE = f('The Lion King', 1994)
const PARASITE = f('Parasite', 2019)
const ORIZZONTI = f('Paths of Glory', 1957)
const WITCH = f('The Witch', 2015)
const SCONOSCIUTO = f('Un film che TMDB non ha', 2001)

const VUOTO: ExportLetterboxd = { visti: [], voti: [], diario: [], watchlist: [], miPiace: [], recensioni: [], liste: [] }
const abbinati = new Map<string, MediaItem | null>([
  [chiaveFilm(LEONE), item(8587, 'Il re leone', [16])],
  [chiaveFilm(PARASITE), item(496243, 'Parasite', [35, 53])],
  [chiaveFilm(ORIZZONTI), item(975, 'Orizzonti di gloria')],
  [chiaveFilm(WITCH), item(310131, 'The VVitch')],
  [chiaveFilm(SCONOSCIUTO), null],
])
const piano = (e: Partial<ExportLetterboxd>, esistenti: Parameters<typeof pianoImport>[3] = [], diario: Parameters<typeof pianoImport>[4] = [], liste: Parameters<typeof pianoImport>[5] = []) =>
  pianoImport('u1', { ...VUOTO, ...e }, abbinati, esistenti, diario, liste)

const esistente = (tmdb_id: number, campi: Partial<Parameters<typeof pianoImport>[3][number]> = {}) => ({
  tmdb_id, media_type: 'movie' as const, title: 'Titolo in Ciak', poster_path: null, genre_ids: [18], status: 'to_watch' as const,
  is_favorite: false, personal_rating: null, notes: null, watched_at: null, rewatch: false, ...campi,
})

describe('pianoImport', () => {
  it('un titolo nuovo: visto, col voto, la data, il «mi piace» e la recensione', () => {
    const p = piano({
      visti: [{ film: PARASITE, data: '2024-03-04' }],
      voti: [{ film: PARASITE, voto: 4.5, data: '2024-03-04' }],
      miPiace: [{ film: PARASITE }],
      recensioni: [{ film: PARASITE, testo: 'Capolavoro.', visto: '2024-03-04' }],
    })
    expect(p.titoli).toEqual([
      {
        user_id: 'u1', tmdb_id: 496243, media_type: 'movie', title: 'Parasite', poster_path: '/p496243.jpg', genre_ids: [35, 53],
        status: 'watched', is_favorite: true, personal_rating: 4.5, notes: 'Capolavoro.', watched_at: '2024-03-04', rewatch: false,
      },
    ])
    expect(p.conteggi).toMatchObject({ visti: 1, voti: 1, preferiti: 1, note: 1 })
  })

  it('ciò che c’è già in Ciak resta: voto, nota, data, titolo e generi', () => {
    const p = piano(
      { voti: [{ film: LEONE, voto: 3, data: '2024-01-02' }], recensioni: [{ film: LEONE, testo: 'Da Letterboxd', visto: null }] },
      [esistente(8587, { status: 'watched', personal_rating: 5, notes: 'Mia', watched_at: '2010-05-05' })],
    )
    // Niente da cambiare: non si riscrive.
    expect(p.titoli).toEqual([])
  })

  it('un titolo «da vedere» in Ciak e visto su Letterboxd diventa visto; mai il contrario', () => {
    const p = piano(
      { visti: [{ film: LEONE, data: '2024-01-02' }], watchlist: [{ film: PARASITE, data: null }] },
      [esistente(8587), esistente(496243, { status: 'watched', watched_at: '2020-01-01' })],
    )
    expect(p.titoli.map((t) => [t.tmdb_id, t.status, t.watched_at, t.title])).toEqual([[8587, 'watched', '2024-01-02', 'Titolo in Ciak']])
  })

  it('la watchlist entra come «da vedere», solo per i titoli che non ci sono', () => {
    const p = piano({ watchlist: [{ film: ORIZZONTI, data: '2025-05-05' }] })
    expect(p.titoli.map((t) => [t.tmdb_id, t.status, t.watched_at])).toEqual([[975, 'to_watch', null]])
    expect(p.conteggi.daVedere).toBe(1)
  })

  it('il diario: una visione per film e giorno, col voto e la recensione di quel giorno', () => {
    const p = piano(
      {
        diario: [
          { film: PARASITE, visto: '2024-03-04', voto: 4.5, rivisto: false },
          { film: PARASITE, visto: '2024-12-31', voto: 5, rivisto: true },
          { film: PARASITE, visto: '2024-12-31', voto: 5, rivisto: true },
        ],
        recensioni: [{ film: PARASITE, testo: 'Rivisto: ancora meglio.', visto: '2024-12-31' }],
      },
      [],
      // Questa visione c'è già.
      [{ tmdb_id: 496243, media_type: 'movie', watched_on: '2024-03-04' }],
    )
    expect(p.diario.map((d) => [d.watched_on, d.rating, d.note])).toEqual([['2024-12-31', 5, 'Rivisto: ancora meglio.']])
    // Il titolo è visto, con l'ultima visione e il voto più recente del diario.
    expect(p.titoli[0]).toMatchObject({ status: 'watched', watched_at: '2024-12-31', personal_rating: 5 })
  })

  it('le liste: nuove o aggiunte a quella col nome uguale; un film solo in una lista non diventa «da vedere»', () => {
    const p = piano(
      { liste: [{ nome: 'Folk horror', descrizione: 'Il bosco', film: [WITCH, SCONOSCIUTO, WITCH] }, { nome: 'Vuota', descrizione: null, film: [SCONOSCIUTO] }] },
      [],
      [],
      [{ id: 'l1', name: 'folk horror ' }],
    )
    expect(p.liste.map((l) => [l.nome, l.esistente, l.titoli.map((t) => t.id)])).toEqual([['Folk horror', 'l1', [310131]]])
    expect(p.titoli).toEqual([])
    expect(p.nonTrovati).toEqual([SCONOSCIUTO])
  })
})
