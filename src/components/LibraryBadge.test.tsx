import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LibraryBadge from './LibraryBadge'
import type { TitleStatus } from '../lib/types'

// L'etichetta «questo ce l'hai già». Il bug che ha aperto la strada a questo
// componente era proprio un titolo visto che non risultava visto: le parole
// esatte contano, perché sono l'unica cosa che l'utente legge.

describe('LibraryBadge', () => {
  it.each([
    ['watched', '✓ Visto'],
    ['in_progress', '▶ In corso'],
    ['to_watch', '🎟️ In lista'],
    ['abandoned', '✕ Mollato'],
  ] as [TitleStatus, string][])('lo stato %s si legge «%s»', (stato, testo) => {
    render(<LibraryBadge status={stato} />)
    expect(screen.getByText(testo)).toBeInTheDocument()
  })

  it('il cuore compare solo sui preferiti', () => {
    const { rerender } = render(<LibraryBadge status="watched" />)
    expect(screen.queryByLabelText('preferito')).not.toBeInTheDocument()

    rerender(<LibraryBadge status="watched" isFavorite />)
    expect(screen.getByLabelText('preferito')).toBeInTheDocument()
  })

  it('uno stato che non conosciamo non disegna niente', () => {
    // Meglio nessuna etichetta che una vuota appiccicata sulla locandina: può
    // arrivare da una riga vecchia del database, e non deve rompere la griglia.
    const { container } = render(<LibraryBadge status={'boh' as TitleStatus} />)
    expect(container).toBeEmptyDOMElement()
  })
})
