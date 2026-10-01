import { describe, it, expect } from 'vitest'
import {
  analizzaNomeFilm,
  decodificaTesto,
  filmDaCercare,
  stagioneDaCartella,
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

  it('dentro una cartella di stagione il titolo è quello della serie, e l episodio il numero del file', () => {
    // South Park/Season 03/01 Rainforest Shmainforest.mp4: il titolo cercato
    // era «01 Rainforest Shmainforest», e la serie non si trovava.
    expect(filmDaCercare('01 Rainforest Shmainforest.mp4', 'Season 03', 'South Park')).toEqual({
      titolo: 'South Park',
      stagione: 3,
      episodio: 1,
    })
    expect(filmDaCercare('Episodio 12.mkv', 'Stagione 2', 'Lupin III (1977)')).toEqual({
      titolo: 'Lupin III',
      anno: 1977,
      stagione: 2,
      episodio: 12,
    })
    // Se il file dice già SxxEyy, vince il file.
    expect(filmDaCercare('South.Park.S03E05.mp4', 'Season 03', 'South Park')).toMatchObject({ stagione: 3, episodio: 5 })
  })

  it('un OAD in una cartella di speciali è la stagione 0 della serie', () => {
    expect(
      filmDaCercare("Shingeki no Kyojin - OADE01 - Ilse's Notebook.mp4", 'OADs', 'Shingeki no Kyojin [10bits x265]'),
    ).toEqual({ titolo: 'Shingeki no Kyojin', stagione: 0, episodio: 1 })
    expect(filmDaCercare('OVA 3.mkv', 'OVA', 'Lupin III (1977)')).toEqual({
      titolo: 'Lupin III',
      anno: 1977,
      stagione: 0,
      episodio: 3,
    })
  })

  it('«OADE01» nel nome del file vale come stagione 0, episodio 1, anche senza cartella', () => {
    expect(analizzaNomeFilm('Shingeki.no.Kyojin.OADE02.mkv')).toEqual({ titolo: 'Shingeki no Kyojin', stagione: 0, episodio: 2 })
    expect(analizzaNomeFilm('Naruto OVA 3.mkv')).toEqual({ titolo: 'Naruto', stagione: 0, episodio: 3 })
    expect(analizzaNomeFilm('Bleach Special 1.mkv')).toEqual({ titolo: 'Bleach', stagione: 0, episodio: 1 })
  })

  it('un mezzo episodio («S01E13.5», un riassunto) è uno speciale senza numero, non un secondo episodio 13', () => {
    const nome = 'Shingeki no Kyojin - S01E13.5 - Since That Day.mp4'
    expect(analizzaNomeFilm(nome)).toEqual({ titolo: 'Shingeki no Kyojin', stagione: 0 })
    expect(filmDaCercare(nome, 'Shingeki no Kyojin [10bits x265]')).toEqual({ titolo: 'Shingeki no Kyojin', stagione: 0 })
    expect(filmDaCercare('13.5 Since That Day.mp4', 'Season 01', 'Shingeki no Kyojin')).toEqual({ titolo: 'Shingeki no Kyojin', stagione: 0 })
    // Un punto seguito dalla risoluzione non è un mezzo episodio.
    expect(analizzaNomeFilm('Show.S01E13.720p.mkv')).toMatchObject({ titolo: 'Show', stagione: 1, episodio: 13 })
  })

  it('un file che è solo «S03E01» prende il titolo dalla cartella della serie', () => {
    expect(filmDaCercare('S03E01.mp4', 'South Park')).toEqual({ titolo: 'South Park', stagione: 3, episodio: 1 })
  })
})

describe('stagioneDaCartella', () => {
  it('riconosce i modi comuni di chiamare una stagione', () => {
    expect(stagioneDaCartella('Season 03')).toBe(3)
    expect(stagioneDaCartella('Stagione 2')).toBe(2)
    expect(stagioneDaCartella('S01')).toBe(1)
    expect(stagioneDaCartella('Series 7')).toBe(7)
    expect(stagioneDaCartella('season.04 (2000)')).toBe(4)
  })

  it('gli speciali (OAD, OVA, extra) sono la stagione 0, come su TMDB', () => {
    // Shingeki no Kyojin [10bits x265]/OADs/… compariva come «OADs», un video
    // alla volta, fuori dalla serie.
    expect(stagioneDaCartella('OADs')).toBe(0)
    expect(stagioneDaCartella('OVA')).toBe(0)
    expect(stagioneDaCartella('Specials')).toBe(0)
    expect(stagioneDaCartella('Extras')).toBe(0)
    expect(stagioneDaCartella('Speciali')).toBe(0)
  })

  it('non scambia per stagioni le cartelle dei film o delle categorie', () => {
    expect(stagioneDaCartella('Serie TV')).toBeNull()
    expect(stagioneDaCartella('Supernatural')).toBeNull()
    expect(stagioneDaCartella('Se7en (1995)')).toBeNull()
    expect(stagioneDaCartella('S.W.A.T.')).toBeNull()
    expect(stagioneDaCartella('Song of the Sea (2014)')).toBeNull()
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
