import { describe, it, expect } from 'vitest'
import { tipiDaProvare, titoliDaRiscrivere, type RigaConTitolo } from './titoliItaliani'
import type { TmdbType } from './types'

const riga = (over: Partial<RigaConTitolo>): RigaConTitolo => ({ tmdb_id: 1, media_type: 'movie', title: 'x', poster_path: null, ...over })

describe('titoli salvati in italiano', () => {
  it('un film e una serie si chiedono col loro tipo; un anime o un cartone con tutti e due', () => {
    expect(tipiDaProvare('movie')).toEqual(['movie'])
    expect(tipiDaProvare('tv')).toEqual(['tv'])
    expect(tipiDaProvare('anime')).toEqual(['movie', 'tv'])
    expect(tipiDaProvare('cartoon')).toEqual(['movie', 'tv'])
  })

  it('una richiesta per titolo distinto, anche se sta in più tabelle', async () => {
    const chiesti: string[] = []
    const { titoli } = await titoliDaRiscrivere(
      [riga({ tmdb_id: 238, title: 'The Godfather' }), riga({ tmdb_id: 238, title: 'The Godfather' }), riga({ tmdb_id: 238, media_type: 'tv', title: 'Altro' })],
      async (tipo, id) => {
        chiesti.push(`${tipo}-${id}`)
        return { titolo: tipo === 'movie' ? 'Il padrino' : 'Una serie', posterPath: null }
      },
    )
    expect(chiesti.sort()).toEqual(['movie-238', 'tv-238'])
    // Stesso numero, tipi diversi: due titoli diversi, mai mescolati.
    expect(titoli.get('movie-238')).toBe('Il padrino')
    expect(titoli.get('tv-238')).toBe('Una serie')
  })

  it('per un cartone vale il tipo con la stessa locandina; se nessuno combacia la riga resta com è', async () => {
    const tmdb: Record<string, { titolo: string; posterPath: string }> = {
      'movie-12': { titolo: 'Alla ricerca di Nemo', posterPath: '/nemo.jpg' },
      'tv-12': { titolo: 'Una serie qualunque', posterPath: '/altro.jpg' },
    }
    const chiedi = async (tipo: TmdbType, id: number) => tmdb[`${tipo}-${id}`]
    const { titoli } = await titoliDaRiscrivere(
      [riga({ tmdb_id: 12, media_type: 'cartoon', title: 'Finding Nemo', poster_path: '/nemo.jpg' }), riga({ tmdb_id: 12, media_type: 'anime', title: 'Boh', poster_path: '/diversa.jpg' })],
      chiedi,
    )
    expect(titoli.get('cartoon-12')).toBe('Alla ricerca di Nemo')
    expect(titoli.has('anime-12')).toBe(false)
  })

  it('un anime che non esiste come film (404) si trova come serie, senza contarlo fra i fallimenti', async () => {
    const { titoli, falliti } = await titoliDaRiscrivere([riga({ tmdb_id: 1429, media_type: 'anime', title: 'Attack on Titan', poster_path: '/aot.jpg' })], async (tipo) => {
      if (tipo === 'movie') throw new Error('404')
      return { titolo: "L'attacco dei giganti", posterPath: '/aot.jpg' }
    })
    expect(titoli.get('anime-1429')).toBe("L'attacco dei giganti")
    expect(falliti).toBe(0)
  })

  it('un titolo illeggibile non sostituisce quello salvato, e un errore si conta', async () => {
    const { titoli, falliti } = await titoliDaRiscrivere([riga({ tmdb_id: 1, title: 'Squid Game' }), riga({ tmdb_id: 2, title: 'Brat' })], async (_t, id) => {
      if (id === 2) throw new Error('rete')
      return { titolo: '오징어 게임', posterPath: null }
    })
    expect(titoli.size).toBe(0)
    expect(falliti).toBe(1)
  })
})
