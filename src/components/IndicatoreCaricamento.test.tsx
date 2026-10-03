import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import IndicatoreCaricamento from './IndicatoreCaricamento'

function monta() {
  const videoRef = createRef<HTMLVideoElement>()
  render(
    <div>
      <video ref={videoRef} data-testid="video" />
      <IndicatoreCaricamento videoRef={videoRef} />
    </div>,
  )
  return screen.getByTestId('video')
}

describe('IndicatoreCaricamento', () => {
  it('compare mentre il video aspetta i dati e sparisce quando riparte', () => {
    const v = monta()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    act(() => void fireEvent(v, new Event('waiting')))
    expect(screen.getByRole('status', { name: 'Caricamento' })).toBeInTheDocument()
    act(() => void fireEvent(v, new Event('playing')))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('in pausa non gira: non si sta aspettando niente', () => {
    const v = monta()
    act(() => void fireEvent(v, new Event('stalled')))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => void fireEvent.pause(v))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
