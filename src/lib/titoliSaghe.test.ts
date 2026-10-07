import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTitleSagas } from './tmdb'

// I test unitari girano in node: niente localStorage né window.
function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  }
}

const richieste: string[] = []
beforeEach(() => {
  richieste.length = 0
  vi.stubGlobal('localStorage', fakeLocalStorage())
  vi.stubGlobal('window', { location: { origin: 'https://ciak.test' } })
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).searchParams.get('path') ?? ''
      richieste.push(path)
      const corpo =
        path === '/movie/348'
          ? { id: 348, title: 'Alien', belongs_to_collection: { id: 8091, name: 'Alien Collection', poster_path: '/alien.jpg' } }
          : { id: 490, title: 'The Seventh Seal', belongs_to_collection: null }
      return new Response(JSON.stringify(corpo), { status: 200 })
    }),
  )
})

describe('getTitleSagas', () => {
  it('legge la saga dal dettaglio del film, col nome ripulito', async () => {
    const { saghe, falliti } = await getTitleSagas([
      { tmdbId: 348, mediaType: 'movie' },
      { tmdbId: 490, mediaType: 'movie' },
    ])
    expect(falliti).toBe(0)
    expect(saghe.get('movie-348')).toEqual({ id: 8091, name: 'Alien', posterPath: '/alien.jpg' })
    expect(saghe.get('movie-490')).toBeNull()
  })

  it('la seconda volta non chiede niente: anche «nessuna saga» resta in cache', async () => {
    await getTitleSagas([{ tmdbId: 348, mediaType: 'movie' }, { tmdbId: 490, mediaType: 'movie' }])
    richieste.length = 0
    const { saghe } = await getTitleSagas([{ tmdbId: 348, mediaType: 'movie' }, { tmdbId: 490, mediaType: 'movie' }])
    expect(richieste).toEqual([])
    expect(saghe.get('movie-490')).toBeNull()
  })
})
