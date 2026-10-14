import { describe, it, expect } from 'vitest'
import { idFileValido, senzaExtra, nomeCategoria, schedeCategorie, soloRiproducibili, titoloVideo } from './fileVideo'

describe('titoloVideo', () => {
  it('usa il nome della sottocartella, che di solito è il film', () => {
    expect(
      titoloVideo({ name: 'Song.of.the.Sea.2014.1080p.BluRay.x264.mkv', cartella: 'Song of the Sea (2014) [1080p]' }),
    ).toBe('Song of the Sea (2014) [1080p]')
  })

  it('dentro un pacchetto di film mostra il film, non il nome del pacchetto', () => {
    // Sei righe tutte «Transformers Complete Movie Collection», indistinguibili.
    expect(
      titoloVideo({
        name: '06 Transformers Bumblebee - Action 2018 Eng Rus Multi-Subs 1080p [H264-mp4].mp4',
        cartella: 'Transformers Complete Movie Collection',
      }),
    ).toBe('Transformers Bumblebee (2018)')
  })

  it('senza sottocartella usa il nome del file senza estensione', () => {
    expect(titoloVideo({ name: 'B99 S7E2.mp4', cartella: null })).toBe('B99 S7E2')
    expect(titoloVideo({ name: 'Shogun.S01E01.mkv', cartella: null })).toBe('Shogun.S01E01')
  })

  it('un episodio in una cartella di stagione prende il nome della serie', () => {
    // Mostrava «Season 03» per ogni episodio di South Park.
    expect(titoloVideo({ name: '01 Rainforest Shmainforest.mp4', cartella: 'Season 03', serie: 'South Park' })).toBe(
      'South Park · S3E1',
    )
    expect(titoloVideo({ name: 'Extra.mp4', cartella: 'Season 03', serie: 'South Park' })).toBe('South Park · Season 03')
  })

  it('il nome di una raccolta si ripulisce: «South Park», non «South Park Season 1 to 26 Mp4 1080p»', () => {
    expect(titoloVideo({ name: 'South Park S03E06.mp4', cartella: 'Season 03', serie: 'South Park Season 1 to 26 Mp4 1080p' })).toBe(
      'South Park · S3E6',
    )
    expect(titoloVideo({ name: 'Episodio 2.mkv', cartella: 'Stagione 1', serie: 'Lupin III (1977)' })).toBe('Lupin III (1977) · S1E2')
  })

  it('gli episodi nella cartella della serie non hanno tutti lo stesso nome', () => {
    expect(titoloVideo({ name: 'Shogun.S01E02.mkv', cartella: 'Shogun (2024)' })).toBe('Shogun (2024) · S1E2')
  })

  it('non taglia un nome che non ha estensione', () => {
    expect(titoloVideo({ name: 'Film senza estensione', cartella: null })).toBe('Film senza estensione')
  })
})

describe('idFileValido', () => {
  it('accetta gli id dei file della cartella e del server di casa', () => {
    expect(idFileValido('loc-0123456789abcdef')).toBe(true)
    expect(idFileValido('jf-06006283103f8493628d6b5b9a95da9d')).toBe(true)
  })

  it('rifiuta ciò che potrebbe uscire dall’URL del lettore', () => {
    expect(idFileValido('../../evil')).toBe(false)
    expect(idFileValido('abc?x=1')).toBe(false)
    expect(idFileValido('corto')).toBe(false)
    expect(idFileValido('')).toBe(false)
  })
})

