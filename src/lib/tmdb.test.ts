import { describe, it, expect } from 'vitest'
import {
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
