import { describe, it, expect } from 'vitest'
import { intestazioni, leggiEpisodio, normalizzaSigle, urlTheIntroDb } from './sigle'

describe('leggiEpisodio', () => {
  it('vuole tre numeri: serie, stagione, episodio', () => {
    expect(leggiEpisodio({ tmdb_id: '2190', season: '3', episode: '6' })).toEqual({ tmdbId: 2190, stagione: 3, episodio: 6 })
    expect(leggiEpisodio({ tmdb_id: '1429', season: '0', episode: '8' })).toEqual({ tmdbId: 1429, stagione: 0, episodio: 8 })
  })

  it('rifiuta tutto il resto, prima di girarlo a TheIntroDB', () => {
    expect(leggiEpisodio({ tmdb_id: '2190', season: '3' })).toBeNull()
    expect(leggiEpisodio({ tmdb_id: '2190&x=1', season: '3', episode: '6' })).toBeNull()
    expect(leggiEpisodio({ tmdb_id: '-1', season: '3', episode: '6' })).toBeNull()
    expect(leggiEpisodio({})).toBeNull()
  })
})

describe('urlTheIntroDb', () => {
  it('solo i tre parametri, nell’indirizzo giusto', () => {
    expect(urlTheIntroDb({ tmdbId: 2190, stagione: 3, episodio: 6 })).toBe(
      'https://api.theintrodb.org/v3/media?tmdb_id=2190&season=3&episode=6',
    )
  })
})

describe('normalizzaSigle', () => {
  it('in secondi: dove inizia e finisce la sigla, e dove partono i titoli di coda', () => {
    expect(
      normalizzaSigle({
        intro: [{ start_ms: 32_000, end_ms: 122_500 }],
        recap: [],
        credits: [{ start_ms: 1_265_000, end_ms: null }],
      }),
    ).toEqual({ inizio: { da: 32, a: 122.5 }, finale: { da: 1265 } })
  })

  it('una sigla in apertura senza inizio parte da zero', () => {
    expect(normalizzaSigle({ intro: [{ start_ms: null, end_ms: 90_000 }] })).toEqual({ inizio: { da: 0, a: 90 }, finale: null })
  })

  it('dove non c’è (o è a lunghezza zero) non si salta niente', () => {
    expect(normalizzaSigle({ intro: [{ start_ms: 0, end_ms: 0 }], credits: [{ start_ms: 0, end_ms: 0 }] })).toEqual({ inizio: null, finale: null })
    expect(normalizzaSigle({})).toEqual({ inizio: null, finale: null })
    expect(normalizzaSigle(null)).toEqual({ inizio: null, finale: null })
    expect(normalizzaSigle({ intro: 'rotto', credits: [{ start_ms: 'x' }] })).toEqual({ inizio: null, finale: null })
  })
})

describe('intestazioni', () => {
  it('Ciak si presenta per nome: col nome generico di Node TheIntroDB rispondeva 403', () => {
    const h = intestazioni(undefined)
    expect(h['User-Agent']).toMatch(/^Ciak\//)
    expect(h.Accept).toBe('application/json')
    expect(h.Authorization).toBeUndefined()
  })

  it('con una chiave sul server la manda come Bearer, e una vuota non conta', () => {
    expect(intestazioni(' abc123 ').Authorization).toBe('Bearer abc123')
    expect(intestazioni('   ').Authorization).toBeUndefined()
  })
})