describe('senzaExtra', () => {
  const v = (name: string, cartella: string | null) => ({ id: name, name, size: null, mimeType: 'video/mp4', cartella })
  it('gli extra dei film (featurette, trailer, interviste) non sono titoli da guardare', () => {
    // «Paprika (2006)/Featurettes/Restoring Paprika.mp4» compariva come un film, «Featurettes».
    const { visibili, extra } = senzaExtra([
      v('Restoring Paprika.mp4', 'Featurettes'),
      v('Trailer.mp4', 'Trailers'),
      v('Making of.mp4', 'Behind the Scenes'),
      v('Paprika (2006).mp4', 'Paprika (2006)'),
      v('OADE01.mp4', 'OADs'),
      v('NCOP.mp4', 'Extras'),
    ])
    expect(visibili.map((x) => x.name)).toEqual(['Paprika (2006).mp4', 'OADE01.mp4', 'NCOP.mp4'])
    expect(extra).toBe(3)
  })

  it('le anteprime e i promo delle release non sono titoli', () => {
    // Accanto a «Deathly Hallows Part 1»: «ETRG.mp4» da 1 MB (il promo del
    // gruppo) e «…ETRG.Sample.mp4», un pezzo del film.
    const mb = (n: number) => n * 1024 * 1024
    const { visibili, extra } = senzaExtra([
      { ...v('ETRG.mp4', 'HP'), size: mb(1) },
      { ...v('Deathly.Hallows.Part.1.2010.1080p.BluRay.x264.DTS-ETRG.Sample.mp4', 'HP'), size: mb(26) },
      { ...v('Deathly.Hallows.Part.1.2010.1080p.BluRay.x264.DTS-ETRG.mp4', 'HP'), size: mb(2400) },
      // «Sample» dentro un titolo non è un'anteprima, e senza misura nota non si scarta.
      { ...v('Sampled.Lives.2019.mp4', null), size: mb(900) },
      v('Corto.mp4', null),
    ])
    expect(visibili.map((x) => x.name)).toEqual(['Deathly.Hallows.Part.1.2010.1080p.BluRay.x264.DTS-ETRG.mp4', 'Sampled.Lives.2019.mp4', 'Corto.mp4'])
    expect(extra).toBe(2)
  })
})

describe('soloRiproducibili', () => {
  const v = (name: string, mimeType: string) => ({ id: name, name, size: null, mimeType, cartella: null })

  it('tiene gli MP4 (e WebM/M4V) e conta gli MKV e gli altri formati nascosti', () => {
    const esito = soloRiproducibili([
      v('Song.of.the.Sea.mp4', 'video/mp4'),
      v('The.Secret.of.Kells.mkv', 'video/x-matroska'),
      v('Clip.webm', 'video/webm'),
      v('Vecchio.avi', 'video/x-msvideo'),
      v('Telefono.M4V', 'video/x-m4v'),
    ])
    expect(esito.visibili.map((x) => x.name)).toEqual(['Song.of.the.Sea.mp4', 'Clip.webm', 'Telefono.M4V'])
    expect(esito.nascosti).toBe(2)
  })

  it('gli MKV del server di casa restano: li converte Jellyfin', () => {
    const esito = soloRiproducibili([{ ...v('The.Secret.of.Kells.mkv', 'video/mkv'), id: 'jf-06006283103f8493628d6b5b9a95da9d' }])
    expect(esito.nascosti).toBe(0)
  })
})

describe('schede della videoteca', () => {
  it('nomi leggibili dalle cartelle in maiuscolo', () => {
    expect(nomeCategoria('FILM')).toBe('Film')
    expect(nomeCategoria('SERIE TV')).toBe('Serie TV')
    expect(nomeCategoria('CARTONI')).toBe('Cartoni')
    expect(nomeCategoria(null)).toBe('Altro')
  })

  it('film, serie, anime, cartoni per primi, poi le altre, «Altro» in fondo; col numero di video', () => {
    const c = (categoria: string | null) => ({ categoria })
    expect(
      schedeCategorie([c('CARTONI'), c('DOCUMENTARI'), c(null), c('FILM'), c('FILM'), c('ANIME'), c('SERIE TV')]),
    ).toEqual([
      { cartella: 'FILM', nome: 'Film', quanti: 2 },
      { cartella: 'SERIE TV', nome: 'Serie TV', quanti: 1 },
      { cartella: 'ANIME', nome: 'Anime', quanti: 1 },
      { cartella: 'CARTONI', nome: 'Cartoni', quanti: 1 },
      { cartella: 'DOCUMENTARI', nome: 'Documentari', quanti: 1 },
      { cartella: null, nome: 'Altro', quanti: 1 },
    ])
  })
})
