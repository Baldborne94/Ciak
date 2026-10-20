import { describe, expect, it } from 'vitest'
import { prossimoEpisodio } from './prossimoEpisodio'

// L'episodio che «Riprendi a guardare» propone: quello dopo l'ultimo visto,
// come la videoteca (prossimoDaGuardare), non il primo buco dall'inizio. Chi
// sta guardando la nona stagione non va rimandato alla sesta per un episodio
// saltato.

const STAGIONI = [
  { seasonNumber: 1, episodeCount: 3 },
  { seasonNumber: 2, episodeCount: 2 },
]

describe('prossimoEpisodio', () => {
  it('riparte dopo l’ultimo visto, anche se prima c’è un buco', () => {
    const visti = new Set(['1-1', '1-3', '2-1'])
    expect(prossimoEpisodio(STAGIONI, visti, '2-1')).toEqual({ season: 2, episode: 2 })
  })

  it('l’ultimo visto è in fondo: torna al primo buco', () => {
    const visti = new Set(['1-1', '1-3', '2-1', '2-2'])
    expect(prossimoEpisodio(STAGIONI, visti, '2-2')).toEqual({ season: 1, episode: 2 })
  })

  it('senza episodi visti si parte dal primo', () => {
    expect(prossimoEpisodio(STAGIONI, new Set(), null)).toEqual({ season: 1, episode: 1 })
  })

  it('tutto visto: niente da riprendere', () => {
    expect(prossimoEpisodio(STAGIONI, new Set(['1-1', '1-2', '1-3', '2-1', '2-2']), '1-2')).toBeNull()
  })

  it('gli speciali (stagione 0) non contano', () => {
    expect(prossimoEpisodio([{ seasonNumber: 0, episodeCount: 4 }, ...STAGIONI], new Set(), null)).toEqual({ season: 1, episode: 1 })
  })
})
