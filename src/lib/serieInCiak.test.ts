import { beforeEach, describe, expect, it } from 'vitest'
import {
  cambiaLiberaDopoVisione,
  EVENTO_SERIE_IN_CIAK,
  lasciaSerieInCiak,
  leggiSerieInCiak,
  pianoSerieInCiak,
  tieniSerieInCiak,
} from './serieInCiak'
import type { EpisodioVideoteca } from './videoteca'

// Su `node` non ci sono localStorage né window: se ne montano di finti.
let eventi = 0
beforeEach(() => {
  const dati = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => dati.get(k) ?? null,
    setItem: (k: string, v: string) => void dati.set(k, v),
    removeItem: (k: string) => void dati.delete(k),
    clear: () => dati.clear(),
    key: () => null,
    length: 0,
  } as Storage
  const finta = new EventTarget()
  eventi = 0
  finta.addEventListener(EVENTO_SERIE_IN_CIAK, () => eventi++)
  globalThis.window = finta as Window & typeof globalThis
})

function ep(id: string, stagione: number, episodio: number, visto = false): EpisodioVideoteca {
  return { id, nome: id, file: `${id}.mp4`, stagione, episodio, visto, posizione: 0, secondiVisti: 0, durata: null, guardato: null }
}

describe('le serie tenute in Ciak', () => {
  it('si ricordano per cartella, e chi ascolta lo sa', () => {
    tieniSerieInCiak('south park', 'South Park')
    expect(leggiSerieInCiak()).toEqual({ 'south park': { titolo: 'South Park', liberaDopoVisione: true } })
    cambiaLiberaDopoVisione('south park', false)
    expect(leggiSerieInCiak()['south park'].liberaDopoVisione).toBe(false)
    lasciaSerieInCiak('south park')
    expect(leggiSerieInCiak()).toEqual({})
    expect(eventi).toBe(3)
  })

  it('cambiare la scelta di una serie non tenuta non la aggiunge', () => {
    cambiaLiberaDopoVisione('paprika', true)
    expect(leggiSerieInCiak()).toEqual({})
  })

  it('una memoria rovinata vale «nessuna serie», e le voci sbagliate si scartano', () => {
    localStorage.setItem('ciak:serie-in-ciak', '{non è json')
    expect(leggiSerieInCiak()).toEqual({})
    localStorage.setItem('ciak:serie-in-ciak', JSON.stringify({ a: { titolo: 'A' }, b: null, c: { titolo: 3 } }))
    expect(leggiSerieInCiak()).toEqual({ a: { titolo: 'A', liberaDopoVisione: true } })
  })
})

describe('pianoSerieInCiak', () => {
  const southPark = {
    cartella: 'south park',
    titolo: 'South Park',
    episodi: [ep('loc-3', 3, 3), ep('loc-1', 3, 1, true), ep('loc-2', 3, 2), ep('jf-4', 3, 4)],
  }
  const paprika = { cartella: 'paprika', titolo: 'Paprika', episodi: [ep('loc-p', 1, 1)] }

  it('copia gli episodi che mancano, in ordine, e solo per le serie tenute', () => {
    const piano = pianoSerieInCiak([southPark, paprika], { 'south park': { titolo: 'South Park', liberaDopoVisione: true } }, new Set(['loc-2']))
    expect(piano.daCopiare).toEqual([{ id: 'loc-3', titolo: 'South Park · S3E3', serie: 'South Park', cartella: 'south park' }])
    expect(piano.daLiberare).toEqual([])
  })

  it('toglie le copie dei visti, e un visto non lo copia proprio', () => {
    const piano = pianoSerieInCiak([southPark], { 'south park': { titolo: 'South Park', liberaDopoVisione: true } }, new Set(['loc-1', 'loc-2']))
    expect(piano.daLiberare).toEqual(['loc-1'])
    expect(piano.daCopiare.map((e) => e.id)).toEqual(['loc-3'])
  })

  it('chi vuole tenere anche i visti se li ritrova tutti', () => {
    const piano = pianoSerieInCiak([southPark], { 'south park': { titolo: 'South Park', liberaDopoVisione: false } }, new Set())
    expect(piano.daLiberare).toEqual([])
    expect(piano.daCopiare.map((e) => e.id)).toEqual(['loc-1', 'loc-2', 'loc-3'])
  })

  it('gli episodi del server di casa non hanno un file da copiare', () => {
    const piano = pianoSerieInCiak([southPark], { 'south park': { titolo: 'South Park', liberaDopoVisione: false } }, new Set())
    expect(piano.daCopiare.some((e) => e.id === 'jf-4')).toBe(false)
  })
})
