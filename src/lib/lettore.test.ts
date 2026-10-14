import { describe, it, expect, vi } from 'vitest'
import { rilasciaVideo, vigilanzaSalto } from './lettore'

describe('vigilanzaSalto', () => {
  it('avvisa se il salto non finisce in tempo', () => {
    vi.useFakeTimers()
    const suBlocco = vi.fn()
    const v = vigilanzaSalto(suBlocco, 1000)
    v.inizio()
    vi.advanceTimersByTime(999)
    expect(suBlocco).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(suBlocco).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('un salto finito in tempo non avvisa, e un nuovo salto riparte da capo', () => {
    vi.useFakeTimers()
    const suBlocco = vi.fn()
    const v = vigilanzaSalto(suBlocco, 1000)
    v.inizio()
    vi.advanceTimersByTime(800)
    v.fine()
    vi.advanceTimersByTime(1000)
    expect(suBlocco).not.toHaveBeenCalled()
    v.inizio()
    vi.advanceTimersByTime(800)
    v.inizio() // un altro salto: l'attesa ricomincia
    vi.advanceTimersByTime(800)
    expect(suBlocco).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(suBlocco).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('rilasciaVideo', () => {
  it('ferma il video, gli toglie il file e lo ricarica vuoto', () => {
    // Tolto dalla pagina senza questo, il <video> dell'episodio prima
    // continuava a caricare e rubava la banda a quello nuovo.
    const ordine: string[] = []
    const v = {
      isConnected: false,
      pause: () => ordine.push('pause'),
      removeAttribute: (nome: string) => ordine.push(`via ${nome}`),
      load: () => ordine.push('load'),
    }
    rilasciaVideo(v)
    expect(ordine).toEqual(['pause', 'via src', 'load'])
  })

  it('un video già andato non fa niente', () => {
    expect(() => rilasciaVideo(null)).not.toThrow()
  })

  it('un video ancora nella pagina non si tocca', () => {
    // React in sviluppo chiude e riapre gli effetti: il video resta e deve
    // tenere il suo file.
    const v = { isConnected: true, pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() }
    rilasciaVideo(v)
    expect(v.removeAttribute).not.toHaveBeenCalled()
    expect(v.load).not.toHaveBeenCalled()
  })

  it('un browser che si lamenta non blocca il cambio di episodio', () => {
    const v = {
      isConnected: false,
      pause: () => {
        throw new Error('non implementato')
      },
      removeAttribute: vi.fn(),
      load: vi.fn(),
    }
    const suErrore = vi.fn()
    expect(() => rilasciaVideo(v, suErrore)).not.toThrow()
    expect(suErrore).toHaveBeenCalledOnce()
  })
})
