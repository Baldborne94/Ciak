import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import ToccoVideo, { ATTESA_DOPPIO_MS } from './ToccoVideo'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const aspetta = (ms: number) => act(() => vi.advanceTimersByTime(ms))

// Il riquadro del video: 300 px di larghezza, così i lati sono chiari.
function monta(inPausaDopo = true) {
  const onAlterna = vi.fn(() => inPausaDopo)
  const onSalta = vi.fn()
  render(<ToccoVideo onAlterna={onAlterna} onSalta={onSalta} />)
  const strato = screen.getByRole('button', { name: 'Pausa o riprendi' })
  strato.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150, x: 0, y: 0, toJSON: () => ({}) })
  return { onAlterna, onSalta, tocca: (x: number) => fireEvent.click(strato, { clientX: x, clientY: 50 }) }
}

describe('ToccoVideo', () => {
  it('un tocco mette in pausa (o fa ripartire) e lo mostra', () => {
    const { onAlterna, onSalta, tocca } = monta(true)
    tocca(150)
    expect(onAlterna).not.toHaveBeenCalled()
    aspetta(ATTESA_DOPPIO_MS)
    expect(onAlterna).toHaveBeenCalledTimes(1)
    expect(onSalta).not.toHaveBeenCalled()
    expect(screen.getByText('⏸')).toBeInTheDocument()
    aspetta(1000)
    expect(screen.queryByText('⏸')).not.toBeInTheDocument()
  })

  it('ripartendo mostra il play', () => {
    const { tocca } = monta(false)
    tocca(150)
    aspetta(ATTESA_DOPPIO_MS)
    expect(screen.getByText('▶')).toBeInTheDocument()
  })

  it('due tocchi a destra vanno avanti di 10 secondi, a sinistra indietro, senza fermare il video', () => {
    const { onAlterna, onSalta, tocca } = monta()
    tocca(280)
    tocca(280)
    aspetta(1000)
    expect(onSalta).toHaveBeenCalledWith(10)
    tocca(20)
    tocca(20)
    aspetta(1000)
    expect(onSalta).toHaveBeenLastCalledWith(-10)
    expect(onAlterna).not.toHaveBeenCalled()
  })

  it('due tocchi al centro non fanno niente', () => {
    const { onAlterna, onSalta, tocca } = monta()
    tocca(150)
    tocca(150)
    aspetta(1000)
    expect(onAlterna).not.toHaveBeenCalled()
    expect(onSalta).not.toHaveBeenCalled()
  })

  it('due tocchi lenti sono due pause', () => {
    const { onAlterna, tocca } = monta()
    tocca(150)
    aspetta(ATTESA_DOPPIO_MS + 50)
    tocca(150)
    aspetta(ATTESA_DOPPIO_MS)
    expect(onAlterna).toHaveBeenCalledTimes(2)
  })
})
