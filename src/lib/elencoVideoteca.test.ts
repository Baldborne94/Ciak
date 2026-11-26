import { describe, it, expect } from 'vitest'
import { componiVideoteca } from './elencoVideoteca'
import type { VideoFile } from './fileVideo'
import type { InfoTitoli } from './useInfoTitoli'
import type { VoceStreaming } from './streaming'

// Le righe della videoteca per una scheda: i film sciolti, una riga per serie
// e una per saga, con ciò che serve a cercarle, ordinarle e sistemarle.

function video(id: string, name: string, extra: Partial<VideoFile> = {}): VideoFile {
  return { id, name, size: 1, mimeType: 'video/mp4', cartella: null, ...extra }
}

function voce(id: string, campi: Partial<VoceStreaming>): VoceStreaming {
  return {
    drive_file_id: id,
    nome_file: null,
    tmdb_id: null,
    media_type: null,
    titolo: null,
    poster_path: null,
    stagione: null,
    episodio: null,
    abbinato_a_mano: false,
    posizione: 0,
    durata: null,
    secondi_visti: 0,
    visto_il: null,
    ...campi,
  }
}

const VUOTE: InfoTitoli = { anni: new Map(), generi: new Map(), titoli: new Map(), saghe: new Map() }

describe('componiVideoteca', () => {
  const alien = { id: 8091, name: 'Alien', posterPath: '/alien.jpg' }
  const mostrati = [
    video('loc-a1', 'Alien.1979.mp4', { categoria: 'FILM' }),
    video('loc-a2', 'Aliens.1986.mp4', { categoria: 'FILM' }),
    video('loc-p', 'Paprika.2006.mp4', { categoria: 'FILM' }),
    video('loc-s1', 'South Park S01E01.mp4', { categoria: 'SERIE TV', serie: 'South Park', cartella: 'Season 1' }),
    video('loc-s2', 'South Park S01E02.mp4', { categoria: 'SERIE TV', serie: 'South Park', cartella: 'Season 1' }),
  ]
  const archivio = new Map([
    ['loc-a1', voce('loc-a1', { tmdb_id: 348, media_type: 'movie', titolo: 'Alien', poster_path: '/a1.jpg' })],
    ['loc-a2', voce('loc-a2', { tmdb_id: 679, media_type: 'movie', titolo: 'Aliens', poster_path: '/a2.jpg' })],
  ])
  const info: InfoTitoli = {
    ...VUOTE,
    anni: new Map([['movie-348', '1979'], ['movie-679', '1986']]),
    saghe: new Map([['movie-348', alien], ['movie-679', alien]]),
  }
  const composta = componiVideoteca(mostrati, archivio, info, [])
  const nomi = composta.voci.map((v) => v.riga.nome).sort()

  it('una riga per film sciolto, per saga e per serie', () => {
    expect(nomi).toEqual(['Alien', 'Paprika.2006', 'South Park'].sort())
    expect(composta.saghe.get('saga-8091')?.ids).toEqual(['loc-a1', 'loc-a2'])
    expect([...composta.serie.values()].map((g) => g.ids)).toEqual([['loc-s1', 'loc-s2']])
  })

  it('la saga si trova cercando uno dei suoi film, e porta il primo anno', () => {
    const saga = composta.voci.find((v) => v.riga.id === 'saga-8091')!.riga
    expect(saga.file).toContain('Aliens')
    expect(saga.anno).toBe('1979')
  })

  it('un film non riconosciuto è da sistemare; uno con titolo e locandina no', () => {
    expect(composta.voci.find((v) => v.video.id === 'loc-p')!.riga.daSistemare).toBe(true)
    expect(composta.film.find((f) => f.video.id === 'loc-a1')!.riga.daSistemare).toBe(false)
  })

  it('i film per comporre una saga: i riconosciuti, uno per titolo, in ordine', () => {
    expect(composta.filmPerSaga.map((f) => f.chiave)).toEqual(['movie-348', 'movie-679'])
    expect(composta.inSagaTmdb).toEqual(new Set(['movie-348', 'movie-679']))
    expect(composta.posterDi.get('movie-679')).toBe('/a2.jpg')
  })
})

