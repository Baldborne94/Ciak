import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'

// Il comportamento da tastiera di un dialog è invisibile a occhio e facilissimo
// da rompere: si continua a vederlo bello, mentre il focus è scappato dietro
// alla finestra. Qui si verifica quello che nessuno guarda mai a mano.

function apri(onClose = vi.fn()) {
  render(
    <Modal title="Aggiungi alla lista" onClose={onClose}>
      <button>Primo</button>
      <button>Ultimo</button>
    </Modal>,
  )
  return onClose
}

describe('Modal', () => {
  it('si annuncia come dialog, col suo titolo', () => {
    apri()
    expect(screen.getByRole('dialog', { name: 'Aggiungi alla lista' })).toBeInTheDocument()
  })

  it('porta il focus dentro appena si apre', () => {
    // Senza, chi naviga da tastiera si ritrova a premere Tab dietro al modale.
    apri()
    expect(screen.getByRole('button', { name: 'Chiudi' })).toHaveFocus()
  })

  it('Esc chiude', async () => {
    const onClose = apri()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('Tab sull ultimo elemento torna al primo invece di uscire', async () => {
    apri()
    const chiudi = screen.getByRole('button', { name: 'Chiudi' })
    const ultimo = screen.getByRole('button', { name: 'Ultimo' })

    ultimo.focus()
    await userEvent.tab()

    expect(chiudi).toHaveFocus()
  })

  it('Shift+Tab sul primo elemento va all ultimo', async () => {
    apri()
    const ultimo = screen.getByRole('button', { name: 'Ultimo' })

    screen.getByRole('button', { name: 'Chiudi' }).focus()
    await userEvent.tab({ shift: true })

    expect(ultimo).toHaveFocus()
  })

  it('cliccare fuori chiude, cliccare dentro no', async () => {
    const onClose = apri()

    await userEvent.click(screen.getByRole('button', { name: 'Primo' }))
    expect(onClose).not.toHaveBeenCalled()

    // Lo sfondo scuro attorno al pannello.
    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })
})
