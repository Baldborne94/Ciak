import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AvvisoRipresa, { MS_AVVISO_RIPRESA } from './AvvisoRipresa'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('AvvisoRipresa', () => {
  it('dice da dove si riparte, poi sparisce da solo', () => {
    render(<AvvisoRipresa da={91} onRicomincia={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Ripreso da 1:31')
    act(() => vi.advanceTimersByTime(MS_AVVISO_RIPRESA + 100))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('«Ricomincia dall’inizio» ricomincia e chiude l avviso', () => {
    const onRicomincia = vi.fn()
    render(<AvvisoRipresa da={91} onRicomincia={onRicomincia} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ricomincia dall’inizio' }))
    expect(onRicomincia).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('senza ripresa non c è', () => {
    render(<AvvisoRipresa da={null} onRicomincia={() => {}} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