describe('saghe dalla cartella', () => {
  // Dal NAS: i quattro film di Attack on Titan, che TMDB non riconosce dal
  // nome («[Anime Time] … Movie 03 - Kakusei no Houkou»), stavano sciolti
  // nell'elenco, uno per riga, invece che in una cartella.
  const aot = (n: number, sottotitolo: string) =>
    video(`jf-aot${n}`, `[Anime Time] Attack on Titan Movie 0${n} - ${sottotitolo}.mkv`, { categoria: 'ANIME', cartella: 'Attack On Titan Movies' })
  const mostrati = [
    aot(3, 'Kakusei no Houkou'),
    aot(1, 'Guren no Yumiya'),
    aot(4, 'Chronicle'),
    aot(2, 'Jiyuu no Tsubasa'),
    video('jf-p', 'Paprika.2006.mp4', { categoria: 'ANIME', cartella: 'Paprika (2006)' }),
    // File messi direttamente nella cartella della categoria: non sono una saga.
    video('jf-x', 'Akira.1988.mkv', { categoria: 'Movies', cartella: 'Movies' }),
    video('jf-y', 'Perfect.Blue.1997.mkv', { categoria: 'Movies', cartella: 'Movies' }),
  ]

  it('i film in una cartella-raccolta diventano una saga col suo nome, in ordine di numero', () => {
    const composta = componiVideoteca(mostrati, new Map(), VUOTE, [])
    const saga = [...composta.saghe.values()].find((g) => g.saga.name === 'Attack On Titan Movies')
    expect(saga?.ids).toEqual(['jf-aot1', 'jf-aot2', 'jf-aot3', 'jf-aot4'])
    // Una riga per la saga, e gli altri tre film sciolti: i due nella cartella
    // della categoria («Movies») non sono una saga.
    expect(composta.voci.map((v) => v.riga.id).sort()).toEqual(['cartella-attack on titan movies', 'jf-p', 'jf-x', 'jf-y'])
    // Una saga dalla cartella non ha una saga di TMDB da modificare.
    expect(saga?.saga.daCartella).toBe(true)
    expect(composta.inSagaTmdb.size).toBe(0)
  })

  it('un film solo nella cartella resta sciolto', () => {
    const composta = componiVideoteca([aot(1, 'Guren no Yumiya')], new Map(), VUOTE, [])
    expect(composta.saghe.size).toBe(0)
  })

  it('una saga di TMDB vince su quella della cartella', () => {
    const archivio = new Map([
      ['jf-aot1', voce('jf-aot1', { tmdb_id: 1, media_type: 'movie', titolo: 'Crimson Bow and Arrow', poster_path: '/1.jpg' })],
      ['jf-aot2', voce('jf-aot2', { tmdb_id: 2, media_type: 'movie', titolo: 'Wings of Freedom', poster_path: '/2.jpg' })],
    ])
    const collezione = { id: 99, name: 'Attack on Titan Collection', posterPath: '/c.jpg' }
    const info: InfoTitoli = { ...VUOTE, saghe: new Map([['movie-1', collezione], ['movie-2', collezione]]) }
    const composta = componiVideoteca(mostrati.slice(0, 4), archivio, info, [])
    expect(composta.saghe.get('saga-99')?.ids.sort()).toEqual(['jf-aot1', 'jf-aot2'])
    // Gli altri due, rimasti nella cartella, sono ancora una saga dalla cartella.
    const daCartella = [...composta.saghe.values()].find((g) => g.saga.daCartella)
    expect(daCartella?.ids).toEqual(['jf-aot3', 'jf-aot4'])
  })
})
