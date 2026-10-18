import { describe, expect, it } from 'vitest'
import { audioDaVicini, sottotitoliDaVicini } from './copiaInCiak'

// Ciò che si copia in Ciak insieme a un episodio, preso dai file della sua
// cartella senza aprirlo nel lettore.

const testo = (nome: string, contenuto: string) => new File([contenuto], nome, { type: 'text/plain' })
const SRT = '1\n00:00:01,000 --> 00:00:02,500\nCiao\n'

describe('sottotitoliDaVicini', () => {
  it('prende quelli del video, uno per lingua, già in WebVTT', async () => {
    const vicini = [
      new File([], 'South Park S03E01.mp4', { type: 'video/mp4' }),
      new File([], 'South Park S03E02.mp4', { type: 'video/mp4' }),
      testo('South Park S03E01.en.srt', SRT),
      testo('South Park S03E01.it.srt', SRT),
      testo('South Park S03E02.it.srt', SRT),
    ]
    const fatti = await sottotitoliDaVicini('South Park S03E01.mp4', vicini)
    expect(fatti.map((s) => s.chiave)).toEqual(['it', 'en'])
    expect(fatti[0].etichetta).toMatch(/dalla cartella$/)
    expect(fatti[0].vtt).toMatch(/^WEBVTT/)
    expect(fatti[0].vtt).toContain('00:00:01.000 --> 00:00:02.500')
  })

  it('un .vtt resta com’è', async () => {
    const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\nCiao\n'
    const fatti = await sottotitoliDaVicini('Paprika.mp4', [new File([], 'Paprika.mp4', { type: 'video/mp4' }), testo('Paprika.it.vtt', vtt)])
    expect(fatti).toHaveLength(1)
    expect(fatti[0].vtt).toBe(vtt)
  })
})

describe('audioDaVicini', () => {
  it('prende l’elenco e le lingue del video, non quelle degli altri episodi', () => {
    const vicini = ['Ep 1.audio.json', 'Ep 1.audio-2.m4a', 'Ep 2.audio.json', 'Ep 2.audio-2.m4a', 'Ep 1.it.srt'].map((n) => new File([], n))
    expect(audioDaVicini('Ep 1.mp4', vicini).map((f) => f.name)).toEqual(['Ep 1.audio.json', 'Ep 1.audio-2.m4a'])
  })
})
