import { describe, expect, it, vi } from 'vitest'
import { collegaAudio, PAUSA_CORREZIONI_MS, SCARTO_MASSIMO, type ElementoMedia } from './sincroniaAudio'

class Finto extends EventTarget implements ElementoMedia {
  currentTime = 0
  paused = true
  playbackRate = 1
  muted = false
  volume = 1
  play = vi.fn(async () => {
    this.paused = false
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  emetti(e: string) {
    this.dispatchEvent(new Event(e))
  }
}

function prepara(inCorso = false) {
  const video = new Finto()
  const audio = new Finto()
  video.paused = !inCorso
  let adesso = 0
  const ora = () => adesso
  const scollega = collegaAudio(video, audio, () => {}, ora)
  return { video, audio, scollega, avanza: (ms: number) => (adesso += ms) }
}

describe('collegaAudio', () => {
  it('il video tace e il suo volume passa all’audio; scollegando torna com’era', () => {
    const video = new Finto()
    video.volume = 0.4
    const audio = new Finto()
    const scollega = collegaAudio(video, audio, () => {})
    expect(video.muted).toBe(true)
    expect(audio.volume).toBe(0.4)
    expect(audio.muted).toBe(false)

    audio.volume = 0.7 // regolato mentre si ascoltava l'altra lingua
    scollega()
    expect(video.muted).toBe(false)
    expect(video.volume).toBe(0.7)
  })

  it('un video già in corso fa partire l’audio dal suo punto', () => {
    const video = new Finto()
    video.paused = false
    video.currentTime = 120
    const audio = new Finto()
    collegaAudio(video, audio, () => {})
    expect(audio.currentTime).toBe(120)
    expect(audio.play).toHaveBeenCalled()
  })

  it('pausa, attesa di rete e salto fermano l’audio; la ripresa lo riallinea', () => {
    const { video, audio } = prepara()
    video.paused = false
    video.currentTime = 10
    video.emetti('play')
    expect(audio.paused).toBe(false)
    expect(audio.currentTime).toBe(10)

    for (const evento of ['pause', 'waiting', 'seeking']) {
      audio.paused = false
      video.emetti(evento)
      expect(audio.paused, evento).toBe(true)
    }

    video.currentTime = 600
    video.emetti('seeked')
    expect(audio.currentTime).toBe(600)
    expect(audio.paused).toBe(false)
  })

  it('un salto col video in pausa non fa partire l’audio', () => {
    const { video, audio } = prepara()
    video.currentTime = 300
    video.emetti('seeked')
    expect(audio.play).not.toHaveBeenCalled()
  })

  it('corregge lo scarto oltre la soglia, ma non di continuo', () => {
    const { video, audio, avanza } = prepara(true)
    avanza(PAUSA_CORREZIONI_MS)
    video.currentTime = 50
    audio.currentTime = 50 + SCARTO_MASSIMO / 2
    video.emetti('timeupdate')
    expect(audio.currentTime).toBe(50 + SCARTO_MASSIMO / 2) // dentro la soglia: si lascia

    audio.currentTime = 51
    video.emetti('timeupdate')
    expect(audio.currentTime).toBe(50)

    // Subito dopo un'altra correzione no: l'audio sta ancora caricando.
    audio.currentTime = 49
    avanza(PAUSA_CORREZIONI_MS / 2)
    video.emetti('timeupdate')
    expect(audio.currentTime).toBe(49)
    avanza(PAUSA_CORREZIONI_MS)
    video.emetti('timeupdate')
    expect(audio.currentTime).toBe(50)
  })

  it('segue la velocità del video', () => {
    const { video, audio } = prepara()
    video.playbackRate = 1.5
    video.emetti('ratechange')
    expect(audio.playbackRate).toBe(1.5)
  })

  it('scollegato, il video non comanda più l’audio', () => {
    const { video, audio, scollega } = prepara()
    scollega()
    video.paused = false
    video.emetti('play')
    expect(audio.play).not.toHaveBeenCalled()
  })
})
