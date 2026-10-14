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
