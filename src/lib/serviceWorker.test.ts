import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Il service worker è uno script classico in public/, senza moduli: lo si
// esegue con un `self` finto e si guarda cosa fa. Qui si prova ciò che
// riguarda i film salvati in Ciak: la loro cache non deve sparire a un
// aggiornamento, e il worker non deve più mettersi in mezzo ai video.

const codice = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8')

type Gestore = (evento: unknown) => void

function avviaWorker() {
  const gestori: Record<string, Gestore> = {}
  const self = {
    location: { origin: 'https://ciak.test' },
    addEventListener: (tipo: string, fn: Gestore) => (gestori[tipo] = fn),
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
  }
  // Una Cache API finta: una mappa per cache, quanto basta al worker.
  const cacheFinte = new Map<string, Map<string, Response>>()
  const caches = {
    open: async (nome: string) => {
      if (!cacheFinte.has(nome)) cacheFinte.set(nome, new Map())
      const m = cacheFinte.get(nome)!
      return {
        match: async (chiave: string) => m.get(chiave)?.clone() ?? undefined,
        put: async (chiave: string, res: Response) => void m.set(chiave, res),
        delete: async (chiave: string) => m.delete(chiave),
        keys: async () => [...m.keys()].map((k) => new Request('https://ciak.test' + k)),
      }
    },
    match: async () => undefined,
    keys: async () => [...cacheFinte.keys()],
    delete: async (nome: string) => cacheFinte.delete(nome),
  }
  const fetchFinto = vi.fn(async () => new Response('rete'))
  new Function('self', 'fetch', 'caches', codice)(self, fetchFinto, caches)
  return { gestori, caches, fetchFinto }
}

describe('service worker: film salvati in Ciak', () => {
  it('la cache dei film sopravvive all’attivazione di un worker nuovo', async () => {
    const { gestori, caches } = avviaWorker()
    await (await caches.open('ciak-film-v1')).put('/film-offline/loc-0123456789abcdef', new Response('0123456789'))
    await (await caches.open('ciak-v2')).put('/x', new Response(''))
    const attese: Promise<unknown>[] = []
    gestori.activate({ waitUntil: (p: Promise<unknown>) => attese.push(p) })
    await Promise.all(attese)
    expect(await caches.keys()).toContain('ciak-film-v1')
    expect(await caches.keys()).not.toContain('ciak-v2')
  })

  it('un vecchio indirizzo dei video di Drive non lo intercetta più', () => {
    const { gestori } = avviaWorker()
    const respondWith = vi.fn()
    gestori.fetch({ request: new Request('https://ciak.test/drive-video/1AbCdEfGhIjKlMn', { headers: { Range: 'bytes=0-' } }), respondWith })
    // Un file statico qualunque: cache-first, non più il proxy verso Drive.
    expect(respondWith).toHaveBeenCalledTimes(1)
    expect(codice).not.toMatch(/googleapis|drive-video|ciak:drive-token/)
  })
})
