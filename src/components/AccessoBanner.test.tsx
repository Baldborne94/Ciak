import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccessoBanner from './AccessoBanner'
import { useAuth } from '../lib/auth'

vi.mock('../lib/auth', () => ({ useAuth: vi.fn() }))
const auth = vi.mocked(useAuth)
const chiudi = vi.fn()

function conErrore(erroreAccesso: string | null) {
  auth.mockReturnValue({ erroreAccesso, chiudiErroreAccesso: chiudi } as unknown as ReturnType<typeof useAuth>)
}

beforeEach(() => vi.clearAllMocks())

describe('AccessoBanner', () => {
  it("tace quando l'accesso non ha dato errori", () => {
    conErrore(null)
    render(<AccessoBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("dice perché l'accesso con Google non è riuscito, e si può chiudere", async () => {
    conErrore('Ciak non accetta account nuovi.')
    render(<AccessoBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent('Ciak non accetta account nuovi.')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(chiudi).toHaveBeenCalled()
  })
})
