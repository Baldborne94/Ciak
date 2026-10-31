import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSerieInCiak } from './useSerieInCiak'
import { lasciaSerieInCiak, tieniSerieInCiak } from './serieInCiak'
import { copiaFilmInCiak } from './copiaInCiak'
import { eliminaFilm, type FilmOffline } from './filmOffline'
import type { VideoFile } from './fileVideo'

// La copia in sottofondo delle serie tenute in Ciak, senza disco né cache:
// la cartella e la copia sono finte, conta cosa si decide di copiare.

vi.mock('./cartellaLocale', () => ({
  cartellaCollegata: () => 'Ciak',
  ErroreCartella: class extends Error {},
  fileDallaCartella: async (id: string) => ({ id, file: new File([], `${id}.mp4`), vicini: [], origine: 'cartella', cartella: 'Season 03', serie: 'South Park', scrivi: null }),
}))
vi.mock('./copiaInCiak', () => ({ copiaFilmInCiak: vi.fn(async () => {}) }))
vi.mock('./filmOffline', async (originale) => ({
  ...(await originale<typeof import('./filmOffline')>()),
  offlineDisponibile: () => true,
  eliminaFilm: vi.fn(async () => {}),
}))

const VIDEO: VideoFile[] = [1, 2].map((n) => ({
  id: `loc-${n}`,
  name: `South Park S03E0${n}.mp4`,
  size: 1,
  mimeType: 'video/mp4',
  cartella: 'Season 03',
  serie: 'South Park',
}))
const salvato = (id: string): FilmOffline => ({ id, titolo: id, file: `${id}.mp4`, dimensione: 1, stato: 'completo', serie: 'South Park' })

function monta(iniziali: { offline: FilmOffline[]; offlineLetto: boolean; letture: number }) {
  return renderHook((p: typeof iniziali) =>
    useSerieInCiak({ video: VIDEO, archivio: new Map(), vistiNelDiario: new Map(), scaricati: new Set(p.offline.filter((f) => f.stato === 'completo').map((f) => f.id)), ...p }),
    { initialProps: iniziali },
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(copiaFilmInCiak).mockReset().mockResolvedValue(undefined)
  vi.mocked(eliminaFilm).mockClear()
  tieniSerieInCiak('south park', 'South Park')
})

describe('useSerieInCiak', () => {
  it('non ricopia gli episodi già salvati finché non sa quali sono', async () => {
    // La cartella risponde prima dell'elenco delle copie: si ricopiava tutto,
    // gigabyte sul tablet, perché per un attimo «salvato» non c'era niente.
    const { rerender } = monta({ offline: [], offlineLetto: false, letture: 1 })
    await new Promise((r) => setTimeout(r, 20))
    expect(copiaFilmInCiak).not.toHaveBeenCalled()

    rerender({ offline: [salvato('loc-1'), salvato('loc-2')], offlineLetto: true, letture: 1 })
    await new Promise((r) => setTimeout(r, 20))
    expect(copiaFilmInCiak).not.toHaveBeenCalled()
  })

  it('copia quelli che mancano, letto l’elenco', async () => {
    monta({ offline: [salvato('loc-1')], offlineLetto: true, letture: 1 })
    await waitFor(() => expect(copiaFilmInCiak).toHaveBeenCalledTimes(1))
    expect(vi.mocked(copiaFilmInCiak).mock.calls[0][0]).toMatchObject({ id: 'loc-2' })
  })

  it('una copia che finisce dopo «Smetti di tenerla» va via anche lei', async () => {
    let finisci = () => {}
    vi.mocked(copiaFilmInCiak).mockImplementationOnce(() => new Promise<void>((r) => (finisci = r)))
    monta({ offline: [salvato('loc-1')], offlineLetto: true, letture: 1 })
    await waitFor(() => expect(copiaFilmInCiak).toHaveBeenCalledTimes(1))

    act(() => lasciaSerieInCiak('south park'))
    await act(async () => finisci())
    await waitFor(() => expect(eliminaFilm).toHaveBeenCalledWith('loc-2'))
  })
})
