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
  // La pagina: risponde alla richiesta del token; gli altri messaggi (la
  // diagnostica) li tiene da parte per le verifiche.
  const postMessage = vi.fn((_msg: unknown, transfer?: MessagePort[]) => {
    if (transfer?.[0]) transfer[0].postMessage({ token })
  })
  const diagnostiche = () =>
    postMessage.mock.calls.map(([m]) => m as { tipo?: string }).filter((m) => m.tipo === 'ciak:diagnostica')
  const self = {
    location: { origin: 'https://ciak.test' },
    addEventListener: (tipo: string, fn: Gestore) => (gestori[tipo] = fn),
    clients: { get: vi.fn(async () => ({ postMessage })), claim: vi.fn(async () => {}) },
  }
  // Drive finto: la dimensione del file e i pezzi di video. Come quello vero,
  // risponde 206 ma senza un Content-Range leggibile dal browser.
  const fetchFinto = vi.fn(async (url: string) =>
    url.includes('fields=size')
      ? new Response(JSON.stringify({ size: '1000' }), { headers: { 'Content-Type': 'application/json' } })
      : new Response('video', { status: 206, headers: { 'Content-Type': 'video/mp4' } }),
  )
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
  return { richiedi, fetchFinto, postMessage, gestori, self, diagnostiche }
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

describe('service worker: andare avanti nel film', () => {
  it('ricostruisce Content-Range, così il video sa dove mettere il pezzo', async () => {
    // Il bug: spostandosi avanti il film ripartiva dall'inizio, perché Drive
    // non lascia leggere al browser il suo Content-Range.
    const { richiedi } = avviaWorker({ token: 'tok-123' })
    const risposta = await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=600-' })
    expect(risposta?.status).toBe(206)
    expect(risposta?.headers.get('Content-Range')).toBe('bytes 600-999/1000')
    expect(risposta?.headers.get('Content-Length')).toBe('400')
    expect(risposta?.headers.get('Accept-Ranges')).toBe('bytes')
    expect(risposta?.headers.get('Content-Type')).toBe('video/mp4')
  })

  it('rispetta anche un intervallo chiuso', async () => {
    const { richiedi } = avviaWorker({ token: 'tok-123' })
    const risposta = await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=100-199' })
    expect(risposta?.headers.get('Content-Range')).toBe('bytes 100-199/1000')
    expect(risposta?.headers.get('Content-Length')).toBe('100')
  })

  it('chiede la dimensione del file una volta sola', async () => {
    const { richiedi, fetchFinto } = avviaWorker({ token: 'tok-123' })
    await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=0-' })
    await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=500-' })
    const chiamateDimensione = fetchFinto.mock.calls.filter(([url]) => url.includes('fields=size'))
    expect(chiamateDimensione).toHaveLength(1)
  })

  it('un errore di Drive arriva al video come errore, non come pezzo di film', async () => {
    const { richiedi, fetchFinto } = avviaWorker({ token: 'tok-123' })
    fetchFinto.mockImplementation(async (url: string) =>
      url.includes('fields=size')
        ? new Response(JSON.stringify({ size: '1000' }))
        : new Response('{"error":"quota"}', { status: 403 }),
    )
    const risposta = await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=0-' })
    expect(risposta?.status).toBe(403)
  })
})

describe('service worker: diagnostica per la pagina', () => {
  it('racconta alla pagina cosa ha risposto Drive a ogni pezzo', async () => {
    const { richiedi, diagnostiche } = avviaWorker({ token: 'tok-123' })
    await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=600-' })
    await new Promise((r) => setTimeout(r, 0))
    expect(diagnostiche()).toEqual([
      expect.objectContaining({ range: 'bytes=600-', status: 206, totale: 1000, esito: 'ok', redirect: null }),
    ])
  })

  it('se Drive ignora il Range non spaccia tutto il file per il pezzo chiesto', async () => {
    const { richiedi, fetchFinto, diagnostiche } = avviaWorker({ token: 'tok-123' })
    fetchFinto.mockImplementation(async (url: string) =>
      url.includes('fields=size')
        ? new Response(JSON.stringify({ size: '1000' }))
        : new Response('tutto il file', { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
    )
    const risposta = await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=600-' })
    await new Promise((r) => setTimeout(r, 0))
    // Un errore, che la pagina sa gestire, invece di un video che aspetta per sempre.
    expect(risposta?.status).toBe(416)
    expect(diagnostiche()[0]).toMatchObject({ esito: 'range-ignorato', status: 200 })
  })

  it('un 200 alla richiesta dell’intero file è normale: diventa un 206 da 0', async () => {
    const { richiedi, fetchFinto } = avviaWorker({ token: 'tok-123' })
    fetchFinto.mockImplementation(async (url: string) =>
      url.includes('fields=size')
        ? new Response(JSON.stringify({ size: '1000' }))
        : new Response('video', { status: 200, headers: { 'Content-Type': 'video/mp4' } }),
    )
    const risposta = await richiedi('https://ciak.test/drive-video/video-song-0001', { Range: 'bytes=0-' })
    expect(risposta?.status).toBe(206)
    expect(risposta?.headers.get('Content-Range')).toBe('bytes 0-999/1000')
  })
})

describe('service worker: prendere una scheda non controllata', () => {
  it('su richiesta della pagina prende il controllo delle schede', () => {
    const { gestori, self } = avviaWorker({ token: null })
    const attese: Promise<unknown>[] = []
    gestori.message({ data: { tipo: 'ciak:prendi-controllo' }, waitUntil: (p: Promise<unknown>) => attese.push(p) })
    expect(self.clients.claim).toHaveBeenCalledTimes(1)
    expect(attese).toHaveLength(1)
  })

  it('ignora gli altri messaggi', () => {
    const { gestori, self } = avviaWorker({ token: null })
    gestori.message({ data: { tipo: 'altro' }, waitUntil: () => {} })
    gestori.message({ data: null, waitUntil: () => {} })
    expect(self.clients.claim).not.toHaveBeenCalled()
  })
})
