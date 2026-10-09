import { describe, expect, it } from 'vitest'
import { cartellaDaChiudere, pianoCestino as piano, type PianoCestino } from './cestinoDrive'

const pianoCestino = (a: Omit<Parameters<typeof piano>[0], 'radice'>): PianoCestino => piano({ ...a, radice: 'Ciak' })

const video = { id: 'v1', name: 'Song.of.the.Sea.2014.1080p.mp4' }
const srtIt = { id: 's-it', name: 'Song.of.the.Sea.it.srt', mimeType: 'application/x-subrip' }
const srtEn = { id: 's-en', name: 'Song.of.the.Sea.en.srt', mimeType: 'application/x-subrip' }
const me = { ...video, mimeType: 'video/mp4' }
const cartellaFilm = { id: 'c-song', name: 'Song of the Sea (2014) [1080p]' }

describe('pianoCestino', () => {
  it('la cartella dedicata del film, rimasta vuota, va nel cestino intera', () => {
    expect(
      pianoCestino({ video, cartella: cartellaFilm, vicini: [me, srtIt, srtEn], sottocartelle: 0, nomeCartellaSopra: 'FILM' }),
    ).toEqual({ file: [], cartella: 'c-song' })
  })

  it('con altro dentro la cartella si cestinano solo il video e i suoi sottotitoli', () => {
    const altro = { id: 'v2', name: '02 Spontaneous Combustion.mp4', mimeType: 'video/mp4' }
    const ep = { id: 'v1', name: '01 Rainforest Shmainforest.mp4' }
    const suo = { id: 's1', name: '01 Rainforest Shmainforest.it.srt', mimeType: 'application/x-subrip' }
    const nonSuo = { id: 's2', name: '02 Spontaneous Combustion.it.srt', mimeType: 'application/x-subrip' }
    expect(
      pianoCestino({
        video: ep,
        cartella: { id: 'c-s03', name: 'Season 03' },
        vicini: [{ ...ep, mimeType: 'video/mp4' }, altro, suo, nonSuo],
        sottocartelle: 0,
        nomeCartellaSopra: 'South Park',
      }),
    ).toEqual({ file: ['v1', 's1'], cartella: null })
  })

  it('le lingue dell’audio vanno col video: con loro la cartella resta vuota', () => {
    const m4a = { id: 'a2', name: 'Song.of.the.Sea.2014.1080p.audio-2.m4a', mimeType: 'audio/mp4' }
    const elenco = { id: 'aj', name: 'Song.of.the.Sea.2014.1080p.audio.json', mimeType: 'application/json' }
    expect(
      pianoCestino({ video, cartella: cartellaFilm, vicini: [me, srtIt, m4a, elenco], sottocartelle: 0, nomeCartellaSopra: 'FILM' }),
    ).toEqual({ file: [], cartella: 'c-song' })

    // In una stagione, uno per uno, e non quelle dell'episodio accanto.
    const ep = { id: 'v1', name: '01.mp4', mimeType: 'video/mp4' }
    const vicini = [
      ep,
      { id: 'v2', name: '02.mp4', mimeType: 'video/mp4' },
      { id: 'a1', name: '01.audio-2.m4a', mimeType: 'audio/mp4' },
      { id: 'j1', name: '01.audio.json', mimeType: 'application/json' },
      { id: 'a2', name: '02.audio-2.m4a', mimeType: 'audio/mp4' },
    ]
    expect(
      pianoCestino({ video: ep, cartella: { id: 'c', name: 'Season 01' }, vicini, sottocartelle: 0, nomeCartellaSopra: 'Shogun' }),
    ).toEqual({ file: ['v1', 'a1', 'j1'], cartella: null })
  })

  it('una sottocartella (gli extra) tiene in vita la cartella', () => {
    expect(pianoCestino({ video, cartella: cartellaFilm, vicini: [me], sottocartelle: 1, nomeCartellaSopra: 'FILM' })).toEqual({
      file: ['v1'],
      cartella: null,
    })
  })

  it('«Ciak» e le categorie subito sotto non si cestinano mai, nemmeno vuote', () => {
    expect(pianoCestino({ video, cartella: { id: 'c-film', name: 'FILM' }, vicini: [me], sottocartelle: 0, nomeCartellaSopra: 'Ciak' })).toEqual({
      file: ['v1'],
      cartella: null,
    })
    expect(pianoCestino({ video, cartella: { id: 'c-ciak', name: 'Ciak' }, vicini: [me], sottocartelle: 0, nomeCartellaSopra: null })).toEqual({
      file: ['v1'],
      cartella: null,
    })
  })

  it('senza sapere cosa c’è sopra, meglio i soli file', () => {
    expect(pianoCestino({ video, cartella: cartellaFilm, vicini: [me, srtIt], sottocartelle: 0, nomeCartellaSopra: null })).toEqual({
      file: ['v1', 's-it'],
      cartella: null,
    })
    expect(pianoCestino({ video, cartella: null, vicini: [], sottocartelle: 0, nomeCartellaSopra: null })).toEqual({ file: ['v1'], cartella: null })
  })
})

