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
      { inizio: 1, fine: 3.5, testo: 'Congratulazioni a Mark e Rebecca,' },
      { inizio: 4, fine: 6, testo: 'prima riga\nseconda & ultima' },
      { inizio: 3723.25, fine: 3724, testo: 'in fondo al film' },
    ])
  })

  it('legge anche un SRT passato da srtAVtt, con gli a capo di Windows', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nciao\r\n\r\n2\r\n0:00:05,5 --> 0:00:07,000\r\nè finita\r\n'
    expect(leggiVtt(srtAVtt(srt))).toEqual([
      { inizio: 1, fine: 2, testo: 'ciao' },
      { inizio: 5.5, fine: 7, testo: 'è finita' },
    ])
  })

  it('accetta i tempi senza ore e scarta le battute vuote o rovesciate', () => {
    const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\nsenza ore\n\n00:03.000 --> 00:04.000\n<i></i>\n\n00:09.000 --> 00:08.000\nal contrario\n'
    expect(leggiVtt(vtt)).toEqual([{ inizio: 1, fine: 2, testo: 'senza ore' }])
  })
})

describe('battuteAl', () => {
  const battute = leggiVtt(VTT)

  it('mostra la battuta solo fra inizio e fine', () => {
    expect(battuteAl(battute, 0.5)).toBe('')
    expect(battuteAl(battute, 1)).toBe('Congratulazioni a Mark e Rebecca,')
    expect(battuteAl(battute, 3.5)).toBe('')
    expect(battuteAl(battute, 5)).toBe('prima riga\nseconda & ultima')
  })

  it('due battute sovrapposte si leggono entrambe', () => {
    const insieme = leggiVtt('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nuno\n\n00:00:02.000 --> 00:00:03.000\ndue\n')
    expect(battuteAl(insieme, 2.5)).toBe('uno\ndue')
  })
})
