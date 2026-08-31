import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// La rete di sicurezza contro lo schermo bianco. Provarla in un browser vero
// significa rompere una pagina apposta; qui basta un componente che esplode.

function Esplode(): never {
  throw new Error('boom')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('lascia passare i figli quando non succede niente', () => {
    render(
      <ErrorBoundary>
        <p>Contenuto</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Contenuto')).toBeInTheDocument()
  })

  it('sostituisce lo schermo bianco con un messaggio e una via d uscita', () => {
    // React stampa comunque l'errore: lo zittiamo per non sporcare l'output
    // dei test, ma il componente lo registra lo stesso (verificato sotto).
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Esplode />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Qualcosa è andato storto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ricarica/ })).toBeInTheDocument()
    // Un errore ingoiato in silenzio è un errore che non si trova mai. Va
    // cercata la NOSTRA riga: React ne stampa una sua comunque, e un
    // `toHaveBeenCalled()` generico passerebbe anche togliendo la nostra.
    expect(console_).toHaveBeenCalledWith(
      'Errore non gestito:',
      expect.any(Error),
      expect.anything(),
    )
  })
})
