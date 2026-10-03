import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MenuSottotitoli from './MenuSottotitoli'

const nomi = ['Italiano', 'Inglese']

describe('MenuSottotitoli', () => {
  it('il pulsante CC apre un menu con tutte le lingue e «Nessuno»', () => {
    render(<MenuSottotitoli nomi={nomi} scelto={0} sigla="IT" onScegli={() => {}} />)
    const cc = screen.getByRole('button', { name: 'Sottotitoli: Italiano. Cambia' })
    expect(cc).toHaveTextContent('CC IT')
    expect(screen.queryByRole('group', { name: 'Sottotitoli' })).not.toBeInTheDocument()

    fireEvent.click(cc)
    expect(cc).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Nessuno' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Italiano' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Inglese' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('toccare una lingua la sceglie e chiude il menu', () => {
    const onScegli = vi.fn()
    render(<MenuSottotitoli nomi={nomi} scelto={0} sigla="IT" onScegli={onScegli} />)
    fireEvent.click(screen.getByRole('button', { name: /^Sottotitoli/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Inglese' }))
    expect(onScegli).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('group', { name: 'Sottotitoli' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Sottotitoli/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Nessuno' }))
    expect(onScegli).toHaveBeenLastCalledWith(-1)
  })

  it('si chiude toccando fuori o con Esc, senza cambiare nulla', () => {
    const onScegli = vi.fn()
    render(<MenuSottotitoli nomi={nomi} scelto={-1} sigla="off" onScegli={onScegli} />)
    const cc = screen.getByRole('button', { name: 'Sottotitoli: nessuno. Cambia' })

    fireEvent.click(cc)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group', { name: 'Sottotitoli' })).not.toBeInTheDocument()

    fireEvent.click(cc)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Sottotitoli' })).not.toBeInTheDocument()
    expect(cc).toHaveFocus()
    expect(onScegli).not.toHaveBeenCalled()
  })
})
