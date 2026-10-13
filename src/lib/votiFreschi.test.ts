import { beforeEach, describe, expect, it } from 'vitest'
import { dimenticaVoti, POCHI_VOTI, ricordaVoto, votoDaMostrare } from './votiFreschi'

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
  dimenticaVoti()
})

const locandina = { id: 77, mediaType: 'movie', voteAverage: 8.2, voteCount: 40 }

describe('votoDaMostrare', () => {
  it('senza scheda letta vale il voto della lista', () => {
    expect(votoDaMostrare(locandina)).toEqual({ voto: 8.2, affidabile: true })
  })

  it('letta la scheda, vale il voto aggiornato, anche dopo aver riaperto Ciak', () => {
    ricordaVoto('movie', 77, 5.8, 120)
    expect(votoDaMostrare(locandina).voto).toBe(5.8)
    dimenticaVoti() // come una pagina ricaricata: si rilegge dallo storage
    expect(votoDaMostrare(locandina).voto).toBe(5.8)
  })

  it('un film e una serie con lo stesso numero non si scambiano il voto', () => {
    ricordaVoto('tv', 77, 3, 500)
    expect(votoDaMostrare(locandina).voto).toBe(8.2)
  })

  it('con pochissimi voti, o senza voto, non è affidabile', () => {
    expect(votoDaMostrare({ ...locandina, voteCount: POCHI_VOTI - 1 }).affidabile).toBe(false)
    expect(votoDaMostrare({ ...locandina, voteAverage: 0 }).affidabile).toBe(false)
    // Un titolo che non dice quanti voti ha (salvato prima) resta com'era.
    expect(votoDaMostrare({ id: 1, mediaType: 'movie', voteAverage: 7 }).affidabile).toBe(true)
  })

  it('tiene i più recenti, senza crescere per sempre', () => {
    for (let i = 0; i < 600; i++) ricordaVoto('movie', i, 6, 100)
    const salvati = JSON.parse(localStorage.getItem('ciak:voti-freschi') ?? '[]') as unknown[]
    expect(salvati).toHaveLength(500)
    expect(votoDaMostrare({ id: 599, mediaType: 'movie', voteAverage: 1, voteCount: 100 }).voto).toBe(6)
    expect(votoDaMostrare({ id: 0, mediaType: 'movie', voteAverage: 1, voteCount: 100 }).voto).toBe(1)
  })
})
