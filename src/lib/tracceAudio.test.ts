import { beforeEach, describe, expect, it } from 'vitest'
import {
  fileAudioDelVideo,
  indiceAudio,
  leggiElencoAudio,
  leggiLinguaAudio,
  nomeElencoAudio,
  nomeLinguaAudio,
  nomiTracceAudio,
  salvaLinguaAudio,
  siglaTracciaAudio,
  type TracciaAudio,
} from './tracceAudio'

beforeEach(() => {
  const dati = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => dati.get(k) ?? null,
    setItem: (k: string, v: string) => void dati.set(k, v),
    removeItem: (k: string) => void dati.delete(k),
    clear: () => dati.clear(),
    key: () => null,
    length: 0,
  }
})

const f = (id: string, name: string, mimeType = 'application/octet-stream') => ({ id, name, mimeType })

// Come lo scrive prepara-ciak: la prima traccia sta nel video, le altre accanto.
const elenco = JSON.stringify({
  versione: 1,
  tracce: [
    { indice: 1, lingua: 'jpn', titolo: '', file: null },
    { indice: 2, lingua: 'it', titolo: '', file: 'Ep 1.audio-2.m4a' },
  ],
})

describe('leggiElencoAudio', () => {
  const vicini = [f('v1', 'Ep 1.mp4', 'video/mp4'), f('a2', 'Ep 1.audio-2.m4a', 'audio/mp4'), f('j', 'Ep 1.audio.json')]

  it('risolve i file delle tracce negli id di Drive', () => {
    expect(leggiElencoAudio(elenco, vicini)).toEqual([
      { indice: 1, lingua: 'jpn', titolo: '', fileId: null },
      { indice: 2, lingua: 'it', titolo: '', fileId: 'a2' },
    ])
  })

  it('accetta un BOM davanti, come lo lascia il Blocco note', () => {
    expect(leggiElencoAudio('\uFEFF' + elenco, vicini)).toHaveLength(2)
  })

  it('non offre una traccia il cui file su Drive manca', () => {
    // Rimasta la sola traccia del video: niente da scegliere.
    expect(leggiElencoAudio(elenco, [f('v1', 'Ep 1.mp4')])).toEqual([])
  })

  it('con una lingua sola, o un file rotto, non c’è menu', () => {
    const una = JSON.stringify({ versione: 1, tracce: [{ indice: 1, lingua: null, titolo: '', file: null }] })
    expect(leggiElencoAudio(una, vicini)).toEqual([])
    expect(leggiElencoAudio('{non è json', vicini)).toEqual([])
    expect(leggiElencoAudio('{"tracce": 3}', vicini)).toEqual([])
  })
})

describe('i file delle lingue di un video', () => {
  it('sono l’elenco e i .m4a col suo nome, non quelli di un altro episodio', () => {
    const vicini = [
      f('v1', 'Ep 1.mp4'),
      f('a', 'Ep 1.audio-2.m4a'),
      f('b', 'Ep 1.audio-3.m4a'),
      f('j', 'Ep 1.audio.json'),
      f('x', 'Ep 10.audio-2.m4a'),
      f('s', 'Ep 1.it.srt'),
    ]
    expect(fileAudioDelVideo('Ep 1.mp4', vicini).map((x) => x.id)).toEqual(['a', 'b', 'j'])
    expect(nomeElencoAudio('Ep 1.mp4')).toBe('Ep 1.audio.json')
  })

  it('un nome con caratteri speciali non rompe la ricerca', () => {
    const vicini = [f('a', 'Film (2001) [x].audio-2.m4a'), f('b', 'Film (2001) [x]X.audio-2.m4a')]
    expect(fileAudioDelVideo('Film (2001) [x].mp4', vicini).map((x) => x.id)).toEqual(['a'])
  })
})

describe('i nomi nel menu', () => {
  const t = (indice: number, lingua: string | null, titolo = ''): TracciaAudio => ({ indice, lingua, titolo, fileId: indice === 1 ? null : `f${indice}` })

  it('le lingue in italiano, a due o tre lettere', () => {
    expect(nomeLinguaAudio('jpn')).toBe('Giapponese')
    expect(nomeLinguaAudio('it')).toBe('Italiano')
    expect(nomeLinguaAudio('ger')).toBe('Tedesco')
    expect(nomeLinguaAudio('xyz')).toBe('XYZ')
    expect(nomeLinguaAudio(null)).toBeNull()
  })

  it('una lingua ripetuta si distingue col titolo o col numero', () => {
    expect(nomiTracceAudio([t(1, 'en'), t(2, 'it'), t(3, 'en', 'Commento')])).toEqual(['Inglese 1', 'Italiano', 'Inglese · Commento'])
    expect(nomiTracceAudio([t(1, 'en'), t(2, 'eng')])).toEqual(['Inglese 1', 'Inglese 2'])
    expect(nomiTracceAudio([t(1, null), t(2, 'it')])).toEqual(['Traccia 1', 'Italiano'])
  })

  it('la sigla sul pulsante', () => {
    expect(siglaTracciaAudio(t(1, 'jpn'))).toBe('JA')
    expect(siglaTracciaAudio(t(2, 'it'))).toBe('IT')
    expect(siglaTracciaAudio(t(2, null))).toBe('2')
    expect(siglaTracciaAudio(t(2, 'xyz'))).toBe('XY')
  })
})

describe('la lingua ricordata', () => {
  const tracce: TracciaAudio[] = [
    { indice: 1, lingua: 'jpn', titolo: '', fileId: null },
    { indice: 2, lingua: 'it', titolo: '', fileId: 'a' },
  ]

  it('si ricorda per serie, e «ita» vale «it»', () => {
    salvaLinguaAudio('tv-1', 'ita')
    expect(leggiLinguaAudio('tv-1')).toBe('ita')
    expect(leggiLinguaAudio('tv-2')).toBeNull()
    expect(indiceAudio(tracce, leggiLinguaAudio('tv-1'))).toBe(1)
  })

  it('una lingua che manca in questo video vuol dire la traccia del video', () => {
    expect(indiceAudio(tracce, 'en')).toBe(0)
    expect(indiceAudio(tracce, null)).toBe(0)
  })

  it('tornare alla prima traccia dimentica la scelta', () => {
    salvaLinguaAudio('film', 'it')
    salvaLinguaAudio('film', null)
    expect(leggiLinguaAudio('film')).toBeNull()
  })
})
