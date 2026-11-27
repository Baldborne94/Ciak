import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import QualitaCasa from './QualitaCasa'

// Il video del server di casa che si ferma troppo spesso a caricare (il
// tablet lontano dal router) passa da solo alla qualità ridotta, e lo dice.

function monta(props: { attivo?: boolean; ridotta?: boolean } = {}) {
  const ref = createRef<HTMLVideoElement>()
  const onCambia = vi.fn()
  const { rerender } = render(
    <div>
      <video ref={ref} />
      <QualitaCasa videoRef={ref} attivo={props.attivo ?? true} ridotta={props.ridotta ?? false} onCambia={onCambia} />
    </div>,
  )
  // jsdom non riproduce: il video «va» se non è in pausa.
  Object.defineProperty(ref.current!, 'paused', { configurable: true, get: () => false })
  // Il componente si aggancia al <video> al disegno dopo.
  rerender(
    <div>
      <video ref={ref} />
      <QualitaCasa videoRef={ref} attivo={props.attivo ?? true} ridotta={props.ridotta ?? false} onCambia={onCambia} />
    </div>,
  )
  const evento = (tipo: string) => act(() => void ref.current!.dispatchEvent(new Event(tipo)))
  return { onCambia, evento }
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('QualitaCasa', () => {
  it('tre attese in poco tempo chiedono la qualità ridotta, una volta sola', () => {
    const { onCambia, evento } = monta()
    evento('playing')
    // Cinque attese: dalla terza è lenta, ma si chiede una volta sola.
    for (let i = 0; i < 5; i++) {
      evento('waiting')
      act(() => void vi.advanceTimersByTime(2000))
      evento('playing')
      act(() => void vi.advanceTimersByTime(20_000))
    }
    expect(onCambia).toHaveBeenCalledTimes(1)
    expect(onCambia).toHaveBeenCalledWith(true)
  })

  it('un’attesa lunga basta', () => {
    const { onCambia, evento } = monta()
    evento('playing')
    evento('waiting')
    act(() => void vi.advanceTimersByTime(10_500))
    expect(onCambia).toHaveBeenCalledWith(true)
  })

  it('le attese della partenza e dopo un salto non contano', () => {
    const { onCambia, evento } = monta()
    // Prima del primo «playing»: il video sta partendo.
    evento('waiting')
    act(() => void vi.advanceTimersByTime(15_000))
    evento('playing')
    for (let i = 0; i < 3; i++) {
      evento('seeking')
      evento('waiting')
      evento('playing')
    }
    expect(onCambia).not.toHaveBeenCalled()
  })

  it('in qualità ridotta lo dice, e si torna alla piena con un tocco', async () => {
    const { onCambia } = monta({ ridotta: true })
    expect(screen.getByRole('status')).toHaveTextContent(/qualità ridotta/)
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Torna alla qualità piena' }))
    expect(onCambia).toHaveBeenCalledWith(false)
  })

  it('per i file del disco non fa niente', () => {
    const { onCambia, evento } = monta({ attivo: false })
    evento('playing')
    evento('waiting')
    act(() => void vi.advanceTimersByTime(15_000))
    expect(onCambia).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
