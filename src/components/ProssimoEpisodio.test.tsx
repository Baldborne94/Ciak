import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import ProssimoEpisodio from './ProssimoEpisodio'

// Timer finti: il conto alla rovescia vero durerebbe dieci secondi.
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const passano = (secondi: number) => act(() => vi.advanceTimersByTime(secondi * 1000))

describe('ProssimoEpisodio', () => {
  it('durante la sigla finale è un pulsante, e non parte da solo', () => {
    const onVai = vi.fn()
    render(<ProssimoEpisodio etichetta="S1E2" finito={false} onVai={onVai} />)
    passano(30)
    expect(onVai).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '⏭ Prossimo episodio: S1E2' }))
    expect(onVai).toHaveBeenCalledTimes(1)
  })

  it('a episodio finito conta alla rovescia e poi passa al prossimo', () => {
    const onVai = vi.fn()
    render(<ProssimoEpisodio etichetta="S1E2" finito onVai={onVai} />)
    expect(screen.getByText('S1E2 fra 10 s')).toBeInTheDocument()
    passano(4)
    expect(screen.getByText('S1E2 fra 6 s')).toBeInTheDocument()
    expect(onVai).not.toHaveBeenCalled()
    passano(6)
    expect(onVai).toHaveBeenCalledTimes(1)
  })

  it('«Guarda ora» non aspetta', () => {
    const onVai = vi.fn()
    render(<ProssimoEpisodio etichetta="S1E2" finito onVai={onVai} />)
    fireEvent.click(screen.getByRole('button', { name: '▶ Guarda ora' }))
    expect(onVai).toHaveBeenCalledTimes(1)
  })

  it('«Annulla» ferma il conto e sparisce', () => {
    const onVai = vi.fn()
    render(<ProssimoEpisodio etichetta="S1E2" finito onVai={onVai} />)
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    passano(20)
    expect(onVai).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Prossimo episodio' })).not.toBeInTheDocument()
  })

  it('chiuso durante la sigla, a fine episodio non riparte da solo', () => {
    const onVai = vi.fn()
    const { rerender } = render(<ProssimoEpisodio etichetta="S1E2" finito={false} onVai={onVai} />)
    fireEvent.click(screen.getByRole('button', { name: 'Non passare al prossimo episodio' }))
    rerender(<ProssimoEpisodio etichetta="S1E2" finito onVai={onVai} />)
    passano(20)
    expect(onVai).not.toHaveBeenCalled()
  })
})
