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
    // Si parte da quelli da aggiungere: i 131 già dentro non coprono gli altri.
    expect(screen.getByRole('button', { name: 'Da aggiungere (2)', pressed: true })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Toy Story/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /Finding Nemo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Nella saga (2)' }))
    expect(screen.getByRole('checkbox', { name: /Toy Story/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(onSalva).toHaveBeenCalledWith('Pixar', ['movie-862', 'movie-12'])
    await userEvent.click(screen.getByRole('button', { name: 'Sciogli la saga' }))
    expect(onSciogli).toHaveBeenCalled()
  })

  it('una raccolta: si tolgono e si aggiungono titoli, anche serie, e si può eliminare', async () => {
    const onSalva = vi.fn()
    const onSciogli = vi.fn()
    const titoli = [...FILM, { chiave: 'tv-1429', titolo: "L'attacco dei giganti", anno: '2013', poster: null }]
    render(
      <ModificaSaga tipo="raccolta" film={titoli} iniziale={{ nome: 'Natale', chiavi: new Set(['movie-862', 'movie-12']) }} onSalva={onSalva} onSciogli={onSciogli} />,
    )
    expect(screen.getByLabelText('Nome della raccolta')).toHaveValue('Natale')
    expect(screen.getByText('2 titoli scelti')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nella raccolta (2)' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Toy Story/ }))
    // Tolto, resta lì senza spunta: si può rimettere.
    expect(screen.getByRole('checkbox', { name: /Toy Story/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Nella raccolta (1)' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Cerca un titolo'), 'giganti')
    await userEvent.click(screen.getByRole('checkbox', { name: /L'attacco dei giganti/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(onSalva).toHaveBeenCalledWith('Natale', ['movie-12', 'tv-1429'])
    await userEvent.click(screen.getByRole('button', { name: 'Elimina la raccolta' }))
    expect(onSciogli).toHaveBeenCalled()
  })

  it('cercando si trova un film anche se sta dall altra parte', async () => {
    render(<ModificaSaga film={FILM} iniziale={{ nome: 'Pixar', chiavi: new Set(['movie-862']) }} onSalva={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Cerca un film'), 'toy')
    expect(screen.getByRole('checkbox', { name: /Toy Story/ })).toBeChecked()
  })

  it('quando non c è altro da aggiungere lo dice', () => {
    render(<ModificaSaga film={FILM} iniziale={{ nome: 'Tutti', chiavi: new Set(FILM.map((f) => f.chiave)) }} onSalva={vi.fn()} />)
    expect(screen.getByText(/Non c’è altro da aggiungere/)).toBeInTheDocument()
  })

  it('i film di uno studio si spuntano in un colpo, e una nuova ne prende il nome', async () => {
    const onCercaStudio = vi.fn().mockResolvedValue({ studio: 'Pixar', chiavi: new Set(['movie-862', 'movie-12', 'movie-999']) })
    render(<ModificaSaga tipo="raccolta" film={FILM} onSalva={vi.fn()} onCercaStudio={onCercaStudio} />)
    await userEvent.type(screen.getByLabelText('Aggiungi i film di uno studio'), 'pixar{Enter}')
    expect(onCercaStudio).toHaveBeenCalledWith('pixar')
    // movie-999 non è fra quelli qui: non conta.
    expect(await screen.findByRole('status')).toHaveTextContent('Pixar: aggiunti 2 film.')
    expect(screen.getByLabelText('Nome della raccolta')).toHaveValue('Pixar')
    expect(screen.getByRole('checkbox', { name: /Toy Story/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Finding Nemo/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /A Bug’s Life/ })).not.toBeChecked()
  })

  it('uno studio che non esiste lo dice', async () => {
    render(<ModificaSaga film={FILM} onSalva={vi.fn()} onCercaStudio={vi.fn().mockResolvedValue(null)} />)
    await userEvent.type(screen.getByLabelText('Aggiungi i film di uno studio'), 'boh')
    await userEvent.click(screen.getByRole('button', { name: 'Aggiungi' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Nessuno studio «boh» su TMDB.')
  })

  it('una raccolta nuova si crea con «Crea la raccolta»', () => {
    render(<ModificaSaga tipo="raccolta" film={FILM} onSalva={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Crea la raccolta' })).toBeDisabled()
    expect(screen.queryByText(/saga/i)).not.toBeInTheDocument()
  })
})
