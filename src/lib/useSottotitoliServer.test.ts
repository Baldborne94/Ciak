import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { infoDaSorgente } from './jellyfin'
import { BLOCCO_HASH, hashOpenSubtitles } from './sottotitoli'

// L'impronta di OpenSubtitles di un video del server di casa: due pezzi da
// 64 KB chiesti a Jellyfin, invece del file intero.

vi.mock('./logFailure', () => ({ logFailure: () => () => {} }))
const { hashDalServer } = await import('./useSottotitoliServer')

const ID = '3f2504e04f8911d39a0c0305e82c3301'
const DIMENSIONE = 183_500_800
const info = infoDaSorgente({ Id: ID, Path: '/data/Cartoni/Samurai Jack/Season 1/S01E01.avi', Container: 'avi', Size: DIMENSIONE, MediaStreams: [] })
const pezzo = (valore: number) => new Uint8Array(BLOCCO_HASH).fill(valore)
const chieste: string[] = []

beforeEach(() => {
  chieste.length = 0
  const dati = new Map([['ciak:jellyfin', JSON.stringify({ url: 'https://casa.ts.net', token: 'T', userId: 'u', utente: 'a' })]])
  vi.stubGlobal('localStorage', { getItem: (k: string) => dati.get(k) ?? null, setItem: () => {}, removeItem: () => {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('hashDalServer', () => {
  it('chiede solo l’inizio e la fine del file, e ne fa l’impronta', async () => {
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const range = (init.headers as Record<string, string>).Range
      chieste.push(range)
      return new Response(range.startsWith('bytes=0-') ? pezzo(1) : pezzo(2), { status: 206 })
    })
    const atteso = hashOpenSubtitles(DIMENSIONE, pezzo(1).buffer, pezzo(2).buffer)
    expect(await hashDalServer(`jf-${ID}`, info)).toBe(atteso)
    expect(chieste.sort()).toEqual([`bytes=0-${BLOCCO_HASH - 1}`, `bytes=${DIMENSIONE - BLOCCO_HASH}-${DIMENSIONE - 1}`])
  })

  it('un server che manda il file intero invece dei pezzi: niente impronta, si cerca per nome', async () => {
    vi.stubGlobal('fetch', async () => new Response(pezzo(1), { status: 200 }))
    expect(await hashDalServer(`jf-${ID}`, info)).toBeUndefined()
  })

  it('un server che non risponde non blocca la ricerca', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await hashDalServer(`jf-${ID}`, info)).toBeUndefined()
  })
})
