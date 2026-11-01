import { describe, it, expect } from 'vitest'
import { avanzamento, perVisione } from './filmografia'
import type { MediaItem } from './types'

function t(id: number, releaseDate: string | null, mediaType: 'movie' | 'tv' = 'movie'): MediaItem {
  return { id, mediaType, title: `T${id}`, releaseDate, posterPath: null, voteAverage: 7 } as MediaItem
}

const OGGI = '2026-11-01'
const titoli = [t(1, '1975-01-01'), t(2, '1980-05-01'), t(3, '2028-01-01'), t(4, null), t(1, '2001-01-01', 'tv')]
// Visto il film 1, non la serie 1: gli id sono unici solo dentro un tipo.
const visto = (i: MediaItem) => i.mediaType === 'movie' && i.id === 1

describe('filmografia da completare', () => {
  it('conta solo i titoli già usciti', () => {
    expect(avanzamento(titoli, visto, OGGI)).toEqual({ visti: 1, totale: 3 })
  })

  it('«mi mancano» toglie i visti e quelli non ancora usciti', () => {
    expect(perVisione(titoli, 'mancano', visto, OGGI).map((i) => `${i.mediaType}-${i.id}`)).toEqual(['movie-2', 'tv-1'])
  })

  it('«visti» e «tutti» fanno ciò che dicono', () => {
    expect(perVisione(titoli, 'visti', visto, OGGI)).toHaveLength(1)
    expect(perVisione(titoli, 'tutti', visto, OGGI)).toHaveLength(5)
  })
})
