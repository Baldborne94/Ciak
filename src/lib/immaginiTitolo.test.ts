import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getImmaginiTitolo } from './tmdb'

const chieste: URL[] = []
beforeEach(() => {
  chieste.length = 0
  vi.stubGlobal('window', { location: { origin: 'https://ciak.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      chieste.push(new URL(url))
      return new Response(
        JSON.stringify({
          backdrops: [
            { file_path: '/b-poco.jpg', vote_average: 5.1, iso_639_1: null },
            { file_path: '/b-bello.jpg', vote_average: 5.8, iso_639_1: null },
            { file_path: '/b-scritta.jpg', vote_average: 5.5, iso_639_1: 'en' },
          ],
          posters: [{ file_path: '/p1.jpg', vote_average: 5.3, iso_639_1: 'it' }],
        }),
        { status: 200 },
      )
    }),
  )
})

describe('getImmaginiTitolo', () => {
  it('gli sfondi senza scritte prima, i più votati in testa; poi le locandine', async () => {
    const immagini = await getImmaginiTitolo('movie', 129)
    expect(immagini.sfondi).toEqual(['/b-bello.jpg', '/b-poco.jpg', '/b-scritta.jpg'])
    expect(immagini.locandine).toEqual(['/p1.jpg'])
    expect(chieste[0].searchParams.get('path')).toBe('/movie/129/images')
    // Anche le immagini senza lingua (gli sfondi «puliti») e quelle inglesi.
    expect(chieste[0].searchParams.get('include_image_language')).toBe('it,en,null')
  })
})
