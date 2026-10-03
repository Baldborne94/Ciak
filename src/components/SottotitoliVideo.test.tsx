import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import SottotitoliVideo from './SottotitoliVideo'

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nCongratulazioni a Mark e Rebecca,\n\n00:00:05.000 --> 00:00:06.000\n<i>seconda</i>\n'

// Un <video> vero di jsdom: non riproduce, ma il tempo si può spostare a mano
// e gli eventi arrivano come nel browser.
function monta(vtt: string | null) {
  const videoRef = createRef<HTMLVideoElement>()
  const utils = render(
    <div>
      <video ref={videoRef} />
      <SottotitoliVideo videoRef={videoRef} vtt={vtt} chiaveVideo="a" />
    </div>,
  )
  const vaiA = (t: number) =>
    act(() => {
      videoRef.current!.currentTime = t
      fireEvent.timeUpdate(videoRef.current!)
    })
  return { ...utils, videoRef, vaiA }
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
    const { rerender, videoRef, vaiA } = monta(VTT)
    vaiA(2)
    rerender(
      <div>
        <video ref={videoRef} />
        <SottotitoliVideo videoRef={videoRef} vtt={'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nCongratulations\n'} chiaveVideo="a" />
      </div>,
    )
    expect(screen.getByTestId('sottotitoli')).toHaveTextContent('Congratulations')
  })
})
