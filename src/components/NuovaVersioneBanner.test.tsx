import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NuovaVersioneBanner from './NuovaVersioneBanner'

// Una scheda aperta da prima di un aggiornamento usa il codice vecchio: le
// correzioni appena pubblicate sembravano non funzionare.

describe('NuovaVersioneBanner', () => {
  it('tace finché la versione pubblicata è la stessa', async () => {
    const controlla = vi.fn().mockResolvedValue('abc123')
    render(<NuovaVersioneBanner versione="abc123" controlla={controlla} />)
    await waitFor(() => expect(controlla).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('con una versione nuova online propone di aggiornare, e ricarica', async () => {
    const ricarica = vi.fn()
    render(<NuovaVersioneBanner versione="abc123" controlla={async () => 'def456'} ricarica={ricarica} />)
    expect(await screen.findByText('È disponibile una nuova versione di Ciak.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aggiorna' }))
    expect(ricarica).toHaveBeenCalledOnce()
  })

  it('«Più tardi» lo nasconde', async () => {
    render(<NuovaVersioneBanner versione="abc123" controlla={async () => 'def456'} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Più tardi' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('se non si sa (offline, file assente) non dice niente', async () => {
    const controlla = vi.fn().mockResolvedValue(null)
    render(<NuovaVersioneBanner versione="abc123" controlla={controlla} />)
    await waitFor(() => expect(controlla).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('in sviluppo non controlla nemmeno', async () => {
    const controlla = vi.fn().mockResolvedValue('def456')
    render(<NuovaVersioneBanner versione="dev" controlla={controlla} />)
    await new Promise((r) => setTimeout(r, 10))
    expect(controlla).not.toHaveBeenCalled()
  })

  it('ricontrolla tornando sulla scheda', async () => {
    const controlla = vi.fn().mockResolvedValueOnce('abc123').mockResolvedValue('def456')
    render(<NuovaVersioneBanner versione="abc123" controlla={controlla} />)
    await waitFor(() => expect(controlla).toHaveBeenCalledTimes(1))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })
})
