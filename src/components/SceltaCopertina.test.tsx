import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SceltaCopertina from './SceltaCopertina'
import { getImmaginiTitolo } from '../lib/tmdb'

vi.mock('../lib/tmdb', async (originale) => ({
  ...(await originale<typeof import('../lib/tmdb')>()),
  getImmaginiTitolo: vi.fn(),
}))
const immagini = vi.mocked(getImmaginiTitolo)
const TITOLI = [{ tmdbId: 129, mediaType: 'movie' as const, titolo: 'La città incantata' }]

beforeEach(() => {
  vi.clearAllMocks()
  immagini.mockResolvedValue({ sfondi: ['/sfondo1.jpg', '/sfondo2.jpg'], locandine: ['/loc1.jpg'] })
})

describe('SceltaCopertina', () => {
  it('mostra sfondi e locandine dei titoli, e scegliere ne salva il percorso', async () => {
    const onScegli = vi.fn()
    render(<SceltaCopertina titoli={TITOLI} attuale={null} onScegli={onScegli} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sfondo 2 di «La città incantata»' }))
    expect(onScegli).toHaveBeenCalledWith('/sfondo2.jpg')
    expect(screen.getByRole('button', { name: 'Locandina 1 di «La città incantata»' })).toBeInTheDocument()
  })

  it('un link incollato si usa solo se è https', async () => {
    const onScegli = vi.fn()
    render(<SceltaCopertina titoli={TITOLI} attuale={null} onScegli={onScegli} />)
    const campo = screen.getByLabelText('Link di un’immagine')
    await userEvent.type(campo, 'http://example.com/a.jpg')
    await userEvent.click(screen.getByRole('button', { name: 'Usa questo link' }))
    expect(onScegli).not.toHaveBeenCalled()
    expect(screen.getByText(/serve un link che comincia con https/)).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, 'https://example.com/a.jpg')
    await userEvent.click(screen.getByRole('button', { name: 'Usa questo link' }))
    expect(onScegli).toHaveBeenCalledWith('https://example.com/a.jpg')
  })

  it('si torna al mosaico automatico', async () => {
    const onScegli = vi.fn()
    render(<SceltaCopertina titoli={TITOLI} attuale="/sfondo1.jpg" onScegli={onScegli} />)
    await userEvent.click(screen.getByRole('button', { name: 'Usa il mosaico delle locandine' }))
    expect(onScegli).toHaveBeenCalledWith(null)
  })
})
