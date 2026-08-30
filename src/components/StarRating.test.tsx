import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StarRating from './StarRating'

// Il voto a mezza stella è il punto in cui è più facile sbagliare di mezzo
// punto senza accorgersene: metà sinistra della stella vale 0.5, metà destra
// vale 1, e ri-cliccare lo stesso voto lo azzera. Verificarlo qui costa
// millisecondi; farlo passare da un browser vero costava minuti.

describe('StarRating', () => {
  it('la metà sinistra della terza stella vale 2.5', async () => {
    const onChange = vi.fn()
    render(<StarRating value={null} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '2.5 stelle' }))

    expect(onChange).toHaveBeenCalledWith(2.5)
  })

  it('la metà destra vale la stella piena', async () => {
    const onChange = vi.fn()
    render(<StarRating value={null} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '3 stelle' }))

    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('ri-cliccare il voto già dato lo azzera', async () => {
    // Senza questa via d'uscita, un voto messo per sbaglio non si toglie più.
    const onChange = vi.fn()
    render(<StarRating value={4} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '4 stelle' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('cliccare un voto diverso lo cambia, non lo azzera', async () => {
    const onChange = vi.fn()
    render(<StarRating value={4} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '4.5 stelle' }))

    expect(onChange).toHaveBeenCalledWith(4.5)
  })

  it('in sola lettura non offre nulla da cliccare', () => {
    // Le card mostrano il voto ovunque: senza `onChange` non devono diventare
    // dieci bersagli cliccabili che non fanno niente.
    render(<StarRating value={3} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('mostra il voto in cifre, e un trattino quando non c è', () => {
    const { rerender } = render(<StarRating value={3.5} showValue />)
    expect(screen.getByText('3.5/5')).toBeInTheDocument()

    rerender(<StarRating value={null} showValue />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('passare sopra una stella anticipa il voto senza sceglierlo', async () => {
    // L'anteprima al passaggio del mouse non deve salvare niente: si guarda,
    // non si vota.
    const onChange = vi.fn()
    render(<StarRating value={1} onChange={onChange} />)

    await userEvent.hover(screen.getByRole('button', { name: '5 stelle' }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
