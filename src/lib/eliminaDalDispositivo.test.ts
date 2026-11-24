import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FilmOffline } from './filmOffline'

// Togliere da «Sul dispositivo» un film o una serie intera: le copie salvate in
// Ciak, non i file del NAS o del disco.

const eliminati: string[] = []
const fallisce = new Set<string>()
vi.mock('./filmOffline', () => ({
  eliminaFilm: vi.fn(async (id: string) => {
    if (fallisce.has(id)) throw new Error('cache non disponibile')
    eliminati.push(id)
  }),
}))
const tenute: Record<string, { titolo: string; liberaDopoVisione: boolean }> = {}
const lasciate: string[] = []
vi.mock('./serieInCiak', () => ({
  leggiSerieInCiak: () => tenute,
  lasciaSerieInCiak: (cartella: string) => void lasciate.push(cartella),
}))
const segnalati: string[] = []
vi.mock('./logFailure', () => ({ logFailure: (contesto: string) => () => void segnalati.push(contesto) }))

const { eliminaDalDispositivo } = await import('./eliminaDalDispositivo')

const ep = (id: string, serie: string | null = 'South Park'): FilmOffline => ({ id, titolo: id, file: `${id}.mp4`, dimensione: 1, stato: 'completo', serie })

beforeEach(() => {
  eliminati.length = 0
  lasciate.length = 0
  segnalati.length = 0
  fallisce.clear()
  for (const k of Object.keys(tenute)) delete tenute[k]
})

describe('eliminaDalDispositivo', () => {
  it('toglie tutte le copie scelte e dice quante', async () => {
    expect(await eliminaDalDispositivo([ep('loc-1'), ep('loc-2'), ep('loc-3')], { serieIntera: true })).toEqual({ tolti: 3, falliti: 0 })
    expect(eliminati).toEqual(['loc-1', 'loc-2', 'loc-3'])
  })

  it('una serie tolta per intero smette di essere tenuta in Ciak, se no gli episodi tornerebbero alla prossima lettura', async () => {
    tenute['E:/Ciak/SERIE TV/South Park'] = { titolo: 'South Park', liberaDopoVisione: true }
    tenute['E:/Ciak/SERIE TV/Futurama'] = { titolo: 'Futurama', liberaDopoVisione: true }
    await eliminaDalDispositivo([ep('loc-1'), ep('loc-2')], { serieIntera: true })
    expect(lasciate).toEqual(['E:/Ciak/SERIE TV/South Park'])
  })

  it('un episodio solo non tocca la serie tenuta', async () => {
    tenute['E:/Ciak/SERIE TV/South Park'] = { titolo: 'South Park', liberaDopoVisione: true }
    await eliminaDalDispositivo([ep('loc-1')], { serieIntera: false })
    expect(lasciate).toEqual([])
  })

  it('un errore non ferma gli altri, e si segnala una volta col totale', async () => {
    fallisce.add('loc-2')
    expect(await eliminaDalDispositivo([ep('loc-1'), ep('loc-2'), ep('loc-3')], { serieIntera: true })).toEqual({ tolti: 2, falliti: 1 })
    expect(eliminati).toEqual(['loc-1', 'loc-3'])
    expect(segnalati).toEqual(['Copie sul dispositivo: 1 su 3 non tolte'])
  })
})
