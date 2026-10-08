import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModificaSaga from './ModificaSaga'

const FILM = [
  { chiave: 'movie-862', titolo: 'Toy Story', anno: '1995', poster: null },
  { chiave: 'movie-9487', titolo: 'A Bug’s Life', anno: '1998', poster: null },
  { chiave: 'movie-12', titolo: 'Finding Nemo', anno: '2003', poster: null },
]

describe('ModificaSaga', () => {
  it('nuova: un nome e i film scelti, e si salva', async () => {
    const onSalva = vi.fn()
    render(<ModificaSaga film={FILM} onSalva={onSalva} />)
    const salva = screen.getByRole('button', { name: 'Crea la saga' })
    expect(salva).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Nome della saga'), 'Pixar anni 90')
    await userEvent.click(screen.getByRole('checkbox', { name: /Toy Story/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /A Bug’s Life/ }))
    await userEvent.click(salva)
    expect(onSalva).toHaveBeenCalledWith('Pixar anni 90', ['movie-862', 'movie-9487'])
  })

  it('si cerca fra i film, e quelli scelti restano scelti', async () => {
    render(<ModificaSaga film={FILM} onSalva={vi.fn()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Toy Story/ }))
    await userEvent.type(screen.getByLabelText('Cerca un film'), 'nemo')
    expect(screen.queryByRole('checkbox', { name: /Toy Story/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Finding Nemo/ })).toBeInTheDocument()
    expect(screen.getByText('1 film scelto')).toBeInTheDocument()
  })

  it('esistente: parte dai suoi film, e si può sciogliere', async () => {
    const onSalva = vi.fn()
    const onSciogli = vi.fn()
    render(<ModificaSaga film={FILM} iniziale={{ nome: 'Pixar', chiavi: new Set(['movie-862']) }} onSalva={onSalva} onSciogli={onSciogli} />)
    expect(screen.getByRole('checkbox', { name: /Toy Story/ })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: /Finding Nemo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(onSalva).toHaveBeenCalledWith('Pixar', ['movie-862', 'movie-12'])
    await userEvent.click(screen.getByRole('button', { name: 'Sciogli la saga' }))
    expect(onSciogli).toHaveBeenCalled()
  })
})
