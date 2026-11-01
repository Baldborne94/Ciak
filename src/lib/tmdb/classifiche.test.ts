import { describe, it, expect } from 'vitest'
import { parametriMigliori } from './classifiche'

// Ciò che «Da recuperare» chiede a /discover: è lì che una classifica di anime
// può diventare, per un AND scritto come OR, una classifica di horror dal vero.

describe('parametriMigliori', () => {
  it('ordina per voto con una soglia di voti, anche senza filtri', () => {
    expect(parametriMigliori('movie', {}, 2)).toEqual({ sort_by: 'vote_average.desc', 'vote_count.gte': '1000', page: '2' })
  })

  it('gli anime sono animazione in giapponese, e il genere scelto va in AND', () => {
    const p = parametriMigliori('tv', { animazione: true, lingua: 'ja', genreIds: [9648] }, 1)
    expect(p.with_genres).toBe('16,9648')
    expect(p.with_original_language).toBe('ja')
  })

  it('i generi che guardo restano in OR fra loro, ma sempre dentro l animazione', () => {
    expect(parametriMigliori('movie', { animazione: true, genreIds: [27, 35, 16] }, 1).with_genres).toBe('16,27|35')
  })

  it('fuori dall animazione il genere passa com è, e il decennio usa il campo giusto per il tipo', () => {
    const film = parametriMigliori('movie', { genreIds: [27], dal: '1970-01-01', al: '1979-12-31' }, 1)
    expect(film).toMatchObject({ with_genres: '27', 'primary_release_date.gte': '1970-01-01', 'primary_release_date.lte': '1979-12-31' })
    expect(parametriMigliori('tv', { dal: '1990-01-01' }, 1)['first_air_date.gte']).toBe('1990-01-01')
  })
})
