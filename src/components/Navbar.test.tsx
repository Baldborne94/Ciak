import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'
import { useAuth } from '../lib/auth'
import { useIdentityCtx } from '../lib/identityCtx'

vi.mock('../lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/identityCtx', () => ({ useIdentityCtx: vi.fn() }))

// Su telefono la navigazione era una striscia che scorreva in orizzontale: di
// tredici voci se ne vedevano quattro, e le altre stavano oltre il bordo senza
// che niente lo segnalasse. Questi test guardano che il menu le mostri tutte.

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'u1', email: 'io@ciak.test' },
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(useIdentityCtx).mockReturnValue({
    nickname: null,
    avatarUrl: null,
  } as unknown as ReturnType<typeof useIdentityCtx>)
})

function monta(percorso = '/') {
  return render(
    <MemoryRouter initialEntries={[percorso]}>
      <Navbar />
    </MemoryRouter>,
  )
}

describe('Navbar, il menu compatto', () => {
  it('parte chiuso e lo dichiara', () => {
    monta()
    expect(screen.getByRole('button', { name: /Menu/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Menu principale' })).not.toBeInTheDocument()
  })

  it('aperto, mostra ogni destinazione — comprese quelle che prima finivano fuori schermo', async () => {
    const utente = userEvent.setup()
    monta()
    await utente.click(screen.getByRole('button', { name: /Menu/ }))

    const menu = screen.getByRole('navigation', { name: 'Menu principale' })
    for (const voce of [
      'Sala', 'Cerca', '✨ AI', 'In arrivo', '📊 Statistiche', '❓ Guida',
      'Da vedere', 'In corso', 'Abbandonati', 'Visti & Diario', 'Preferiti',
      'Liste personali', 'Profilo',
    ]) {
      expect(within(menu).getByRole('link', { name: voce }), voce).toBeInTheDocument()
    }
  })

  it('si richiude, e il pulsante lo dice', async () => {
    const utente = userEvent.setup()
    monta()
    const pulsante = screen.getByRole('button', { name: /Menu/ })

    await utente.click(pulsante)
    expect(pulsante).toHaveAttribute('aria-expanded', 'true')

    await utente.click(pulsante)
    expect(pulsante).toHaveAttribute('aria-expanded', 'false')
  })

  it('Esc chiude il menu', async () => {
    const utente = userEvent.setup()
    monta()
    await utente.click(screen.getByRole('button', { name: /Menu/ }))

    await utente.keyboard('{Escape}')

    expect(screen.queryByRole('navigation', { name: 'Menu principale' })).not.toBeInTheDocument()
  })
})
