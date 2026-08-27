import { describe, it, expect } from 'vitest'
import { onThisDayFlashbacks } from './flashbacks'
import type { DiaryEntry, MediaType } from './types'

// Data fissa: il 12 giugno 2026. Iniettarla rende i test indipendenti dal
// giorno in cui girano — altrimenti sarebbero verdi solo per 24 ore l'anno.
const OGGI = new Date(2026, 5, 12)

function entry(over: Partial<DiaryEntry> & { watched_on: string }): DiaryEntry {
  return {
    id: `d-${Math.random()}`,
    user_id: 'u1',
    tmdb_id: 550,
    media_type: 'movie' as MediaType,
    title: 'Fight Club',
    poster_path: null,
    rating: null,
    note: null,
    created_at: '2020-01-01T00:00:00Z',
    ...over,
  }
}

describe('onThisDayFlashbacks', () => {
  it('tiene solo le visioni dello stesso giorno in anni passati', () => {
    const out = onThisDayFlashbacks(
      [
        entry({ watched_on: '2024-06-12', title: 'Ricordo giusto' }),
        entry({ watched_on: '2024-06-13', title: 'Giorno sbagliato' }),
        entry({ watched_on: '2026-06-12', title: 'Oggi, non un ricordo' }),
      ],
      OGGI,
    )
    expect(out.map((f) => f.entry.title)).toEqual(['Ricordo giusto'])
    expect(out[0].yearsAgo).toBe(2)
  })

  it('mette per primo il ricordo più lontano', () => {
    const out = onThisDayFlashbacks(
      [
        entry({ tmdb_id: 1, watched_on: '2025-06-12', title: 'Un anno fa' }),
        entry({ tmdb_id: 2, watched_on: '2019-06-12', title: 'Sette anni fa' }),
      ],
      OGGI,
    )
    expect(out.map((f) => f.entry.title)).toEqual(['Sette anni fa', 'Un anno fa'])
  })

  it('non confonde un film e una serie che condividono lo stesso id TMDB', () => {
    // Gli id TMDB sono unici solo dentro un tipo: deduplicando per solo numero
    // la serie spariva dai ricordi perché il film aveva "già preso" il 550.
    const out = onThisDayFlashbacks(
      [
        entry({ tmdb_id: 550, media_type: 'movie', watched_on: '2024-06-12', title: 'Il film' }),
        entry({ tmdb_id: 550, media_type: 'tv', watched_on: '2024-06-12', title: 'La serie' }),
      ],
      OGGI,
    )
    expect(out.map((f) => f.entry.title)).toEqual(['Il film', 'La serie'])
  })

  it('mostra una sola volta lo stesso titolo rivisto più volte nello stesso giorno', () => {
    const out = onThisDayFlashbacks(
      [
        entry({ tmdb_id: 550, watched_on: '2024-06-12' }),
        entry({ tmdb_id: 550, watched_on: '2022-06-12' }),
      ],
      OGGI,
    )
    expect(out).toHaveLength(1)
  })

  it('ignora le righe senza data', () => {
    expect(onThisDayFlashbacks([entry({ watched_on: '' })], OGGI)).toEqual([])
  })
})
