import { describe, it, expect } from 'vitest'
import {
  analizzaNomeFilm,
  decodificaTesto,
  filmDaCercare,
  hashOpenSubtitles,
  linguaDaNome,
  nomeSottotitoloSalvato,
  sottotitoliPerVideo,
  srtAVtt,
} from './sottotitoli'

const file = (name: string, mimeType = 'application/x-subrip') => ({ id: name, name, mimeType })

describe('linguaDaNome', () => {
  it('riconosce le sigle e i nomi delle lingue', () => {
    expect(linguaDaNome('Film.it.srt')).toBe('it')
    expect(linguaDaNome('Film [ITA].srt')).toBe('it')
    expect(linguaDaNome('Film.Italian.srt')).toBe('it')
    expect(linguaDaNome('2_English.srt')).toBe('en')
    expect(linguaDaNome('Film.eng.srt')).toBe('en')
  })

  it('non inventa una lingua dove non c’è', () => {
    expect(linguaDaNome('Song.of.the.Sea.srt')).toBeNull()
    // «vita» contiene «it», ma non è la sigla.
    expect(linguaDaNome('La vita è bella.srt')).toBeNull()
  })
})

describe('sottotitoliPerVideo', () => {
  it('nella cartella di un solo film prende ogni sottotitolo, italiano per primo', () => {
    const vicini = [
      file('Song.of.the.Sea.2014.1080p.mp4', 'video/mp4'),
      file('English.srt'),
      file('Italiano.srt'),
      file('locandina.jpg', 'image/jpeg'),
    ]
    expect(sottotitoliPerVideo('Song.of.the.Sea.2014.1080p.mp4', vicini).map((s) => s.name)).toEqual([
      'Italiano.srt',
      'English.srt',
    ])
  })

  it('con più video nella cartella tiene solo quelli col nome del video', () => {
    const vicini = [
      file('B99 S7E2.mp4', 'video/mp4'),
      file('B99 S7E3.mp4', 'video/mp4'),
      file('B99 S7E2.it.srt'),
      file('B99 S7E3.it.srt'),
    ]
    expect(sottotitoliPerVideo('B99 S7E2.mp4', vicini).map((s) => s.name)).toEqual(['B99 S7E2.it.srt'])
  })

  it('accetta anche i .vtt e ignora maiuscole', () => {
    const vicini = [file('Film.mkv', 'video/x-matroska'), file('FILM.EN.VTT', 'text/vtt')]
    expect(sottotitoliPerVideo('Film.mkv', vicini)).toEqual([{ id: 'FILM.EN.VTT', name: 'FILM.EN.VTT', lingua: 'en' }])
  })

  it('nessun sottotitolo, lista vuota', () => {
    expect(sottotitoliPerVideo('Film.mkv', [file('Film.mkv', 'video/x-matroska')])).toEqual([])
  })
})

describe('analizzaNomeFilm', () => {
  it('toglie qualità, sorgente e codec e tiene l’anno', () => {
    expect(analizzaNomeFilm('Song.of.the.Sea.2014.1080p.BluRay.x264.YIFY.mp4')).toEqual({
      titolo: 'Song of the Sea',
      anno: 2014,
    })
  })

  it('legge le cartelle col titolo pulito', () => {
    expect(analizzaNomeFilm('Song of the Sea (2014) [1080p]')).toEqual({ titolo: 'Song of the Sea', anno: 2014 })
  })

  it('riconosce stagione ed episodio', () => {
    expect(analizzaNomeFilm('Shogun.S01E01.Anjin.1080p.DSNP.WEB-DL.DDP5.1.H.264.mkv')).toEqual({
      titolo: 'Shogun',
      stagione: 1,
      episodio: 1,
    })
    expect(analizzaNomeFilm('B99 S7E2.mp4')).toEqual({ titolo: 'B99', stagione: 7, episodio: 2 })
    expect(analizzaNomeFilm('Shōgun (2024) S01E03.mkv')).toEqual({
      titolo: 'Shōgun',
      anno: 2024,
      stagione: 1,
      episodio: 3,
    })
  })

  it('non scambia per anno un numero che fa parte del titolo', () => {
    expect(analizzaNomeFilm('Blade.Runner.2049.2017.1080p.mkv')).toEqual({ titolo: 'Blade Runner 2049', anno: 2017 })
    expect(analizzaNomeFilm('2001 A Space Odyssey (1968).mkv')).toEqual({ titolo: '2001 A Space Odyssey', anno: 1968 })
    expect(analizzaNomeFilm('1917.2019.720p.mp4')).toEqual({ titolo: '1917', anno: 2019 })
  })

  it('un nome senza niente da togliere resta com’è', () => {
    expect(analizzaNomeFilm('La vita è bella.mkv')).toEqual({ titolo: 'La vita è bella' })
  })
})

