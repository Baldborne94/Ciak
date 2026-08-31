import { describe, it, expect } from 'vitest'
import {
  fallbackReadableTitle,
  isReadableTitle,
  displayTitle,
  posterUrl,
  backdropUrl,
  profileUrl,
  logoUrl,
} from './tmdb'

describe('isReadableTitle', () => {
  it('rifiuta valori vuoti o assenti', () => {
    expect(isReadableTitle(null)).toBe(false)
    expect(isReadableTitle(undefined)).toBe(false)
    expect(isReadableTitle('')).toBe(false)
  })

  it('accetta titoli in alfabeto latino (anche con accenti)', () => {
    expect(isReadableTitle('Naruto')).toBe(true)
    expect(isReadableTitle("L'attacco dei giganti")).toBe(true)
    expect(isReadableTitle('Léon: The Professional')).toBe(true)
  })

  it('rifiuta CJK, Hangul e cirillico', () => {
    expect(isReadableTitle('進撃の巨人')).toBe(false) // giapponese
    expect(isReadableTitle('오징어 게임')).toBe(false) // coreano
    expect(isReadableTitle('Брат')).toBe(false) // russo
  })
})

describe('displayTitle', () => {
  it('preferisce il titolo originale quando la lingua è in alfabeto latino', () => {
    expect(
      displayTitle({ title: 'Il padrino', originalTitle: 'The Godfather', originalLanguage: 'en' }),
    ).toBe('The Godfather')
  })

  it('usa il titolo localizzato per lingue non latine', () => {
    expect(
      displayTitle({
        title: "L'attacco dei giganti",
        originalTitle: '進撃の巨人',
        originalLanguage: 'ja',
      }),
    ).toBe("L'attacco dei giganti")
  })

  it('ripiega sul titolo originale se il localizzato non è leggibile', () => {
    expect(
      displayTitle({ title: '오징어 게임', originalTitle: 'Squid Game', originalLanguage: 'ko' }),
    ).toBe('Squid Game')
  })

  it('non resta mai senza titolo', () => {
    expect(displayTitle({ title: '', originalTitle: null, originalLanguage: null })).toBe(
      'Senza titolo',
    )
  })
})

