import { describe, expect, it } from 'vitest'
import { abbinaTitolo, somiglianza } from './abbinaTitoloAi'
import type { MediaItem } from './types'

// I titoli proposti dall'AI, abbinati a TMDB: i due casi veri che sbagliava
// («Stasera» proponeva un drama coreano al posto di The Witch di Eggers, già
// visto, e un horror spagnolo al posto di The Wailing).

function titolo(over: Partial<MediaItem> & Pick<MediaItem, 'id' | 'mediaType' | 'title'>): MediaItem {
  return {
    originalTitle: null,
    overview: '',
    posterPath: null,
    backdropPath: null,
    releaseDate: null,
    voteAverage: 0,
    genreIds: [],
    originalLanguage: null,
    ...over,
  }
}

const DRAMA_THE_WITCH = titolo({ id: 245703, mediaType: 'tv', title: 'The Witch', originalTitle: '마녀', englishTitle: 'The Witch', releaseDate: '2025-02-15', voteAverage: 8.2 })
const EGGERS = titolo({
  id: 310131,
  mediaType: 'movie',
  title: 'The VVitch',
  originalTitle: 'The VVitch: A New-England Folktale',
  englishTitle: 'The Witch',
  releaseDate: '2015-01-27',
  voteAverage: 6.9,
})
const GOKSUNG = titolo({
  id: 293670,
  mediaType: 'movie',
  title: 'Goksung - La presenza del diavolo',
  originalTitle: '곡성',
  englishTitle: 'The Wailing',
  releaseDate: '2016-05-12',
  voteAverage: 7.4,
})
const EL_LLANTO = titolo({ id: 1146302, mediaType: 'movie', title: 'The Wailing', originalTitle: 'El llanto', englishTitle: 'The Wailing', releaseDate: '2024-09-26', voteAverage: 6.1 })

describe('abbinaTitolo', () => {
  it('The Witch (2015, film) è quello di Eggers, non il drama omonimo del 2025', () => {
    expect(abbinaTitolo({ titolo: 'The Witch', anno: '2015', tipo: 'movie' }, [DRAMA_THE_WITCH, EGGERS])).toBe(EGGERS)
  })

  it('The Wailing (2016) è il film coreano, anche se in italiano si chiama Goksung', () => {
    expect(abbinaTitolo({ titolo: 'The Wailing', anno: 2016, tipo: 'movie' }, [EL_LLANTO, GOKSUNG])).toBe(GOKSUNG)
  })

  it('anche senza il tipo, l’anno basta a separare gli omonimi', () => {
    expect(abbinaTitolo({ titolo: 'The Witch', anno: '2015' }, [DRAMA_THE_WITCH, EGGERS])).toBe(EGGERS)
  })

  it('un anno di scarto (festival, uscita in sala) è ancora lo stesso titolo', () => {
    expect(abbinaTitolo({ titolo: 'The Witch', anno: '2016', tipo: 'movie' }, [DRAMA_THE_WITCH, EGGERS])).toBe(EGGERS)
  })

  it('senza anno né tipo, a parità di titolo vince il più noto', () => {
    expect(abbinaTitolo({ titolo: 'The Wailing' }, [EL_LLANTO, GOKSUNG])).toBe(GOKSUNG)
  })

  it('un risultato che non somiglia al titolo non si abbina: meglio niente che la scheda di un altro film', () => {
    const altro = titolo({ id: 1, mediaType: 'movie', title: 'Paprika', originalTitle: 'パプリカ', releaseDate: '2015-01-01', voteAverage: 9 })
    expect(abbinaTitolo({ titolo: 'The Witch', anno: '2015', tipo: 'movie' }, [altro])).toBeNull()
    expect(abbinaTitolo({ titolo: 'The Witch' }, [])).toBeNull()
  })

  it('accenti e punteggiatura non contano', () => {
    const amelie = titolo({ id: 194, mediaType: 'movie', title: 'Il favoloso mondo di Amélie', originalTitle: 'Le Fabuleux Destin d’Amélie Poulain', releaseDate: '2001-04-25' })
    expect(abbinaTitolo({ titolo: 'Le fabuleux destin d’Amelie Poulain', anno: 2001 }, [amelie])).toBe(amelie)
  })
})

describe('somiglianza', () => {
  it('va da 0 (niente in comune) a 1 (identici)', () => {
    expect(somiglianza('thewitch', 'thewitch')).toBe(1)
    expect(somiglianza('thewitch', 'thevvitch')).toBeGreaterThan(0.5)
    expect(somiglianza('thewailing', 'goksunglapresenzadeldiavolo')).toBeLessThan(0.3)
    expect(somiglianza('', 'thewitch')).toBe(0)
  })
})
