import { describe, it, expect } from 'vitest'
import { missingTitleRows } from './diaryBackfill'
import type { DiaryEntry, MediaType, UserTitle } from './types'

function visione(over: Partial<DiaryEntry> & { watched_on: string }): DiaryEntry {
  return {
    id: `d-${Math.random()}`,
    user_id: 'u1',
    tmdb_id: 146233,
    media_type: 'movie' as MediaType,
    title: 'Prisoners',
    poster_path: '/p.jpg',
    rating: null,
    note: null,
    created_at: '2025-01-01T00:00:00Z',
    ...over,
  }
}

function scheda(over: Partial<UserTitle> = {}): UserTitle {
  return {
    id: 't-1',
    user_id: 'u1',
    tmdb_id: 146233,
    media_type: 'movie' as MediaType,
    title: 'Prisoners',
    poster_path: '/p.jpg',
    status: 'watched',
    is_favorite: false,
    personal_rating: null,
    notes: null,
    watched_at: null,
    genre_ids: [],
    rewatch: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...over,
  } as UserTitle
}

describe('missingTitleRows', () => {
  it('ricostruisce la scheda di una visione rimasta orfana', () => {
    const out = missingTitleRows([visione({ watched_on: '2025-03-01' })], [])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      tmdb_id: 146233,
      media_type: 'movie',
      title: 'Prisoners',
      status: 'watched',
      watched_at: '2025-03-01',
      personal_rating: null,
    })
  })

  it('non tocca i titoli che una scheda ce l hanno già', () => {
    expect(missingTitleRows([visione({ watched_on: '2025-03-01' })], [scheda()])).toEqual([])
  })

  it('lascia stare anche una scheda con stato diverso da "visto"', () => {
    // Una serie "in corso" non deve diventare "vista" per via di un episodio
    // registrato nel diario: la riparazione crea ciò che manca, non riscrive.
    const out = missingTitleRows(
      [visione({ watched_on: '2025-03-01' })],
      [scheda({ status: 'in_progress' })],
    )
    expect(out).toEqual([])
  })

  it('crea una sola scheda per un titolo rivisto più volte, con la data più recente', () => {
    const out = missingTitleRows(
      [
        visione({ watched_on: '2021-05-04' }),
        visione({ watched_on: '2025-03-01' }),
        visione({ watched_on: '2023-01-09' }),
      ],
      [],
    )
    expect(out).toHaveLength(1)
    expect(out[0].watched_at).toBe('2025-03-01')
  })

  it('recupera il voto della visione più recente che ne ha uno', () => {
    // Stessa regola dell'app dal vivo: una scheda ricostruita dev'essere
    // indistinguibile da una scritta al momento giusto.
    const out = missingTitleRows(
      [
        visione({ watched_on: '2025-03-01', rating: null }),
        visione({ watched_on: '2023-01-09', rating: 4 }),
        visione({ watched_on: '2021-05-04', rating: 2 }),
      ],
      [],
    )
    expect(out[0].personal_rating).toBe(4)
  })

  it('non confonde un film e una serie con lo stesso id TMDB', () => {
    const out = missingTitleRows(
      [
        visione({ tmdb_id: 550, media_type: 'movie', watched_on: '2025-03-01', title: 'Il film' }),
        visione({ tmdb_id: 550, media_type: 'tv', watched_on: '2025-03-02', title: 'La serie' }),
      ],
      [scheda({ tmdb_id: 550, media_type: 'movie' })],
    )
    // Il film ha già la sua scheda: va ricostruita solo quella della serie.
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ tmdb_id: 550, media_type: 'tv', title: 'La serie' })
  })

  it('ignora le visioni senza data', () => {
    expect(missingTitleRows([visione({ watched_on: '' })], [])).toEqual([])
  })

  it('su un diario già in ordine non fa niente', () => {
    expect(missingTitleRows([], [])).toEqual([])
  })
})
