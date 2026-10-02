import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./logFailure', () => ({ logFailure: () => () => {} }))

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

  it('chiede l’episodio al server una volta, poi lo tiene sul dispositivo', async () => {
    const fetchFinto = vi.fn(async () => risposta({ inizio: { da: 32, a: 122 }, finale: { da: 1265 } }))
    vi.stubGlobal('fetch', fetchFinto)
    const { sigleEpisodio } = await import('./sigleOnline')
    expect(await sigleEpisodio(2190, 3, 6)).toEqual({ inizio: { da: 32, a: 122 }, finale: { da: 1265 } })
    expect(await sigleEpisodio(2190, 3, 6)).toEqual({ inizio: { da: 32, a: 122 }, finale: { da: 1265 } })
    expect(fetchFinto).toHaveBeenCalledTimes(1)
    expect(fetchFinto).toHaveBeenCalledWith('/api/sigle?tmdb_id=2190&season=3&episode=6')
  })

  it('un episodio sconosciuto si richiede dopo una settimana, non a ogni apertura', async () => {
    const fetchFinto = vi.fn(async () => risposta({ inizio: null, finale: null }))
    vi.stubGlobal('fetch', fetchFinto)
    const { sigleEpisodio } = await import('./sigleOnline')
    await sigleEpisodio(1, 1, 1)
    await sigleEpisodio(1, 1, 1)
    expect(fetchFinto).toHaveBeenCalledTimes(1)
    memoria.set('ciak:sigle-online:tv-1-1-1', JSON.stringify({ sigle: { inizio: null, finale: null }, quando: Date.now() - 8 * 24 * 3600_000 }))
    await sigleEpisodio(1, 1, 1)
    expect(fetchFinto).toHaveBeenCalledTimes(2)
  })

  it('se il server non risponde (o risponde altro) non si salta niente', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => risposta({ error: 'giù' }, 502)))
    const { sigleEpisodio } = await import('./sigleOnline')
    expect(await sigleEpisodio(2190, 3, 7)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200 })))
    expect(await sigleEpisodio(2190, 3, 8)).toBeNull()
    expect(memoria.size).toBe(0)
  })
})
