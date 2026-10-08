import { describe, it, expect } from 'vitest'
import {
  cartellaRaccolta,
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
  it('le raccolte di stagioni non fanno parte del titolo', () => {
    expect(analizzaNomeFilm('South Park Season 1 to 26 Mp4 1080p').titolo).toBe('South Park')
    expect(analizzaNomeFilm('The Office Seasons 1-9').titolo).toBe('The Office')
    expect(analizzaNomeFilm('Friends The Complete Series').titolo).toBe('Friends')
    expect(analizzaNomeFilm('Breaking Bad S01-S05 1080p').titolo).toBe('Breaking Bad')
    expect(analizzaNomeFilm('Lupin III Stagioni 1-6').titolo).toBe('Lupin III')
    // Un titolo che contiene «Season» da solo non si tocca.
    expect(analizzaNomeFilm('Hunting Season (2016)').titolo).toBe('Hunting Season')
  })

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

describe('filmDaCercare: i film dentro un pacchetto', () => {
  // I pacchetti di saghe scaricati così come sono: la cartella è il nome della
  // raccolta, non del film, e i file portano numero di traccia, genere e
  // versione. Questi film restavano senza titolo, quindi fuori dalle saghe.
  it('toglie numero di traccia e genere, e tiene l’anno', () => {
    expect(
      filmDaCercare('06 Transformers Bumblebee - Action 2018 Eng Rus Multi-Subs 1080p [H264-mp4].mp4', 'Transformers Complete Movie Collection'),
    ).toEqual({ titolo: 'Transformers Bumblebee', anno: 2018 })
    expect(
      filmDaCercare('01 The Avengers Assemble - Action 2012 Eng Ita Multi-Subs 720p [H264-mp4].mp4', 'The Avengers 4 Movie Collection - Action 2012-2019'),
    ).toEqual({ titolo: 'The Avengers Assemble', anno: 2012 })
  })

  it('toglie la versione (Directors Cut, Special Extended, IMAX…)', () => {
    expect(filmDaCercare('01 Alien Directors Cut - Sci-Fi 1979 Eng Subs 720p [H264-mp4].mp4', 'Alien Quadrilogy')).toEqual({
      titolo: 'Alien',
      anno: 1979,
    })
    expect(
      filmDaCercare('04 Alien Resurrection Special Extended - Sci-Fi 1997 Eng Subs 720p [H264-mp4].mp4', 'Alien Quadrilogy'),
    ).toEqual({ titolo: 'Alien Resurrection', anno: 1997 })
    expect(
      filmDaCercare('05 Transformers The Last Knight - IMAX 2017 Eng Rus Multi-Subs 1080p [H264-mp4].mp4', 'Transformers Complete Movie Collection'),
    ).toEqual({ titolo: 'Transformers The Last Knight', anno: 2017 })
  })

  it('le sigle M02 E05 dei pacchetti di Star Wars non sono il titolo, e l’anno sta fra parentesi dopo le etichette', () => {
    expect(
      filmDaCercare('Star Wars M02 E05 The Empire Strikes Back [BluRay] (1980 360p re-blurip).mp4', 'Star Wars M01-M03 [Bluray] (1977-1983)'),
    ).toEqual({ titolo: 'Star Wars The Empire Strikes Back', anno: 1980 })
  })

  it('senza anno nel file, la cartella del pacchetto non diventa il titolo', () => {
    expect(filmDaCercare('02 Aliens.mp4', 'Alien Quadrilogy')).toEqual({ titolo: 'Aliens' })
    // Il numero di traccia oltre il 9, senza zero: dentro un pacchetto si toglie.
    expect(filmDaCercare('10 Thor Ragnarok - Action 2017 720p.mp4', 'Marvel 23 Movie Collection')).toEqual({ titolo: 'Thor Ragnarok', anno: 2017 })
    expect(filmDaCercare('Harry Potter and the Chamber of Secrets.mp4', 'Harry Potter Complete 8-Film Collection')).toEqual({
      titolo: 'Harry Potter and the Chamber of Secrets',
    })
  })

  it('un numero che fa parte del titolo resta', () => {
    expect(filmDaCercare('12 Angry Men 1957 1080p.mp4', null)).toEqual({ titolo: '12 Angry Men', anno: 1957 })
    expect(filmDaCercare('28 Days Later (2002).mp4', '28 Days Later (2002)')).toEqual({ titolo: '28 Days Later', anno: 2002 })
    // «Uncut Gems» comincia con la parola: non è una versione.
    expect(filmDaCercare('Uncut Gems 2019.mp4', null)).toEqual({ titolo: 'Uncut Gems', anno: 2019 })
  })
})

describe('filmDaCercare: l’anno davanti al titolo', () => {
  // I classici Disney scaricati come «1940 - Pinocchio.mp4»: si cercava
  // «1940 Pinocchio», e non si trovava niente.
  it('«1940 - Pinocchio» è Pinocchio del 1940', () => {
    expect(filmDaCercare('1940 - Pinocchio.mp4', 'Walt Disney Classics Collection')).toEqual({ titolo: 'Pinocchio', anno: 1940 })
    expect(filmDaCercare('1943 - Victory Through Air Power.mp4', null)).toEqual({ titolo: 'Victory Through Air Power', anno: 1943 })
    expect(filmDaCercare('1945 - The Three Caballeros.mp4', 'Disney')).toEqual({ titolo: 'The Three Caballeros', anno: 1945 })
  })

  it('senza il trattino un anno in testa resta parte del titolo', () => {
    expect(filmDaCercare('2001 Odissea nello spazio 1968.mkv', null)).toEqual({ titolo: '2001 Odissea nello spazio', anno: 1968 })
    expect(filmDaCercare('1917 (2019).mkv', null)).toEqual({ titolo: '1917', anno: 2019 })
  })
})

describe('filmDaCercare: serie in cartelle scritte a modo loro', () => {
  it('«Looney Tunes Season 1» è la stagione 1 di Looney Tunes, e «110» il suo episodio 10', () => {
    expect(filmDaCercare('110 Big Top Bunny.mp4', 'Looney Tunes Season 1')).toEqual({ titolo: 'Looney Tunes', stagione: 1, episodio: 10 })
    expect(filmDaCercare('101 Baseball Bugs.mp4', 'Looney Tunes Season 1')).toEqual({ titolo: 'Looney Tunes', stagione: 1, episodio: 1 })
    expect(filmDaCercare('07 Rabbit Kin.mp4', 'Looney Tunes - Stagione 2')).toEqual({ titolo: 'Looney Tunes', stagione: 2, episodio: 7 })
  })

  it('una raccolta di più stagioni non è una stagione', () => {
    expect(filmDaCercare('Friends S03E04.mkv', 'Friends Season 1-10')).toMatchObject({ titolo: 'Friends', stagione: 3, episodio: 4 })
  })

  it('«Episode 3» senza stagione è l’episodio 3 di una miniserie', () => {
    expect(filmDaCercare('Elements.of.Chernobyl.Episode.3.Open.Wide.O.Earth.mp4', 'Elements of Chernobyl')).toEqual({
      titolo: 'Elements of Chernobyl',
      stagione: 1,
      episodio: 3,
    })
    expect(filmDaCercare('Elements.of Chernobyl Episode 1 1.23.45.mp4', 'Elements of Chernobyl')).toMatchObject({ stagione: 1, episodio: 1 })
  })

  it('«Dual Audio» non fa parte del titolo', () => {
    // Si cercava «Cowboy Bebop Knockin' on Heaven's Door (Dual Audio», e TMDB
    // non trovava niente.
    expect(
      filmDaCercare("[DB]Cowboy Bebop Knockin' on Heaven's Door _-_(Dual Audio_10bit_BD1080p_x265).mkv", 'Cowboy Bebop'),
    ).toEqual({ titolo: "Cowboy Bebop Knockin' on Heaven's Door" })
  })

  it('ma un film con l’anno resta un film anche se dice «Episode»', () => {
    expect(filmDaCercare('Star.Wars.Episode.4.A.New.Hope.1977.1080p.mkv', null).stagione).toBeUndefined()
  })

  it('il nome della serie non porta con sé «Season 1»', () => {
    expect(analizzaNomeFilm('Looney Tunes Season 1').titolo).toBe('Looney Tunes')
  })
})

describe('cartellaRaccolta', () => {
  it('riconosce i pacchetti di film', () => {
    for (const c of [
      'Transformers Complete Movie Collection',
      'The Avengers 4 Movie Collection - Action 2012-2019',
      'Star Wars M01-M03 [Bluray] (1977-1983)',
      'Alien Quadrilogy',
      'The Lord of the Rings Trilogy',
      'Harry Potter Complete 8-Film Collection',
    ])
      expect(cartellaRaccolta(c), c).toBe(true)
  })

  it('la cartella di un film solo non è un pacchetto', () => {
    for (const c of ['Song of the Sea (2014) [1080p]', 'The Seventh Seal (1957) Criterion', 'Blade Runner 2049 (2017)'])
      expect(cartellaRaccolta(c), c).toBe(false)
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

  it('una raccolta («South Park Season 1 to 26 Mp4 1080p») non è il nome della serie: vince quello del file', () => {
    // Tutto South Park restava senza titolo, e senza titolo niente episodio
    // dopo, niente «Salta sigla»: si cercava «South Park Season 1 to 26 Mp4».
    expect(filmDaCercare('South Park S03E06.mp4', 'Season 03', 'South Park Season 1 to 26 Mp4 1080p')).toEqual({
      titolo: 'South Park',
      stagione: 3,
      episodio: 6,
    })
    // Il file senza titolo prende quello della cartella, ripulito.
    expect(filmDaCercare('06 Spontaneous Combustion.mp4', 'Season 03', 'South Park Season 1 to 26 Mp4 1080p')).toEqual({
      titolo: 'South Park',
      stagione: 3,
      episodio: 6,
    })
    // L'anno della cartella resta, se il file non lo dice.
    expect(filmDaCercare('Shogun.S01E02.mkv', 'Season 01', 'Shōgun (2024)')).toEqual({
      titolo: 'Shogun',
      anno: 2024,
      stagione: 1,
      episodio: 2,
    })
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

describe('i nomi degli anime', () => {
  it('«[Gruppo] titolo - 26 - nome dell episodio»: il numero è l episodio', () => {
    // Samurai Champloo: 26 file, ognuno una riga a sé col nome della cartella.
    expect(analizzaNomeFilm('[a-s]_samurai_champloo_-_26_-_evanescent_encounter_part_3__rs2_[1080p_bd-rip][BFA66184].mp4')).toEqual({
      titolo: 'samurai champloo',
      stagione: 1,
      episodio: 26,
    })
    expect(analizzaNomeFilm('[SubsPlease] Sousou no Frieren - 05 (1080p) [A1B2C3D4].mkv')).toEqual({
      titolo: 'Sousou no Frieren',
      stagione: 1,
      episodio: 5,
    })
    expect(analizzaNomeFilm('Cowboy Bebop - 01v2.mkv')).toEqual({ titolo: 'Cowboy Bebop', stagione: 1, episodio: 1 })
  })

  it('anche con la parola «Episode» davanti al numero', () => {
    // Takopi's Original Sin: l'episodio 1 e il 5 restavano fuori dalla serie.
    expect(analizzaNomeFilm("Takopi's Original Sin - Episode 05 - To You in 2022 1080p BDRip x265 FLAC 2.0 Kira [SEV].mp4")).toEqual({
      titolo: "Takopi's Original Sin",
      stagione: 1,
      episodio: 5,
    })
    expect(analizzaNomeFilm('Frieren - Ep 7 - Something.mkv')).toEqual({ titolo: 'Frieren', stagione: 1, episodio: 7 })
  })

  it('«[Gruppo]titolo_17v2_[BD_720p]»: il numero senza trattini è l episodio', () => {
    // Fullmetal Alchemist Brotherhood: 64 righe sciolte col nome della cartella.
    expect(analizzaNomeFilm('[asaadas]Fullmetal_Alchemist_Brotherhood_17v2_[BD_720p][AtsA][2154EF7C][MP4][AAC].mp4')).toEqual({
      titolo: 'Fullmetal Alchemist Brotherhood',
      stagione: 1,
      episodio: 17,
    })
    expect(analizzaNomeFilm('[asaadas]Fullmetal_Alchemist_Brotherhood_47_[BD_720p][AtsA][BA59C3B8][MP4][AAC].mp4')).toEqual({
      titolo: 'Fullmetal Alchemist Brotherhood',
      stagione: 1,
      episodio: 47,
    })
    expect(analizzaNomeFilm('[Erai-raws] Frieren 05 [1080p].mkv')).toEqual({ titolo: 'Frieren', stagione: 1, episodio: 5 })
  })

  it('le sigle senza scritte («OP1v2_Clean», «ED3», «Intro») sono speciali della serie', () => {
    // Fullmetal Alchemist Brotherhood: 11 sigle restavano righe sciolte.
    for (const nome of [
      '[asaadas]Fullmetal_Alchemist_Brotherhood_OP1v2_Clean_[BD_720p][AtsA][39C599D1][MP4][AAC].mp4',
      '[asaadas]Fullmetal_Alchemist_Brotherhood_ED3_Clean_[BD_720p][AtsA][C9EBB888][MP4][AAC].mp4',
      '[asaadas]Fullmetal_Alchemist_Brotherhood_Intro_[BD_720p][AtsA][7FA59929][MP4][AAC].mp4',
      '[Group] Frieren - NCOP2 [1080p].mkv',
    ]) {
      const letto = analizzaNomeFilm(nome)
      expect(letto, nome).toMatchObject({ stagione: 0 })
      expect(letto.episodio, nome).toBeUndefined()
    }
    expect(analizzaNomeFilm('[asaadas]Fullmetal_Alchemist_Brotherhood_ED3_Clean_[BD_720p].mp4').titolo).toBe(
      'Fullmetal Alchemist Brotherhood',
    )
  })

  it('gli «Skit» e gli omake numerati sono speciali, non episodi', () => {
    // Fullmetal Alchemist Brotherhood: «Skit_01» compariva come un secondo Ep. 1.
    for (const nome of [
      '[asaadas]Fullmetal_Alchemist_Brotherhood_Skit_01_[BD_540p][AtsA][AE207181][MP4][AAC].mp4',
      '[Group] Frieren Omake 03 [1080p].mkv',
      '[Group] Frieren - Preview 05 [1080p].mkv',
      '[Group] Frieren PV 02 [1080p].mkv',
      '[Group] Frieren - Menu 01 [1080p].mkv',
      '[Group] Frieren - Trailer [1080p].mkv',
      '[Group] Frieren CM1 [1080p].mkv',
    ]) {
      const letto = analizzaNomeFilm(nome)
      expect(letto, nome).toMatchObject({ stagione: 0 })
      expect(letto.episodio, nome).toBeUndefined()
    }
    expect(analizzaNomeFilm('[asaadas]Fullmetal_Alchemist_Brotherhood_Skit_01_[BD_540p].mp4').titolo).toBe(
      'Fullmetal Alchemist Brotherhood',
    )
  })

  it('«Special 01» col gruppo in testa resta lo speciale col suo numero', () => {
    expect(analizzaNomeFilm('[Group] Frieren Special 01 [1080p].mkv')).toEqual({ titolo: 'Frieren', stagione: 0, episodio: 1 })
    expect(analizzaNomeFilm('[Group] Frieren OVA 02 [1080p].mkv')).toEqual({ titolo: 'Frieren', stagione: 0, episodio: 2 })
  })

  it('senza il gruppo in testa «Intro» o «ED» restano parole del titolo', () => {
    expect(analizzaNomeFilm('Ed Wood [1994].mkv').stagione).toBeUndefined()
    expect(analizzaNomeFilm('The Intro [1080p].mkv').stagione).toBeUndefined()
  })

  it('senza il gruppo in testa un numero prima delle etichette resta nel titolo', () => {
    expect(analizzaNomeFilm('Apollo 13 [1080p].mkv').episodio).toBeUndefined()
    expect(analizzaNomeFilm('Ocean s 11 [BD 720p].mkv').episodio).toBeUndefined()
    // Il gruppo da solo non basta: dopo il numero ci vogliono le etichette.
    expect(analizzaNomeFilm('[YTS] Apollo 13 (1995).mp4')).toMatchObject({ anno: 1995 })
    expect(analizzaNomeFilm('[YTS] Apollo 13 (1995).mp4').episodio).toBeUndefined()
  })

  it('la cartella col gruppo e l intervallo di episodi ha il titolo pulito', () => {
    expect(analizzaNomeFilm('[a-S] Samurai Champloo (01-26) (1080p)').titolo).toBe('Samurai Champloo')
    expect(analizzaNomeFilm('Trigun [01-26] [BD]').titolo).toBe('Trigun')
  })

  it('in una cartella di stagione vale la stagione della cartella', () => {
    expect(filmDaCercare('South Park - 01 - Rainforest Shmainforest.mp4', 'Season 03', 'South Park')).toEqual({
      titolo: 'South Park',
      stagione: 3,
      episodio: 1,
    })
  })

  it('non scambia per episodi i numeri dei titoli o gli anni', () => {
    // Gli anime scrivono sempre due cifre: «Rocky - 2» è un film.
    expect(analizzaNomeFilm('Rocky - 2.mp4').episodio).toBeUndefined()
    expect(analizzaNomeFilm('Blade Runner - 2049 (2017).mp4')).toMatchObject({ anno: 2017 })
    expect(analizzaNomeFilm('Blade Runner - 2049 (2017).mp4').episodio).toBeUndefined()
    expect(analizzaNomeFilm('Ocean s 11 (2001).mp4').episodio).toBeUndefined()
  })
})

describe('gli speciali senza numero', () => {
  it('un file in una cartella di speciali senza numero è uno speciale della serie', () => {
    expect(filmDaCercare('A Mickey Mouse Cartoon - Surprise! EXCLUSIVE CLIP.mp4', 'Speicals', 'A Mickey Mouse Cartoon')).toEqual({
      titolo: 'A Mickey Mouse Cartoon',
      stagione: 0,
    })
  })

  it('l episodio 0 («S04E00») è uno speciale, non un episodio che su TMDB non esiste', () => {
    expect(analizzaNomeFilm('A Mickey Mouse Cartoon - S04E00 - Mickey Mouse Clubhouse.mp4')).toEqual({
      titolo: 'A Mickey Mouse Cartoon',
      stagione: 0,
    })
    expect(filmDaCercare('A Mickey Mouse Cartoon - S04E00 - Mickey Mouse Clubhouse.mp4', 'Speicals', 'A Mickey Mouse Cartoon')).toEqual({
      titolo: 'A Mickey Mouse Cartoon',
      stagione: 0,
    })
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

  it('anche con le lettere scambiate per sbaglio («Speicals»)', () => {
    // A Mickey Mouse Cartoon/Speicals/… diventava una serie a sé, «Speicals».
    expect(stagioneDaCartella('Speicals')).toBe(0)
    expect(stagioneDaCartella('Spceial')).toBe(0)
    expect(stagioneDaCartella('Specail')).toBe(0)
    // Ma non ogni parola con quelle lettere in giro.
    expect(stagioneDaCartella('Special Forces')).toBeNull()
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
      'WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000\nCiao\n\n2\n00:01:02.345 --> 00:01:04.000 line:0\nSopra\n',
    )
  })

  it('la posizione in stile ASS diventa quella di WebVTT: in alto, a metà, in basso', () => {
    // Come la scrive ffmpeg estraendo un ASS: il tag dentro il <font>.
    const srt =
      '1\n00:14:05,000 --> 00:14:09,000\n<font size="36">{\\an8}Top 10 of the 104th</font>\n\n' +
      '2\n00:14:10,000 --> 00:14:12,000\n{\\an5}A metà\n\n' +
      '3\n00:14:13,000 --> 00:14:14,000\n{\\an2}{\\i1}In basso{\\i0}\n'
    expect(srtAVtt(srt)).toBe(
      'WEBVTT\n\n1\n00:14:05.000 --> 00:14:09.000 line:0\n<font size="36">Top 10 of the 104th</font>\n\n' +
        '2\n00:14:10.000 --> 00:14:12.000 line:50%\nA metà\n\n' +
        '3\n00:14:13.000 --> 00:14:14.000\nIn basso\n',
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
