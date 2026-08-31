import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import OfflineBanner from './OfflineBanner'
import { segnalaCopia, segnalaDatiFreschi } from '../lib/offlineState'

beforeEach(() => {
  act(() => segnalaDatiFreschi())
})

describe('OfflineBanner', () => {
  it('non dice niente quando i dati sono freschi', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('compare quando si sta servendo una copia, e dice di quando è', () => {
    render(<OfflineBanner />)
    act(() => segnalaCopia(new Date().toISOString()))

    const banda = screen.getByRole('status')
    expect(banda).toHaveTextContent('Senza connessione')
    expect(banda).toHaveTextContent('oggi')
    // La parte che evita il danno peggiore: chi guarda deve sapere che quello
    // che fa adesso non viene salvato.
    expect(banda).toHaveTextContent('non verranno salvate')
  })

  it('sparisce appena la rete torna a rispondere', () => {
    render(<OfflineBanner />)
    act(() => segnalaCopia(new Date().toISOString()))
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => segnalaDatiFreschi())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
