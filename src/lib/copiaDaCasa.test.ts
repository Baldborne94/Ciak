import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { infoDaSorgente, type InfoJellyfin } from './jellyfin'

const salvate: { film: { id: string; file: string; serie?: string | null }; byte: number }[] = []
vi.mock('./filmOffline', () => ({
  // Legge la risposta fino in fondo, come farebbe la cache del browser.
  salvaRispostaSulDispositivo: vi.fn(async (film: { id: string; file: string }, risposta: Response) => {
    const byte = (await risposta.arrayBuffer()).byteLength
    salvate.push({ film, byte })
  }),
}))

const { annullaCopia, ascoltaCopie, copiaDaCasa, CopiaAnnullata, pianoCopia, progressoCopia } = await import('./copiaDaCasa')

const ID = '06006283103f8493628d6b5b9a95da9d'
const FILE = `jf-${ID}`
const sorgente = (contenitore: string) => ({
  Id: ID,
  Path: `/media/SERIE/Konosuba/Season 01/01 Episodio.${contenitore === 'mkv' ? 'mkv' : 'mp4'}`,
  Container: contenitore,
  Size: 9_000_000,
  MediaStreams: [
    { Index: 1, Type: 'Video', Codec: 'h264', BitDepth: 8 },
    { Index: 2, Type: 'Audio', Codec: 'aac', Language: 'jpn' },
    { Index: 3, Type: 'Audio', Codec: 'ac3', Language: 'ita' },
  ],
})
const mp4: InfoJellyfin = infoDaSorgente(sorgente('mov,mp4'))
const mkv: InfoJellyfin = infoDaSorgente(sorgente('mkv'))

const richieste: string[] = []
const fermate: string[] = []

beforeEach(() => {
  salvate.length = 0
  richieste.length = 0
  fermate.length = 0
  const dati = new Map<string, string>([['ciak:jellyfin', JSON.stringify({ url: 'https://casa.ts.net', token: 'TOK', userId: 'u', utente: 'ale' })]])
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => dati.get(k) ?? null,
    setItem: (k: string, v: string) => void dati.set(k, v),
    removeItem: (k: string) => void dati.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

// Un server che manda `pezzi` da 3 MB, uno alla volta, e si può fermare.
function server(pezzi: number) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      fermate.push(url)
      return new Response(null, { status: 204 })
    }
    richieste.push(url)
    let mandati = 0
    const corpo = new ReadableStream<Uint8Array>({
      pull(c) {
        if (init?.signal?.aborted) return c.error(new DOMException('Interrotto', 'AbortError'))
        if (mandati++ === pezzi) return c.close()
        c.enqueue(new Uint8Array(3 * 1024 ** 2))
      },
    })
    return new Response(corpo)
  })
}

describe('pianoCopia', () => {
  it('un MP4 che il browser legge si scarica così com’è, col suo nome', () => {
    const piano = pianoCopia(FILE, mp4, 2, 'sess')
    expect(piano).toEqual({ url: `https://casa.ts.net/Videos/${ID}/stream?static=true&api_key=TOK`, nome: '01 Episodio.mp4', convertito: false })
  })

  it('un MKV lo converte Jellyfin in MP4, e il nome lo dice', () => {
    const piano = pianoCopia(FILE, mkv, null, 'sess')
    expect(piano.convertito).toBe(true)
    expect(piano.nome).toBe('01 Episodio.mp4')
    const url = new URL(piano.url)
    expect(url.pathname).toBe(`/Videos/${ID}/stream.mp4`)
    expect(url.searchParams.get('Container')).toBe('mp4')
    expect(url.searchParams.get('PlaySessionId')).toBe('sess')
    // Senza scelta, la lingua che si sente aprendo il file.
    expect(url.searchParams.get('AudioStreamIndex')).toBe('2')
  })

  it('un MP4 con un’altra lingua scelta si converte: il file ne suonerebbe solo la prima', () => {
    const piano = pianoCopia(FILE, mp4, 3, 'sess')
    expect(piano.convertito).toBe(true)
    expect(new URL(piano.url).searchParams.get('AudioStreamIndex')).toBe('3')
  })
})

describe('copiaDaCasa', () => {
  const copia = (info: InfoJellyfin) => copiaDaCasa({ fileId: FILE, titolo: 'Konosuba 1x01', info, audio: null, sottotitoli: [] })

  it('scarica nella copia in Ciak, dice a che punto è e poi ferma la conversione', async () => {
    server(3)
    const visti: number[] = []
    const smetti = ascoltaCopie(() => visti.push(progressoCopia(FILE)?.scaricati ?? -1))
    await copia(mkv)
    smetti()
    expect(salvate).toEqual([{ film: expect.objectContaining({ id: FILE, file: '01 Episodio.mp4', serie: 'Konosuba' }), byte: 9 * 1024 ** 2 }])
    // Partenza, un avviso ogni 4 MB e non a ogni pezzo, poi la fine.
    expect(visti).toEqual([0, 6 * 1024 ** 2, -1])
    expect(progressoCopia(FILE)).toBeNull()
    expect(fermate).toHaveLength(1)
    expect(new URL(fermate[0]).searchParams.get('playSessionId')).toBe(new URL(richieste[0]).searchParams.get('PlaySessionId'))
  })

  it('il file così com’è non ha una conversione da fermare, e la dimensione la sa già', async () => {
    server(1)
    const totali: (number | null)[] = []
    const smetti = ascoltaCopie(() => totali.push(progressoCopia(FILE)?.totale ?? null))
    await copia(mp4)
    smetti()
    expect(totali[0]).toBe(9_000_000)
    expect(fermate).toHaveLength(0)
  })

  it('annullato a metà non salva niente e lo dice come annullato, non come guasto', async () => {
    server(1000)
    const smetti = ascoltaCopie(() => {
      if ((progressoCopia(FILE)?.scaricati ?? 0) > 0) annullaCopia(FILE)
    })
    const esito = copia(mkv)
    await expect(esito).rejects.toBeInstanceOf(CopiaAnnullata)
    smetti()
    expect(progressoCopia(FILE)).toBeNull()
    expect(fermate).toHaveLength(1)
  })

  it('un server che non risponde si spiega', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(copia(mkv)).rejects.toThrow(/Jellyfin aperto/)
    expect(progressoCopia(FILE)).toBeNull()
  })
})
