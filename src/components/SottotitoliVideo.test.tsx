import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import SottotitoliVideo from './SottotitoliVideo'

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nCongratulazioni a Mark e Rebecca,\n\n00:00:05.000 --> 00:00:06.000\n<i>seconda</i>\n'

// Un <video> vero di jsdom: non riproduce, ma il tempo si può spostare a mano
// e gli eventi arrivano come nel browser.
function monta(vtt: string | null, { altezza = 0, scala = 1 } = {}) {
  const videoRef = createRef<HTMLVideoElement>()
  const contenitore = createRef<HTMLDivElement>()
  const Riquadro = ({ v, s }: { v: string | null; s: number }) => (
    <div ref={contenitore}>
      <video ref={videoRef} />
      <SottotitoliVideo videoRef={videoRef} contenitore={contenitore} vtt={v} chiaveVideo="a" scala={s} />
    </div>
  )
  // jsdom non misura niente: l'altezza del riquadro si finge.
  if (altezza) Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', { configurable: true, get: () => altezza })
  const utils = render(<Riquadro v={vtt} s={scala} />)
  const cambia = (v: string | null) => utils.rerender(<Riquadro v={v} s={scala} />)
  const vaiA = (t: number) =>
    act(() => {
      videoRef.current!.currentTime = t
      fireEvent.timeUpdate(videoRef.current!)
    })
  return { ...utils, videoRef, vaiA, cambia }
}

describe('SottotitoliVideo', () => {
  it('mostra la battuta del momento, e niente fra una battuta e l altra', () => {
    const { vaiA } = monta(VTT)
    expect(screen.queryByTestId('sottotitoli')).not.toBeInTheDocument()
    vaiA(2)
    expect(screen.getByTestId('sottotitoli')).toHaveTextContent('Congratulazioni a Mark e Rebecca,')
    vaiA(4)
    expect(screen.queryByTestId('sottotitoli')).not.toBeInTheDocument()
    vaiA(5.5)
    expect(screen.getByTestId('sottotitoli')).toHaveTextContent('seconda')
  })

  it('dopo un salto mostra subito la battuta giusta', () => {
    const { videoRef } = monta(VTT)
    act(() => {
      videoRef.current!.currentTime = 1.5
      fireEvent.seeked(videoRef.current!)
    })
    expect(screen.getByTestId('sottotitoli')).toHaveTextContent('Congratulazioni')
  })

  it('senza sottotitolo scelto non mostra niente', () => {
    const { vaiA } = monta(null)
    vaiA(2)
    expect(screen.queryByTestId('sottotitoli')).not.toBeInTheDocument()
  })

  it('cambiando lingua cambia il testo, senza aspettare la battuta dopo', () => {
    const { cambia, vaiA } = monta(VTT)
    vaiA(2)
    cambia('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nCongratulations\n')
    expect(screen.getByTestId('sottotitoli')).toHaveTextContent('Congratulations')
  })

  it('la misura segue l altezza del video, e la scala scelta', () => {
    const { vaiA } = monta(VTT, { altezza: 1000 })
    vaiA(2)
    expect(screen.getByTestId('sottotitoli')).toHaveAttribute('data-dimensione', '45')
    Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', { configurable: true, get: () => 0 })
  })

  it('con «Molto grandi» la misura cresce della metà, e sotto un minimo non scende', () => {
    const { vaiA } = monta(VTT, { altezza: 1000, scala: 1.5 })
    vaiA(2)
    expect(screen.getByTestId('sottotitoli')).toHaveAttribute('data-dimensione', '68')
    Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', { configurable: true, get: () => 100 })
    const piccolo = monta(VTT, { altezza: 100, scala: 0.8 })
    piccolo.vaiA(2)
    expect(screen.getAllByTestId('sottotitoli').at(-1)).toHaveAttribute('data-dimensione', '13')
    Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', { configurable: true, get: () => 0 })
  })
})
