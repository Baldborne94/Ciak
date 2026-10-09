import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MenuAudio from './MenuAudio'

const nomi = ['Giapponese', 'Italiano']

describe('MenuAudio', () => {
  it('il pulsante dice la lingua che si sente e apre le altre', () => {
    render(<MenuAudio nomi={nomi} scelto={0} sigla="JA" onScegli={() => {}} />)
    const pulsante = screen.getByRole('button', { name: 'Audio: Giapponese. Cambia lingua' })
    expect(pulsante).toHaveTextContent('JA')
    expect(screen.queryByRole('group', { name: "Lingua dell'audio" })).not.toBeInTheDocument()

    fireEvent.click(pulsante)
    expect(screen.getByRole('button', { name: 'Giapponese' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Italiano' })).toHaveAttribute('aria-pressed', 'false')
    // Niente «Nessuno»: un film senza audio non è una scelta.
    expect(screen.queryByRole('button', { name: 'Nessuno' })).not.toBeInTheDocument()
  })

  it('toccare una lingua la sceglie e chiude il menu', () => {
    const onScegli = vi.fn()
    const onAperto = vi.fn()
    render(<MenuAudio nomi={nomi} scelto={0} sigla="JA" onScegli={onScegli} onAperto={onAperto} />)
    fireEvent.click(screen.getByRole('button', { name: /^Audio/ }))
    expect(onAperto).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Italiano' }))
    expect(onScegli).toHaveBeenCalledWith(1)
    expect(onAperto).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('group', { name: "Lingua dell'audio" })).not.toBeInTheDocument()
  })

  it('si chiude con Esc o toccando fuori, senza cambiare nulla', () => {
    const onScegli = vi.fn()
    render(<MenuAudio nomi={nomi} scelto={1} sigla="IT" onScegli={onScegli} />)
    const pulsante = screen.getByRole('button', { name: /^Audio/ })
    fireEvent.click(pulsante)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: "Lingua dell'audio" })).not.toBeInTheDocument()
    expect(pulsante).toHaveFocus()
    fireEvent.click(pulsante)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group', { name: "Lingua dell'audio" })).not.toBeInTheDocument()
    expect(onScegli).not.toHaveBeenCalled()
  })
})
