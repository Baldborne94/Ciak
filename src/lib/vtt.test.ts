import { describe, expect, it } from 'vitest'
import { battuteAl, leggiVtt } from './vtt'
import { srtAVtt } from './sottotitoli'

const VTT = `WEBVTT

NOTE un commento che non è una battuta

1
00:00:01.000 --> 00:00:03.500
Congratulazioni a Mark e Rebecca,

00:00:04.000 --> 00:00:06.000 line:10% align:start
<i>prima riga</i>
{\\an8}seconda &amp; ultima

01:02:03.250 --> 01:02:04.000
in fondo al film
`

describe('leggiVtt', () => {
  it('legge tempi, testo su più righe e toglie i tag di stile', () => {
    expect(leggiVtt(VTT)).toEqual([
      { inizio: 1, fine: 3.5, testo: 'Congratulazioni a Mark e Rebecca,', posizione: 'basso' },
      { inizio: 4, fine: 6, testo: 'prima riga\nseconda & ultima', posizione: 'alto' },
      { inizio: 3723.25, fine: 3724, testo: 'in fondo al film', posizione: 'basso' },
    ])
  })

  it('legge anche un SRT passato da srtAVtt, con gli a capo di Windows', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nciao\r\n\r\n2\r\n0:00:05,5 --> 0:00:07,000\r\nè finita\r\n'
    expect(leggiVtt(srtAVtt(srt))).toEqual([
      { inizio: 1, fine: 2, testo: 'ciao', posizione: 'basso' },
      { inizio: 5.5, fine: 7, testo: 'è finita', posizione: 'basso' },
    ])
  })

  it('la posizione: dal «line» di WebVTT o, se c’è ancora, dal tag ASS', () => {
    const vtt = [
      'WEBVTT',
      '00:01.000 --> 00:02.000 line:0\nprima riga',
      '00:03.000 --> 00:04.000 align:start line:-1\nultima riga',
      '00:05.000 --> 00:06.000 line:50%\na metà',
      '00:07.000 --> 00:08.000 line:90%\nin basso',
      '00:09.000 --> 00:10.000\n{\\an8}cartello',
      '00:11.000 --> 00:12.000\n{\\an4}a sinistra, a metà',
    ].join('\n\n')
    expect(leggiVtt(vtt).map((b) => b.posizione)).toEqual(['alto', 'basso', 'centro', 'basso', 'alto', 'centro'])
  })

  it('un cartello dell’SRT estratto da ffmpeg arriva in alto', () => {
    const srt = '1\n00:14:05,000 --> 00:14:09,000\n<font size="36">{\\an8}Top 10 of the 104th Training Corps</font>\n'
    expect(leggiVtt(srtAVtt(srt))).toEqual([{ inizio: 845, fine: 849, testo: 'Top 10 of the 104th Training Corps', posizione: 'alto' }])
  })

  it('accetta i tempi senza ore e scarta le battute vuote o rovesciate', () => {
    const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\nsenza ore\n\n00:03.000 --> 00:04.000\n<i></i>\n\n00:09.000 --> 00:08.000\nal contrario\n'
    expect(leggiVtt(vtt)).toEqual([{ inizio: 1, fine: 2, testo: 'senza ore', posizione: 'basso' }])
  })
})

describe('battuteAl', () => {
  const battute = leggiVtt(VTT)

  const vuoto = { basso: '', centro: '', alto: '' }

  it('mostra la battuta solo fra inizio e fine, al suo posto', () => {
    expect(battuteAl(battute, 0.5)).toEqual(vuoto)
    expect(battuteAl(battute, 1)).toEqual({ ...vuoto, basso: 'Congratulazioni a Mark e Rebecca,' })
    expect(battuteAl(battute, 3.5)).toEqual(vuoto)
    expect(battuteAl(battute, 5)).toEqual({ ...vuoto, alto: 'prima riga\nseconda & ultima' })
  })

  it('due battute sovrapposte si leggono entrambe', () => {
    const insieme = leggiVtt('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nuno\n\n00:00:02.000 --> 00:00:03.000\ndue\n')
    expect(battuteAl(insieme, 2.5)).toEqual({ ...vuoto, basso: 'uno\ndue' })
  })

  it('un cartello in alto e un dialogo in basso, nello stesso momento', () => {
    const insieme = leggiVtt('WEBVTT\n\n00:00:01.000 --> 00:00:05.000 line:0\nTop 10\n\n00:00:02.000 --> 00:00:03.000\nNon ci credo!\n')
    expect(battuteAl(insieme, 2.5)).toEqual({ ...vuoto, alto: 'Top 10', basso: 'Non ci credo!' })
  })
})
