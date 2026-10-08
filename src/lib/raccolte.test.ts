import { describe, it, expect } from 'vitest'
import { chiaviElemento, copertinaUrl, costruisciRaccolte, linkCopertinaValido } from './raccolte'

describe('chiaviElemento', () => {
  it('film e serie con la loro chiave composta: un film e una serie possono avere lo stesso id', () => {
    expect(chiaviElemento('movie', 7)).toEqual(['movie-7'])
    expect(chiaviElemento('tv', 7)).toEqual(['tv-7'])
  })

  it('anime e cartoni possono essere film o serie: la lista non lo dice, valgono tutti e due', () => {
    expect(chiaviElemento('anime', 129)).toEqual(['movie-129', 'tv-129'])
    expect(chiaviElemento('cartoon', 3)).toEqual(['movie-3', 'tv-3'])
  })
})

describe('costruisciRaccolte', () => {
  it('ogni lista con i suoi titoli, nell’ordine delle liste', () => {
    const raccolte = costruisciRaccolte(
      [
        { id: 'l2', name: 'Natale', copertina: '/natale.jpg', come_saga: true },
        { id: 'l1', name: 'Studio Ghibli' },
      ],
      [
        { list_id: 'l1', tmdb_id: 129, media_type: 'movie' },
        { list_id: 'l1', tmdb_id: 4935, media_type: 'movie' },
        { list_id: 'l2', tmdb_id: 771, media_type: 'movie' },
        { list_id: 'altra', tmdb_id: 1, media_type: 'movie' },
      ],
    )
    expect(raccolte.map((r) => [r.id, r.nome, [...r.chiavi], r.copertina, r.comeSaga])).toEqual([
      ['l2', 'Natale', ['movie-771'], '/natale.jpg', true],
      ['l1', 'Studio Ghibli', ['movie-129', 'movie-4935'], null, false],
    ])
  })
})

describe('copertinaUrl', () => {
  it('un percorso di TMDB diventa l’immagine larga, nella misura chiesta', () => {
    expect(copertinaUrl('/sfondo.jpg')).toBe('https://image.tmdb.org/t/p/w1280/sfondo.jpg')
    expect(copertinaUrl('/sfondo.jpg', 'w780')).toBe('https://image.tmdb.org/t/p/w780/sfondo.jpg')
  })

  it('un link incollato si usa così com’è, solo se https', () => {
    expect(copertinaUrl('https://example.com/ghibli.jpg')).toBe('https://example.com/ghibli.jpg')
    expect(copertinaUrl('http://example.com/ghibli.jpg')).toBeNull()
    expect(copertinaUrl('javascript:alert(1)')).toBeNull()
  })

  it('nessuna copertina: niente, e Ciak fa il mosaico', () => {
    expect(copertinaUrl(null)).toBeNull()
    expect(copertinaUrl('')).toBeNull()
  })
})

describe('linkCopertinaValido', () => {
  it('accetta solo indirizzi https completi', () => {
    expect(linkCopertinaValido(' https://example.com/a.png ')).toBe('https://example.com/a.png')
    expect(linkCopertinaValido('example.com/a.png')).toBeNull()
    expect(linkCopertinaValido('http://example.com/a.png')).toBeNull()
    expect(linkCopertinaValido('https://')).toBeNull()
  })
})
