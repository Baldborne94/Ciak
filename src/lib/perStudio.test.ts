import { describe, it, expect, vi } from 'vitest'
import { filmDelloStudio } from './perStudio'
import type { MediaItem } from './types'

const film = (id: number) => ({ id, mediaType: 'movie', title: `Film ${id}` }) as MediaItem

describe('filmDelloStudio', () => {
  it('prende il primo studio trovato e tutte le sue pagine di film', async () => {
    const searchCompany = vi.fn().mockResolvedValue([{ id: 10342, name: 'Studio Ghibli', logoPath: null }])
    const discoverByCompany = vi.fn(async (_id: number, pagina = 1) => ({ items: pagina === 1 ? [film(129), film(4935)] : [film(81)], totalPages: 2 }))
    const esito = await filmDelloStudio('ghibli', { searchCompany, discoverByCompany })
    expect(esito?.studio).toBe('Studio Ghibli')
    expect([...(esito?.chiavi ?? [])]).toEqual(['movie-129', 'movie-4935', 'movie-81'])
    expect(discoverByCompany).toHaveBeenCalledWith(10342, 2)
  })

  it('uno studio enorme si ferma a un tetto di pagine', async () => {
    const discoverByCompany = vi.fn(async (_id: number, pagina = 1) => ({ items: [film(pagina)], totalPages: 500 }))
    await filmDelloStudio('disney', { searchCompany: vi.fn().mockResolvedValue([{ id: 2, name: 'Disney', logoPath: null }]), discoverByCompany })
    expect(discoverByCompany).toHaveBeenCalledTimes(10)
  })

  it('nessuno studio con quel nome: null', async () => {
    expect(await filmDelloStudio('xyz', { searchCompany: vi.fn().mockResolvedValue([]), discoverByCompany: vi.fn() })).toBeNull()
  })
})
