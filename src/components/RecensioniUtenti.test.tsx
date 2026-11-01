import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecensioniUtenti from './RecensioniUtenti'
import { getRecensioni, type Recensione } from '../lib/tmdb'

vi.mock('../lib/tmdb', async (originale) => ({
  ...(await originale<typeof import('../lib/tmdb')>()),
  getRecensioni: vi.fn(),
}))
vi.mock('../lib/logFailure', () => ({ logFailure: () => vi.fn() }))
const recensioni = vi.mocked(getRecensioni)

function r(id: string, over: Partial<Recensione> = {}): Recensione {
  return { id, autore: `Autore ${id}`, voto: null, testo: `Testo della recensione ${id}`, data: '2024-03-05T10:00:00Z', url: `https://www.themoviedb.org/review/${id}`, lingua: 'en', ...over }
}

beforeEach(() => vi.clearAllMocks())

describe('RecensioniUtenti', () => {
  it('mostra autore, voto e lingua, e il link alla recensione su TMDB', async () => {
    recensioni.mockResolvedValue([r('a', { autore: 'Anna', voto: 8 })])
    render(<RecensioniUtenti type="movie" id={550} />)
    expect(await screen.findByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('★ 8/10')).toBeInTheDocument()
    expect(screen.getByText(/in inglese/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Su TMDB ↗' })).toHaveAttribute('href', 'https://www.themoviedb.org/review/a')
    expect(recensioni).toHaveBeenCalledWith('movie', 550)
  })

  it('una recensione lunga si legge tagliata, e «Leggi tutta» la apre', async () => {
    const lunga = `${'parola '.repeat(100)}FINALE`
    recensioni.mockResolvedValue([r('a', { testo: lunga })])
    render(<RecensioniUtenti type="movie" id={1} />)
    const apri = await screen.findByRole('button', { name: 'Leggi tutta' })
    expect(screen.queryByText(/FINALE/)).not.toBeInTheDocument()
    await userEvent.click(apri)
    expect(screen.getByText(/FINALE/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Riduci' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('ne mostra tre, e le altre a richiesta', async () => {
    recensioni.mockResolvedValue(['a', 'b', 'c', 'd', 'e'].map((id) => r(id)))
    render(<RecensioniUtenti type="tv" id={2} />)
    await screen.findByText('Autore a')
    expect(screen.queryByText('Autore d')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mostra tutte le recensioni (5)' }))
    expect(screen.getByText('Autore e')).toBeInTheDocument()
  })

  it('senza recensioni lo dice, invece di lasciare un titolo vuoto', async () => {
    recensioni.mockResolvedValue([])
    render(<RecensioniUtenti type="movie" id={3} />)
    expect(await screen.findByText('Ancora nessuna recensione su TMDB per questo titolo.')).toBeInTheDocument()
  })

  it('se TMDB non risponde lo dice', async () => {
    recensioni.mockRejectedValue(new Error('500'))
    render(<RecensioniUtenti type="movie" id={4} />)
    expect(await screen.findByText(/non rispondono/)).toBeInTheDocument()
  })
})
