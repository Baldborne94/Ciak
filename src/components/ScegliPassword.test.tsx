import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScegliPassword from './ScegliPassword'

// La password si sceglie due volte: sbagliarla scrivendo vuol dire restare
// fuori al prossimo accesso, ora che non c'è più Google come scorciatoia.

async function scrivi(prima: string, seconda: string) {
  await userEvent.type(screen.getByLabelText('Nuova password'), prima)
  await userEvent.type(screen.getByLabelText('Ripetila'), seconda)
  await userEvent.click(screen.getByRole('button', { name: 'Salva la password' }))
}

describe('ScegliPassword', () => {
  it('due password diverse non partono', async () => {
    const onSalva = vi.fn()
    render(<ScegliPassword onSalva={onSalva} />)
    await scrivi('popcorn1', 'popcorn2')
    expect(screen.getByRole('alert')).toHaveTextContent('non sono uguali')
    expect(onSalva).not.toHaveBeenCalled()
  })

  it('troppo corta lo dice prima di Supabase', async () => {
    const onSalva = vi.fn()
    render(<ScegliPassword onSalva={onSalva} />)
    await scrivi('abc', 'abc')
    expect(screen.getByRole('alert')).toHaveTextContent('Almeno 6 caratteri')
    expect(onSalva).not.toHaveBeenCalled()
  })

  it('salvata, lo dice e svuota i campi', async () => {
    const onSalva = vi.fn(async () => null)
    const onFatto = vi.fn()
    render(<ScegliPassword onSalva={onSalva} onFatto={onFatto} />)
    await scrivi('popcorn1', 'popcorn1')
    expect(onSalva).toHaveBeenCalledWith('popcorn1')
    expect(onFatto).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Password salvata')
    expect(screen.getByLabelText('Nuova password')).toHaveValue('')
  })

  it("un rifiuto di Supabase si vede, e i campi restano per riprovare", async () => {
    render(<ScegliPassword onSalva={async () => 'New password should be different from the old password.'} />)
    await scrivi('popcorn1', 'popcorn1')
    expect(screen.getByRole('alert')).toHaveTextContent('Password non salvata: New password should be different')
    expect(screen.getByLabelText('Nuova password')).toHaveValue('popcorn1')
  })
})
