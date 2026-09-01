import { describe, it, expect } from 'vitest'
import {
  FILTRI_VUOTI,
  contaFiltriAttivi,
  filtriAttivi,
  generiPresenti,
  passaIFiltri,
  type VoceFiltrabile,
} from './diaryFilters'
import type { MediaType } from './types'

function voce(over: Partial<VoceFiltrabile> = {}): VoceFiltrabile {
  return {
    mediaType: 'movie' as MediaType,
    genreIds: [27],
    testo: 'hereditary — che disagio',
    anno: '2026',
    voto: 4,
    haNota: true,
    ...over,
  }
}

describe('passaIFiltri', () => {
  it('senza filtri passa tutto', () => {
    expect(passaIFiltri(voce(), FILTRI_VUOTI)).toBe(true)
  })

  it('filtra per anno di visione', () => {
    expect(passaIFiltri(voce({ anno: '2025' }), { ...FILTRI_VUOTI, anno: '2026' })).toBe(false)
    expect(passaIFiltri(voce({ anno: '2026' }), { ...FILTRI_VUOTI, anno: '2026' })).toBe(true)
  })

  it('tiene anime e cartoni distinti dalle serie', () => {
    // In Ciak sono tipi a sé: chi li separa nell'archivio se li aspetta
    // separati anche nel filtro.
    const anime = voce({ mediaType: 'anime' as MediaType })
    expect(passaIFiltri(anime, { ...FILTRI_VUOTI, tipo: 'tv' })).toBe(false)
    expect(passaIFiltri(anime, { ...FILTRI_VUOTI, tipo: 'anime' })).toBe(true)
  })

  it('cerca dentro le recensioni, non solo nei titoli', () => {
    const v = voce({ testo: 'pearl — mia goth pazzesca' })
    expect(passaIFiltri(v, { ...FILTRI_VUOTI, query: 'goth' })).toBe(true)
    expect(passaIFiltri(v, { ...FILTRI_VUOTI, query: 'zombie' })).toBe(false)
  })

  it('ignora spazi e maiuscole nella ricerca', () => {
    expect(passaIFiltri(voce(), { ...FILTRI_VUOTI, query: '  DISAGIO ' })).toBe(true)
  })

  it('il voto assente non vale zero', () => {
    // Il caso che si sbaglia: chiedere «3★ e oltre» vuol dire chiedere titoli
    // votati. Un film visto e mai votato non è un film da tre stelle.
    const senzaVoto = voce({ voto: null })
    expect(passaIFiltri(senzaVoto, { ...FILTRI_VUOTI, votoMin: 3 })).toBe(false)
    expect(passaIFiltri(senzaVoto, FILTRI_VUOTI)).toBe(true)
  })

  it('filtra per genere, e un titolo ne ha più di uno', () => {
    const v = voce({ genreIds: [27, 18] })
    expect(passaIFiltri(v, { ...FILTRI_VUOTI, genere: 18 })).toBe(true)
    expect(passaIFiltri(v, { ...FILTRI_VUOTI, genere: 35 })).toBe(false)
  })

  it('un titolo senza generi sparisce solo se filtri per genere', () => {
    const v = voce({ genreIds: [] })
    expect(passaIFiltri(v, FILTRI_VUOTI)).toBe(true)
    expect(passaIFiltri(v, { ...FILTRI_VUOTI, genere: 27 })).toBe(false)
  })

  it('«solo con recensione» trova ciò che hai scritto tu', () => {
    expect(passaIFiltri(voce({ haNota: false }), { ...FILTRI_VUOTI, soloConNota: true })).toBe(false)
    expect(passaIFiltri(voce({ haNota: true }), { ...FILTRI_VUOTI, soloConNota: true })).toBe(true)
  })

  it('i filtri si sommano', () => {
    const v = voce({ mediaType: 'movie' as MediaType, genreIds: [27], voto: 5, anno: '2026' })
    const f = { ...FILTRI_VUOTI, tipo: 'movie' as const, genere: 27, votoMin: 5, anno: '2026' }
    expect(passaIFiltri(v, f)).toBe(true)
    expect(passaIFiltri(v, { ...f, votoMin: 5.5 })).toBe(false)
  })
})

describe('filtriAttivi', () => {
  it('è falso solo quando non hai toccato niente', () => {
    expect(filtriAttivi(FILTRI_VUOTI)).toBe(false)
    expect(filtriAttivi({ ...FILTRI_VUOTI, genere: 27 })).toBe(true)
    expect(filtriAttivi({ ...FILTRI_VUOTI, soloConNota: true })).toBe(true)
    expect(filtriAttivi({ ...FILTRI_VUOTI, query: '   ' })).toBe(false)
  })
})

describe('generiPresenti', () => {
  const nomi = new Map([
    [27, 'Horror'],
    [18, 'Dramma'],
    [35, 'Commedia'],
  ])

  it('elenca solo i generi che hai davvero visto, dal più frequente', () => {
    // Un menu con tutti i generi di TMDB sarebbe per tre quarti inutile, e
    // sceglierne uno assente darebbe una pagina vuota senza spiegazione.
    const voci = [
      voce({ genreIds: [27, 18] }),
      voce({ genreIds: [27] }),
      voce({ genreIds: [35] }),
    ]
    expect(generiPresenti(voci, nomi)).toEqual([
      { id: 27, nome: 'Horror', quanti: 2 },
      // A parità di conteggio l'ordine è alfabetico, non quello di comparsa:
      // così il menu non cambia da una visita all'altra.
      { id: 35, nome: 'Commedia', quanti: 1 },
      { id: 18, nome: 'Dramma', quanti: 1 },
    ])
  })

  it('un titolo con lo stesso genere ripetuto conta una volta sola', () => {
    expect(generiPresenti([voce({ genreIds: [27, 27] })], nomi)[0].quanti).toBe(1)
  })

  it('salta i generi di cui non conosce il nome', () => {
    // Succede se TMDB non risponde o se un id è sparito dal catalogo: meglio
    // non elencarlo che mostrare una voce vuota da scegliere.
    expect(generiPresenti([voce({ genreIds: [9999] })], nomi)).toEqual([])
  })

  it('senza voci non propone niente', () => {
    expect(generiPresenti([], nomi)).toEqual([])
  })
})

describe('contaFiltriAttivi', () => {
  it('non conta la ricerca, che resta sempre in vista', () => {
    // Il numero serve al pulsante «Filtri» del telefono: se contasse anche il
    // testo direbbe «1» mentre il campo è lì davanti, pieno e visibile.
    expect(contaFiltriAttivi({ ...FILTRI_VUOTI, query: 'pearl' })).toBe(0)
  })

  it('conta gli altri, uno per uno', () => {
    expect(contaFiltriAttivi(FILTRI_VUOTI)).toBe(0)
    expect(contaFiltriAttivi({ ...FILTRI_VUOTI, tipo: 'movie' })).toBe(1)
    expect(
      contaFiltriAttivi({ ...FILTRI_VUOTI, tipo: 'movie', genere: 27, soloConNota: true }),
    ).toBe(3)
  })
})