describe('filmDaCercare', () => {
  it('se il file non dice l’anno lo prende dalla cartella del film', () => {
    expect(filmDaCercare('movie.mkv', 'Song of the Sea (2014) [1080p]')).toEqual({
      titolo: 'Song of the Sea',
      anno: 2014,
    })
  })

  it('un episodio resta un episodio anche dentro una cartella', () => {
    expect(filmDaCercare('Shogun.S01E02.mkv', 'Shogun (2024)')).toEqual({ titolo: 'Shogun', stagione: 1, episodio: 2 })
  })
})

describe('srtAVtt', () => {
  it('aggiunge l’intestazione e mette il punto nei millesimi', () => {
    const srt = '\uFEFF1\r\n00:00:01,500 --> 00:00:03,000\r\nCiao\r\n\r\n2\r\n0:01:02,345 --> 0:01:04,000\r\n{\\an8}Sopra\r\n'
    expect(srtAVtt(srt)).toBe(
      'WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000\nCiao\n\n2\n00:01:02.345 --> 00:01:04.000\nSopra\n',
    )
  })

  it('un file già WebVTT resta com’è', () => {
    expect(srtAVtt('WEBVTT\n\n00:01.000 --> 00:02.000\nCiao')).toBe('WEBVTT\n\n00:01.000 --> 00:02.000\nCiao\n')
  })
})

describe('decodificaTesto', () => {
  it('legge l’UTF-8', () => {
    expect(decodificaTesto(new TextEncoder().encode('Perché è così'))).toBe('Perché è così')
  })

  it('ripiega su Windows-1252, la codifica di tanti .srt italiani', () => {
    // «è» in Windows-1252 è il byte 0xE8, non valido da solo in UTF-8.
    expect(decodificaTesto(new Uint8Array([0x50, 0x65, 0x72, 0x63, 0x68, 0xe8]))).toBe('Perchè')
  })
})

describe('hashOpenSubtitles', () => {
  it('con blocchi vuoti di zeri è la sola dimensione in esadecimale', () => {
    const zeri = new ArrayBuffer(65536)
    expect(hashOpenSubtitles(12909756, zeri, zeri)).toBe('0000000000c4fcbc')
  })

  it('somma le parole a 64 bit little-endian e riavvolge oltre i 64 bit', () => {
    const inizio = new ArrayBuffer(16)
    new DataView(inizio).setBigUint64(0, BigInt('0xffffffffffffffff'), true)
    const fine = new ArrayBuffer(16)
    new DataView(fine).setBigUint64(8, BigInt(0x10), true)
    // size 1 + (2^64 - 1) + 16, modulo 2^64 = 16
    expect(hashOpenSubtitles(1, inizio, fine)).toBe('0000000000000010')
  })
})

describe('nomeSottotitoloSalvato', () => {
  it('usa il nome del video con la lingua', () => {
    expect(nomeSottotitoloSalvato('Song.of.the.Sea.2014.1080p.mp4', 'it')).toBe('Song.of.the.Sea.2014.1080p.it.srt')
    expect(nomeSottotitoloSalvato('Film.mkv', null)).toBe('Film.srt')
  })
})