describe('image URLs', () => {
  it('costruisce gli URL con la size giusta', () => {
    expect(posterUrl('/x.jpg')).toBe('https://image.tmdb.org/t/p/w342/x.jpg')
    expect(posterUrl('/x.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/x.jpg')
    expect(backdropUrl('/b.jpg')).toBe('https://image.tmdb.org/t/p/w1280/b.jpg')
    expect(profileUrl('/p.jpg')).toBe('https://image.tmdb.org/t/p/w185/p.jpg')
    expect(logoUrl('/l.png')).toBe('https://image.tmdb.org/t/p/w154/l.png')
  })

  it('torna null senza path (niente placeholder rotti)', () => {
    expect(posterUrl(null)).toBeNull()
    expect(backdropUrl(null)).toBeNull()
    expect(profileUrl(null)).toBeNull()
    expect(logoUrl(null)).toBeNull()
  })
})

describe('fallbackReadableTitle', () => {
  // Caso vero: 剑来院线剧场版 十三之争 (film cinese del 2026). TMDB non ha una
  // traduzione inglese, ma il titolo internazionale della locandina è fra i
  // titoli alternativi: senza pescarlo lì, la scheda resta illeggibile.
  it('pesca il titolo internazionale dai titoli alternativi quando manca la traduzione inglese', () => {
    expect(
      fallbackReadableTitle(null, [
        { iso_3166_1: 'CN', title: '剑来院线剧场版 十三之争' },
        { iso_3166_1: 'US', title: 'The 13th Sword' },
      ]),
    ).toBe('The 13th Sword')
  })

  it('preferisce la traduzione inglese a tutto il resto', () => {
    expect(
      fallbackReadableTitle(
        'The Last Ronin',
        [{ iso_3166_1: 'US', title: 'Titolo alternativo' }],
        [{ iso_639_1: 'fr', data: { title: 'Le Dernier Ronin' } }],
      ),
    ).toBe('The Last Ronin')
  })

  it('fra i titoli alternativi preferisce l edizione US/GB', () => {
    expect(
      fallbackReadableTitle(null, [
        { iso_3166_1: 'BR', title: 'O Décimo Terceiro' },
        { iso_3166_1: 'GB', title: 'The 13th Sword' },
      ]),
    ).toBe('The 13th Sword')
  })

  it('accetta un alternativo di qualsiasi paese se US/GB non ci sono', () => {
    expect(fallbackReadableTitle(null, [{ iso_3166_1: 'BR', title: 'O Décimo Terceiro' }])).toBe(
      'O Décimo Terceiro',
    )
  })

  it('ignora gli alternativi ancora in script non leggibile', () => {
    expect(
      fallbackReadableTitle(null, [
        { iso_3166_1: 'JP', title: '進撃の巨人' },
        { iso_3166_1: 'KR', title: '오징어 게임' },
      ]),
    ).toBeNull()
  })

  it('ripiega su un altra traduzione quando non c e nient altro', () => {
    // Un titolo francese è comunque più utile di una riga di ideogrammi.
    expect(
      fallbackReadableTitle(null, [], [
        { iso_639_1: 'zh', data: { title: '剑来院线剧场版' } },
        { iso_639_1: 'es', data: { title: 'La Decimotercera Espada' } },
      ]),
    ).toBe('La Decimotercera Espada')
  })

  it('usa "name" per le serie, dove il titolo non si chiama "title"', () => {
    expect(fallbackReadableTitle(null, [], [{ iso_639_1: 'de', data: { name: 'Der Schwertmeister' } }])).toBe(
      'Der Schwertmeister',
    )
  })

  it('torna null quando davvero non esiste nulla di leggibile', () => {
    expect(fallbackReadableTitle(null, [], [])).toBeNull()
  })
})

// ── La facciata e i moduli dietro ─────────────────────────────────────────
// `tmdb.ts` era 1376 righe: il modulo-discarica dove finiva ogni funzione
// nuova perché era comodo. Ora è una facciata su `src/lib/tmdb/`. Questi due
// test tengono in piedi la divisione, che altrimenti si sfalda in silenzio —
// la prima funzione rimessa nel posto sbagliato non se ne accorge nessuno.

describe('la facciata di tmdb', () => {
  it('espone tutto ciò che l app usa', async () => {
    // L'elenco è scritto a mano di proposito: se una funzione sparisce dalla
    // facciata durante uno spostamento, questo test lo dice invece di lasciare
    // che se ne accorga una pagina a runtime.
    const attesi = [
      'backdropUrl', 'discoverByCompany', 'discoverByGenre', 'discoverByGenres',
      'displayTitle', 'fallbackReadableTitle', 'fetchTitleFacts', 'getAnime',
      'getCartoons', 'getCollection', 'getCompany', 'getDetail', 'getGenres',
      'getPersonDetail', 'getPervertitoAnime', 'getRecentReleases',
      'getRecommendations', 'getRelatedCollections', 'getReleaseYears',
      'getSagaContinuations', 'getSeason', 'getTrending', 'getUpcoming',
      'isReadableTitle', 'logoUrl', 'posterUrl', 'profileUrl',
      'resolveKeywordIds', 'resolvePeople', 'resolveSagaIds', 'resolveSagas',
      'resolveStudios', 'resolveSuggestions', 'searchCollection',
      'searchCompany', 'searchMulti', 'searchPerson', 'tmdbConfigurato',
    ]
    const modulo = await import('./tmdb')
    expect(Object.keys(modulo).sort()).toEqual(attesi)
  })

  it('nessun modulo del catalogo torna a essere una discarica', async () => {
    // Il tetto non è sacro: se un modulo lo supera davvero, si divide ancora
    // (per esempio `browse` in ricerca e sfoglia). Quello che non deve
    // succedere è tornarci per inerzia, una funzione alla volta.
    const { readdirSync, readFileSync } = await import('node:fs')
    const dir = new URL('./tmdb/', import.meta.url)
    const TETTO = 400
    for (const nome of readdirSync(dir)) {
      const righe = readFileSync(new URL(nome, dir), 'utf8').split('\n').length
      expect(righe, `${nome} ha ${righe} righe`).toBeLessThanOrEqual(TETTO)
    }
  })
})