describe('pianoCestino con più video (una serie, una saga)', () => {
  const ep1 = { id: 'v1', name: '01 Rainforest Shmainforest.mp4' }
  const ep2 = { id: 'v2', name: '02 Spontaneous Combustion.mp4' }
  const sub1 = { id: 's1', name: '01 Rainforest Shmainforest.it.srt', mimeType: 'application/x-subrip' }
  const stagione = { id: 'c-s03', name: 'Season 03' }

  it('tutti i video della stagione: va nel cestino la cartella intera, con una richiesta sola', () => {
    expect(
      pianoCestino({
        video: [ep1, ep2],
        cartella: stagione,
        vicini: [{ ...ep1, mimeType: 'video/mp4' }, { ...ep2, mimeType: 'video/mp4' }, sub1],
        sottocartelle: 0,
        nomeCartellaSopra: 'South Park',
      }),
    ).toEqual({ file: [], cartella: 'c-s03' })
  })

  it('se nella cartella resta altro, i video e i loro sottotitoli uno per uno', () => {
    const film = { id: 'f', name: 'Alien.1979.mp4', mimeType: 'video/mp4' }
    expect(
      pianoCestino({
        video: [ep1],
        cartella: { id: 'c-film', name: 'Raccolta' },
        vicini: [{ ...ep1, mimeType: 'video/mp4' }, sub1, film],
        sottocartelle: 0,
        nomeCartellaSopra: 'FILM',
      }),
    ).toEqual({ file: ['v1', 's1'], cartella: null })
  })
})

describe('cartellaDaChiudere', () => {
  it('la cartella della serie, rimasta vuota dopo le stagioni, va nel cestino', () => {
    expect(cartellaDaChiudere({ nome: 'South Park', nomeSopra: 'SERIE TV', file: 0, sottocartelle: 0, radice: 'Ciak' })).toBe(true)
  })

  it('con qualcosa dentro resta', () => {
    expect(cartellaDaChiudere({ nome: 'South Park', nomeSopra: 'SERIE TV', file: 1, sottocartelle: 0, radice: 'Ciak' })).toBe(false)
    expect(cartellaDaChiudere({ nome: 'South Park', nomeSopra: 'SERIE TV', file: 0, sottocartelle: 2, radice: 'Ciak' })).toBe(false)
  })

  it('le categorie e «Ciak» restano sempre, anche vuote', () => {
    expect(cartellaDaChiudere({ nome: 'SERIE TV', nomeSopra: 'Ciak', file: 0, sottocartelle: 0, radice: 'Ciak' })).toBe(false)
    expect(cartellaDaChiudere({ nome: 'Ciak', nomeSopra: null, file: 0, sottocartelle: 0, radice: 'Ciak' })).toBe(false)
  })
})
