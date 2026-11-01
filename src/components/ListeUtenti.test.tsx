import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ListeUtenti from './ListeUtenti'
import { getListeConTitolo, type ListaUtente } from '../lib/tmdb'

vi.mock('../lib/tmdb', async (originale) => ({
  ...(await originale<typeof import('../lib/tmdb')>()),
  getListeConTitolo: vi.fn(),
}))
vi.mock('../lib/logFailure', () => ({ logFailure: () => vi.fn() }))
const liste = vi.mocked(getListeConTitolo)

function l(id: number, nome: string, over: Partial<ListaUtente> = {}): ListaUtente {
  return { id, nome, descrizione: '', quanti: 10, preferiti: 0, posterPath: null, ...over }
}

beforeEach(() => vi.clearAllMocks())

const monta = () =>
  render(
    <MemoryRouter>
      <ListeUtenti type="movie" id={550} />
    </MemoryRouter>,
  )

describe('ListeUtenti', () => {
  it('ogni lista porta alla sua pagina in Ciak, con quanti titoli e quanti la seguono', async () => {
    liste.mockResolvedValue([l(8228510, 'Horror coreani', { quanti: 24, preferiti: 7, descrizione: 'I migliori dal 2000' })])
    monta()
    const link = await screen.findByRole('link', { name: /Horror coreani/ })
    expect(link).toHaveAttribute('href', '/lista-tmdb/8228510')
    expect(screen.getByText('24 titoli · ♥ 7')).toBeInTheDocument()
    expect(screen.getByText('I migliori dal 2000')).toBeInTheDocument()
  })

  it('ne mostra sei, e le altre a richiesta', async () => {
    liste.mockResolvedValue(Array.from({ length: 8 }, (_, i) => l(i + 1, `Lista ${i + 1}`)))
    monta()
    await screen.findByText('Lista 1')
    expect(screen.queryByText('Lista 7')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mostra tutte le liste (8)' }))
    expect(screen.getByText('Lista 8')).toBeInTheDocument()
  })

  it('senza liste la sezione non c è', async () => {
    liste.mockResolvedValue([])
    monta()
    await vi.waitFor(() => expect(liste).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: /Nelle liste degli utenti/ })).not.toBeInTheDocument()
  })
})
