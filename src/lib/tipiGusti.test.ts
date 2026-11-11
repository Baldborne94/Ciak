import { describe, it, expect } from 'vitest'
import { categoriaDelTitolo, contaPerTipo, serieDaRiconoscere, type TitoloPerTipo } from './tipiGusti'

const t = (tmdb_id: number, media_type: TitoloPerTipo['media_type'], genre_ids: number[]): TitoloPerTipo => ({ tmdb_id, media_type, genre_ids })

describe('Cosa guardi: anime e cartoni', () => {
  it('una serie animata salvata come «tv» è un anime se giapponese, se no un cartone', () => {
    // Il caso del Profilo: Konosuba e Gumball salvati dal catalogo erano
    // contati fra le Serie TV.
    expect(categoriaDelTitolo(t(65844, 'tv', [16, 35]), 'ja')).toBe('Anime')
    expect(categoriaDelTitolo(t(37606, 'tv', [16, 35]), 'en')).toBe('Cartoni')
  })

  it('finché la lingua non è arrivata resta una serie, invece di indovinare', () => {
    expect(categoriaDelTitolo(t(1, 'tv', [16]), undefined)).toBe('Serie TV')
    // una lingua che TMDB non dice è comunque una risposta: non è giapponese
    expect(categoriaDelTitolo(t(1, 'tv', [16]), null)).toBe('Cartoni')
  })

  it('i tipi salvati in Ciak valgono da soli, i film animati sono film d’animazione', () => {
    expect(categoriaDelTitolo(t(1, 'anime', []), undefined)).toBe('Anime')
    expect(categoriaDelTitolo(t(1, 'cartoon', []), undefined)).toBe('Cartoni')
    expect(categoriaDelTitolo(t(1, 'movie', [16]), 'ja')).toBe('Film d’animazione')
    expect(categoriaDelTitolo(t(1, 'movie', [28]), 'en')).toBe('Film')
    expect(categoriaDelTitolo(t(1, 'tv', [18]), 'ja')).toBe('Serie TV')
  })

  it('chiede la lingua solo delle serie animate', () => {
    expect(serieDaRiconoscere([t(1, 'tv', [16]), t(2, 'tv', [18]), t(3, 'movie', [16]), t(4, 'anime', [16])])).toEqual([{ tmdbId: 1, mediaType: 'tv' }])
  })

  it('conta per tipo, dal più guardato; un film e una serie con lo stesso numero non si confondono', () => {
    const conti = contaPerTipo(
      [t(42, 'tv', [16]), t(42, 'movie', [28]), t(7, 'tv', [16]), t(8, 'movie', [28]), t(9, 'tv', [18])],
      new Map([['tv-42', 'ja'], ['tv-7', 'en']]),
    )
    expect(conti).toEqual([
      { label: 'Film', count: 2 },
      { label: 'Anime', count: 1 },
      { label: 'Cartoni', count: 1 },
      { label: 'Serie TV', count: 1 },
    ])
  })
})
