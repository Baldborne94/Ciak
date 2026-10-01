import { describe, it, expect } from 'vitest'
import { filtraVideoteca, generiPresenti, ordinaVideoteca, type RigaVideoteca } from './videoteca'

function riga(over: Partial<RigaVideoteca>): RigaVideoteca {
  return { id: 'x', nome: 'X', file: 'x.mp4', anno: null, generi: [], titoli: [], aggiunto: null, guardato: null, ...over }
}

const SONG = riga({ id: 'song', nome: 'Song of the Sea', file: 'Song.of.the.Sea.2014.mp4', anno: '2014', generi: [16, 10751], titoli: ['La canzone del mare'], aggiunto: '2026-09-01T10:00:00Z', guardato: '2026-09-30T21:00:00Z' })
const KELLS = riga({ id: 'kells', nome: 'The Secret of Kells', file: 'Kells.mp4', anno: '2009', generi: [16, 14], aggiunto: '2026-09-20T10:00:00Z' })
const ALIEN = riga({ id: 'alien', nome: 'Alien', file: 'Alien.1979.mp4', anno: '1979', generi: [27, 878], aggiunto: '2026-08-01T10:00:00Z', guardato: '2026-09-10T21:00:00Z' })
const MISTERO = riga({ id: 'mistero', nome: 'video senza nome', file: 'VID_0001.mp4' })

const ids = (r: RigaVideoteca[]) => r.map((x) => x.id)

describe('cercare nella videoteca', () => {
  it('trova per titolo, per titolo tradotto e per nome del file', () => {
    expect(ids(filtraVideoteca([SONG, KELLS, ALIEN], { query: 'kells', genere: null }))).toEqual(['kells'])
    expect(ids(filtraVideoteca([SONG, KELLS, ALIEN], { query: 'canzone del', genere: null }))).toEqual(['song'])
    expect(ids(filtraVideoteca([SONG, MISTERO], { query: 'VID_0001', genere: null }))).toEqual(['mistero'])
  })

  it('filtra per genere, insieme alla ricerca', () => {
    expect(ids(filtraVideoteca([SONG, KELLS, ALIEN], { query: '', genere: 16 }))).toEqual(['song', 'kells'])
    expect(ids(filtraVideoteca([SONG, KELLS, ALIEN], { query: 'song', genere: 27 }))).toEqual([])
  })
})

describe('ordinare la videoteca', () => {
  const tutti = [KELLS, MISTERO, SONG, ALIEN]

  it('per titolo, con gli episodi in ordine numerico', () => {
    expect(ids(ordinaVideoteca(tutti, 'titolo'))).toEqual(['alien', 'song', 'kells', 'mistero'])
    const e2 = riga({ id: 'e2', nome: 'Shōgun · S1E2' })
    const e10 = riga({ id: 'e10', nome: 'Shōgun · S1E10' })
    expect(ids(ordinaVideoteca([e10, e2], 'titolo'))).toEqual(['e2', 'e10'])
  })

  it('per anno, con quelli senza anno in fondo in entrambi i versi', () => {
    expect(ids(ordinaVideoteca(tutti, 'anno-desc'))).toEqual(['song', 'kells', 'alien', 'mistero'])
    expect(ids(ordinaVideoteca(tutti, 'anno-asc'))).toEqual(['alien', 'kells', 'song', 'mistero'])
  })

  it('per data di arrivo su Drive e per ultima visione', () => {
    expect(ids(ordinaVideoteca(tutti, 'aggiunti'))).toEqual(['kells', 'song', 'alien', 'mistero'])
    // Mai guardati in fondo, in ordine di titolo.
    expect(ids(ordinaVideoteca(tutti, 'guardati'))).toEqual(['song', 'alien', 'kells', 'mistero'])
  })

  it('non tocca la lista di partenza', () => {
    const copia = [...tutti]
    ordinaVideoteca(tutti, 'anno-desc')
    expect(tutti).toEqual(copia)
  })
})

describe('generiPresenti', () => {
  it('conta i titoli per genere e tralascia i generi senza nome', () => {
    const nomi = new Map([
      [16, 'Animazione'],
      [27, 'Horror'],
      [14, 'Fantasy'],
    ])
    expect(generiPresenti([SONG, KELLS, ALIEN], nomi)).toEqual([
      { id: 16, nome: 'Animazione', quanti: 2 },
      { id: 14, nome: 'Fantasy', quanti: 1 },
      { id: 27, nome: 'Horror', quanti: 1 },
    ])
  })
})
