import { describe, it, expect } from 'vitest'
import { parseYoutubeKey } from './youtubeKey'

const KEY = 'dQw4w9WgXcQ'

describe('parseYoutubeKey', () => {
  it('accetta il link della barra degli indirizzi', () => {
    expect(parseYoutubeKey(`https://www.youtube.com/watch?v=${KEY}`)).toBe(KEY)
  })

  it('accetta il link breve del pulsante Condividi', () => {
    expect(parseYoutubeKey(`https://youtu.be/${KEY}`)).toBe(KEY)
    // Con i parametri che YouTube ci attacca (istante di partenza, tracciamento).
    expect(parseYoutubeKey(`https://youtu.be/${KEY}?t=42&si=abc`)).toBe(KEY)
  })

  it('accetta embed, shorts e /v/', () => {
    expect(parseYoutubeKey(`https://www.youtube.com/embed/${KEY}`)).toBe(KEY)
    expect(parseYoutubeKey(`https://www.youtube.com/shorts/${KEY}`)).toBe(KEY)
    expect(parseYoutubeKey(`https://www.youtube.com/v/${KEY}`)).toBe(KEY)
  })

  it('accetta l id incollato da solo', () => {
    expect(parseYoutubeKey(KEY)).toBe(KEY)
    expect(parseYoutubeKey(`  ${KEY}  `)).toBe(KEY)
  })

  it('accetta un link senza https e la versione mobile', () => {
    expect(parseYoutubeKey(`youtu.be/${KEY}`)).toBe(KEY)
    expect(parseYoutubeKey(`m.youtube.com/watch?v=${KEY}`)).toBe(KEY)
  })

  it('non accetta link di altri siti', () => {
    // Vimeo o un accorciatore qualsiasi non vanno bene: l'app incorpora YouTube.
    expect(parseYoutubeKey('https://vimeo.com/123456')).toBeNull()
    expect(parseYoutubeKey('https://esempio.it/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('non accetta un id di lunghezza sbagliata', () => {
    // Gli id YouTube sono esattamente 11 caratteri: né 5 né 15.
    expect(parseYoutubeKey('https://youtu.be/corto')).toBeNull()
    expect(parseYoutubeKey('https://youtu.be/moltopiulungodiundici')).toBeNull()
    expect(parseYoutubeKey('abc')).toBeNull()
  })

  it('non accetta testo vuoto o spazzatura', () => {
    expect(parseYoutubeKey('')).toBeNull()
    expect(parseYoutubeKey('   ')).toBeNull()
    expect(parseYoutubeKey('non è un link')).toBeNull()
  })
})
