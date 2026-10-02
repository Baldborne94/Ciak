import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./logFailure', () => ({ logFailure: () => () => {} }))

const DIRETTO = 'https://api.theintrodb.org/v3/media?tmdb_id=2190&season=3&episode=6'
const RISERVA = '/api/sigle?tmdb_id=2190&season=3&episode=6'

describe('sigleEpisodio', () => {
  let memoria: Map<string, string>
  beforeEach(() => {
    vi.resetModules()
    memoria = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  const risposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })

  it('chiede a TheIntroDB dal browser: da Vercel la protezione anti-bot risponde 403', async () => {
    const fetchFinto = vi.fn(async (url: string) =>
      url === DIRETTO ? risposta({ intro: [{ start_ms: 4000, end_ms: 34000 }], credits: [{ start_ms: 1265000, end_ms: null }] }) : risposta({}, 500),
    )
    vi.stubGlobal('fetch', fetchFinto)
    const { sigleEpisodio } = await import('./sigleOnline')
    expect(await sigleEpisodio(2190, 3, 6)).toEqual({ inizio: { da: 4, a: 34 }, finale: { da: 1265 } })
    // Poi resta sul dispositivo.
    expect(await sigleEpisodio(2190, 3, 6)).toEqual({ inizio: { da: 4, a: 34 }, finale: { da: 1265 } })
    expect(fetchFinto.mock.calls.map((c) => c[0])).toEqual([DIRETTO])
  })

  it('un episodio che TheIntroDB non ha (404) è «niente da saltare», e si richiede dopo una settimana', async () => {
    const fetchFinto = vi.fn(async () => risposta({ error: 'not found' }, 404))
    vi.stubGlobal('fetch', fetchFinto)
    const { sigleEpisodio } = await import('./sigleOnline')
    expect(await sigleEpisodio(2190, 3, 6)).toEqual({ inizio: null, finale: null })
    await sigleEpisodio(2190, 3, 6)
    expect(fetchFinto).toHaveBeenCalledTimes(1)
    memoria.set('ciak:sigle-online:tv-2190-3-6', JSON.stringify({ sigle: { inizio: null, finale: null }, quando: Date.now() - 8 * 24 * 3600_000 }))
    await sigleEpisodio(2190, 3, 6)
    expect(fetchFinto).toHaveBeenCalledTimes(2)
  })

  it('se il browser non può (CORS, rete), passa dal server di Ciak', async () => {
    const fetchFinto = vi.fn(async (url: string) => {
      if (url === DIRETTO) throw new TypeError('Failed to fetch')
      return risposta({ inizio: { da: 4, a: 34 }, finale: null })
    })
    vi.stubGlobal('fetch', fetchFinto)
    const { sigleEpisodio } = await import('./sigleOnline')
    expect(await sigleEpisodio(2190, 3, 6)).toEqual({ inizio: { da: 4, a: 34 }, finale: null })
    expect(fetchFinto.mock.calls.map((c) => c[0])).toEqual([DIRETTO, RISERVA])
  })

  it('se non risponde nessuno dei due non si salta niente, e non si salva niente', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === DIRETTO ? new Response('<!doctype html>', { status: 403 }) : risposta({ error: 'giù' }, 502))))
    const { sigleEpisodio } = await import('./sigleOnline')
    expect(await sigleEpisodio(2190, 3, 6)).toBeNull()
    expect(memoria.size).toBe(0)
  })
})
