import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { MS_COMANDI, useComandiVisibili } from './useComandiVisibili'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function Lettore({ trattieni = false }: { trattieni?: boolean }) {
  const contenitore = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const visibile = useComandiVisibili(contenitore, video, trattieni)
  return (
    <div ref={contenitore} data-testid="contenitore">
      <video ref={video} data-testid="video" />
      <p>{visibile ? 'comandi visibili' : 'comandi nascosti'}</p>
    </div>
  )
}

// jsdom non riproduce: «in riproduzione» si finge sovrascrivendo `paused`.
function avvia() {
  const v = screen.getByTestId('video') as HTMLVideoElement
  Object.defineProperty(v, 'paused', { configurable: true, get: () => false })
  act(() => void fireEvent.play(v))
  return v
}
const passano = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe('useComandiVisibili', () => {
  it('a video fermo i comandi restano', () => {
    render(<Lettore />)
    passano(MS_COMANDI * 3)
    expect(screen.getByText('comandi visibili')).toBeInTheDocument()
  })

  it('mentre il video va spariscono dopo qualche secondo, e un tocco li riporta', () => {
    render(<Lettore />)
    avvia()
    passano(MS_COMANDI - 100)
    expect(screen.getByText('comandi visibili')).toBeInTheDocument()
    passano(200)
    expect(screen.getByText('comandi nascosti')).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByTestId('video'))
    expect(screen.getByText('comandi visibili')).toBeInTheDocument()
    passano(MS_COMANDI + 100)
    expect(screen.getByText('comandi nascosti')).toBeInTheDocument()
  })

  it('anche il mouse che si muove li riporta, e mettendo in pausa tornano', () => {
    render(<Lettore />)
    const v = avvia()
    passano(MS_COMANDI + 100)
    fireEvent.pointerMove(screen.getByTestId('contenitore'))
    expect(screen.getByText('comandi visibili')).toBeInTheDocument()
    passano(MS_COMANDI + 100)
    Object.defineProperty(v, 'paused', { configurable: true, get: () => true })
    act(() => void fireEvent.pause(v))
    expect(screen.getByText('comandi visibili')).toBeInTheDocument()
  })

  it('con un menu aperto non spariscono', () => {
    render(<Lettore trattieni />)
    avvia()
    passano(MS_COMANDI * 3)
    expect(screen.getByText('comandi visibili')).toBeInTheDocument()
  })
})

// Il lettore di Ciak arriva dopo la pagina (prima c'è l'anteprima di Drive):
// il <video> non c'era quando il controllo è partito, e i comandi restavano
// fissi come a video fermo.
function LettoreCheArriva({ conVideo }: { conVideo: boolean }) {
  const contenitore = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const visibile = useComandiVisibili(contenitore, video)
  return (
    <div ref={contenitore} data-testid="contenitore">
      {conVideo ? <video ref={video} data-testid="video" /> : <iframe title="Drive" />}
      <p>{visibile ? 'comandi visibili' : 'comandi nascosti'}</p>
    </div>
  )
}

describe('useComandiVisibili, col video che arriva dopo', () => {
  it('segue il video anche se compare dopo la pagina', () => {
    const { rerender } = render(<LettoreCheArriva conVideo={false} />)
    rerender(<LettoreCheArriva conVideo />)
    avvia()
    passano(MS_COMANDI + 100)
    expect(screen.getByText('comandi nascosti')).toBeInTheDocument()
  })
})
