import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SerieInCiak from './SerieInCiak'
import type { RigaInCiak } from '../lib/useSerieInCiak'

// Tenere una serie in Ciak, dal fondo della serie aperta: salvarla, vedere a
// che punto è la copia, scegliere se togliere i visti, smettere.

function riga(over: Partial<RigaInCiak> = {}): RigaInCiak {
  return {
    tenuta: true,
    liberaDopoVisione: true,
    salvati: 2,
    episodi: 5,
    dimensione: 1.5 * 1024 ** 3,
    copia: null,
    avviso: null,
    onSalva: vi.fn(),
    onLibera: vi.fn(),
    onSmetti: vi.fn(),
    ...over,
  }
}

describe('SerieInCiak', () => {
  it('una serie non tenuta offre solo di salvarla', async () => {
    const r = riga({ tenuta: false, salvati: 0 })
    render(<SerieInCiak riga={r} titolo="South Park" />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '📱 Salva la serie in Ciak' }))
    expect(r.onSalva).toHaveBeenCalled()
  })

  it('tenuta, dice quanti episodi ha copiato, quanto pesano e a che punto è la copia', () => {
    render(<SerieInCiak riga={riga({ copia: { titolo: 'South Park · S3E3', n: 1, totale: 3 } })} titolo="South Park" />)
    expect(screen.getByText('📱 Tenuta in Ciak: 2 di 5 episodi (1,5 GB)')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Copio South Park · S3E3 (1 di 3)…')
  })

  it('togliere i visti si sceglie con una casella', async () => {
    const r = riga()
    render(<SerieInCiak riga={r} titolo="South Park" />)
    const casella = screen.getByRole('checkbox', { name: /Togli dal dispositivo gli episodi visti/ })
    expect(casella).toBeChecked()
    await userEvent.click(casella)
    expect(r.onLibera).toHaveBeenCalledWith(false)
  })

  it('smettere chiede conferma, perché le copie vanno via', async () => {
    const r = riga()
    const conferma = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<SerieInCiak riga={r} titolo="South Park" />)
    const smetti = screen.getByRole('button', { name: 'Smetti di tenerla in Ciak' })
    await userEvent.click(smetti)
    expect(r.onSmetti).not.toHaveBeenCalled()
    expect(conferma.mock.calls[0][0]).toMatch(/i file nella cartella restano/)
    await userEvent.click(smetti)
    expect(r.onSmetti).toHaveBeenCalled()
    conferma.mockRestore()
  })

  it('senza copie da togliere smette senza chiedere', async () => {
    const r = riga({ salvati: 0 })
    const conferma = vi.spyOn(window, 'confirm')
    render(<SerieInCiak riga={r} titolo="South Park" />)
    await userEvent.click(screen.getByRole('button', { name: 'Smetti di tenerla in Ciak' }))
    expect(conferma).not.toHaveBeenCalled()
    expect(r.onSmetti).toHaveBeenCalled()
    conferma.mockRestore()
  })

  it('un avviso (la cartella da riaprire, lo spazio finito) si vede', () => {
    render(<SerieInCiak riga={riga({ avviso: 'Per copiare gli episodi nuovi riapri la cartella, in cima alla pagina.' })} titolo="South Park" />)
    expect(screen.getByText(/riapri la cartella/)).toBeInTheDocument()
  })
})
