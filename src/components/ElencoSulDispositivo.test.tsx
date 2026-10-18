import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ElencoSulDispositivo from './ElencoSulDispositivo'
import type { FilmOffline } from '../lib/filmOffline'

// I film salvati in Ciak in cima alla videoteca: gli episodi di una serie in
// una riga sola, che si apre.

const MB = 1024 ** 2
function film(id: string, titolo: string, over: Partial<FilmOffline> = {}): FilmOffline {
  return { id, titolo, file: `${id}.mp4`, dimensione: 300 * MB, stato: 'completo', ...over }
}

describe('ElencoSulDispositivo', () => {
  it('raccoglie gli episodi sotto la loro serie, coi film accanto', async () => {
    const onApri = vi.fn()
    render(
      <ElencoSulDispositivo
        film={[
          film('loc-p', 'Paprika'),
          film('loc-1', 'South Park · S3E1', { serie: 'South Park' }),
          film('loc-2', 'South Park · S3E2', { serie: 'South Park' }),
        ]}
        spazioUsato={null}
        onApri={onApri}
      />,
    )
    expect(screen.getByRole('button', { name: /Paprika/ })).toBeInTheDocument()
    expect(screen.getByText('2 episodi · 600 MB')).toBeInTheDocument()
    // Chiusa, gli episodi non si vedono.
    expect(screen.getByRole('button', { name: /S3E1/ })).not.toBeVisible()

    await userEvent.click(screen.getByText('South Park'))
    expect(screen.getByRole('button', { name: /S3E1/ })).toBeVisible()
    const episodi = screen.getByRole('list', { name: 'Episodi di South Park sul dispositivo' })
    await userEvent.click(within(episodi).getByRole('button', { name: /S3E2/ }))
    expect(onApri).toHaveBeenCalledWith(expect.objectContaining({ id: 'loc-2' }))
  })

  it('un film ancora in copia si vede ma non si apre', () => {
    render(<ElencoSulDispositivo film={[film('loc-p', 'Paprika', { stato: 'in-corso' })]} spazioUsato={null} onApri={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Paprika/ })).toBeDisabled()
  })
})
