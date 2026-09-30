import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Il service worker è uno script classico in public/, senza moduli: lo si
// esegue con un `self` finto e si guarda cosa risponde. Si prova solo il tratto
// dei film di Drive, che porta con sé un token Google: sbagliare qui vuol dire
// o un lettore che non parte o un token che finisce dove non deve.

const codice = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8')

type Gestore = (evento: unknown) => void

function avviaWorker({ token }: { token: string | null }) {
  const gestori: Record<string, Gestore> = {}
  const postMessage = vi.fn((_msg: unknown, [porta]: MessagePort[]) => porta.postMessage({ token }))
  const self = {
    location: { origin: 'https://ciak.test' },
    addEventListener: (tipo: string, fn: Gestore) => (gestori[tipo] = fn),
    clients: { get: vi.fn(async () => ({ postMessage })) },
  }
  const fetchFinto = vi.fn(async () => new Response('video', { status: 206 }))
  new Function('self', 'fetch', 'caches', codice)(self, fetchFinto, {})

  async function richiedi(url: string, headers: Record<string, string> = {}) {
    let risposta: Promise<Response> | undefined
    gestori.fetch({
      request: new Request(url, { headers }),
      clientId: 'scheda-1',
      respondWith: (r: Promise<Response>) => (risposta = r),
    })
    return risposta
  }
  return { richiedi, fetchFinto, postMessage }
}

describe('service worker: i film di Drive', () => {
  it('chiede il token alla pagina e gira la richiesta a Drive con Range', async () => {
    const { richiedi, fetchFinto, postMessage } = avviaWorker({ token: 'tok-123' })
    const risposta = await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=100-' })

    expect(risposta?.status).toBe(206)
    expect(postMessage).toHaveBeenCalledWith({ tipo: 'ciak:drive-token' }, expect.any(Array))
    expect(fetchFinto).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/video-song-0001?alt=media',
      { headers: { Authorization: 'Bearer tok-123', Range: 'bytes=100-' } },
    )
  })

  it('senza token non chiede niente a Drive', async () => {
    const { richiedi, fetchFinto } = avviaWorker({ token: null })
    const risposta = await richiedi('https://ciak.test/drive-video/video-song-0001')
    expect(risposta?.status).toBe(401)
    expect(fetchFinto).not.toHaveBeenCalled()
  })

  it('un id che non è di Drive viene rifiutato prima di finire in un URL', async () => {
    const { richiedi, fetchFinto, postMessage } = avviaWorker({ token: 'tok-123' })
    const risposta = await richiedi('https://ciak.test/drive-video/..%2F..%2Fevil')
    expect(risposta?.status).toBe(400)
    expect(postMessage).not.toHaveBeenCalled()
    expect(fetchFinto).not.toHaveBeenCalled()
  })
})
