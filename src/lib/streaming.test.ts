import { describe, it, expect } from 'vitest'
import {
  abbinamentoDa,
  arrivatoAllaFine,
  etichettaGuarda,
  fileDaGuardare,
  contaComeVisto,
  formattaTempo,
  normalizzaTitolo,
  posizionePiuRecente,
  prossimoEpisodio,
  puntoDiRipresa,
  scegliAbbinamento,
  titoloDaMostrare,
  type VoceStreaming,
} from './streaming'
import type { MediaItem } from './types'

const media = (over: Partial<MediaItem>): MediaItem => ({
  id: 1,
  mediaType: 'movie',
  title: 'Titolo',
  originalTitle: null,
  overview: '',
  posterPath: null,
  backdropPath: null,
  releaseDate: null,
  voteAverage: 0,
  genreIds: [],
  originalLanguage: null,
  ...over,
})

describe('normalizzaTitolo', () => {
  it('ignora accenti, maiuscole e punteggiatura', () => {
    expect(normalizzaTitolo('Shōgun')).toBe('shogun')
    expect(normalizzaTitolo('Song.of.the.Sea')).toBe('song of the sea')
    expect(normalizzaTitolo('Fast & Furious')).toBe('fast and furious')
  })
})

describe('scegliAbbinamento', () => {
  const songFilm = media({ id: 110416, title: 'La canzone del mare', originalTitle: 'Song of the Sea', releaseDate: '2014-09-06' })
  const omonimo = media({ id: 999, title: 'Song of the Sea', releaseDate: '1952-01-01' })

  it('trova il film col titolo originale e l’anno', () => {
    expect(scegliAbbinamento({ titolo: 'Song of the Sea', anno: 2014 }, [omonimo, songFilm])?.id).toBe(110416)
  })

  it('con gli altri nomi del titolo: «Shingeki no Kyojin» è Attack on Titan', () => {
    const aot = media({ id: 1429, mediaType: 'tv', title: "L'attacco dei giganti", originalTitle: '進撃の巨人', releaseDate: '2013-04-07' })
    const nome = { titolo: 'Shingeki no Kyojin', stagione: 1, episodio: 4 }
    expect(scegliAbbinamento(nome, [aot])).toBeNull()
    expect(scegliAbbinamento(nome, [aot], new Map([['tv-1429', ['Shingeki no Kyojin', 'AoT']]]))?.id).toBe(1429)
    // Gli altri nomi di un altro titolo non contano.
    expect(scegliAbbinamento(nome, [aot], new Map([['movie-1429', ['Shingeki no Kyojin']]]))).toBeNull()
  })

  it('nei pacchetti il nome della saga sta davanti al titolo: «Transformers Bumblebee» è Bumblebee', () => {
    const bumblebee = media({ id: 424783, title: 'Bumblebee', releaseDate: '2018-12-15' })
    expect(scegliAbbinamento({ titolo: 'Transformers Bumblebee', anno: 2018 }, [bumblebee])?.id).toBe(424783)
    const impero = media({ id: 1891, title: "L'Impero colpisce ancora", englishTitle: 'The Empire Strikes Back', releaseDate: '1980-05-20' })
    expect(scegliAbbinamento({ titolo: 'Star Wars The Empire Strikes Back', anno: 1980 }, [impero])?.id).toBe(1891)
  })

  it('ma solo con l’anno giusto, e non per una parola corta', () => {
    const bumblebee = media({ id: 424783, title: 'Bumblebee', releaseDate: '2018-12-15' })
    expect(scegliAbbinamento({ titolo: 'Transformers Bumblebee', anno: 2017 }, [bumblebee])).toBeNull()
    expect(scegliAbbinamento({ titolo: 'Transformers Bumblebee' }, [bumblebee])).toBeNull()
    const film = media({ id: 346364, title: 'It', releaseDate: '2017-09-05' })
    expect(scegliAbbinamento({ titolo: 'Stephen King s Fear It', anno: 2017 }, [film])).toBeNull()
  })

  it('scarta un film omonimo di un altro anno', () => {
    expect(scegliAbbinamento({ titolo: 'Song of the Sea', anno: 2014 }, [omonimo])).toBeNull()
  })

  it('un episodio vuole una serie, anche se il film omonimo è più popolare', () => {
    const film = media({ id: 1, mediaType: 'movie', title: 'Shogun', releaseDate: '1980-01-01' })
    const serie = media({ id: 126308, mediaType: 'tv', title: 'Shōgun', releaseDate: '2024-02-27' })
    expect(scegliAbbinamento({ titolo: 'Shogun', stagione: 1, episodio: 3 }, [film, serie])?.id).toBe(126308)
  })

  it('il titolo inglese conta: «Memories of Murder» in italiano è «Memorie di un assassino»', () => {
    const film = media({ id: 11423, title: 'Memorie di un assassino', originalTitle: '살인의 추억', englishTitle: 'Memories of Murder', releaseDate: '2003-05-02' })
    expect(scegliAbbinamento({ titolo: 'Memories of Murder', anno: 2003 }, [film])?.id).toBe(11423)
  })

  it('un film con l anno non diventa una serie di un altro anno', () => {
    // «Memories of Murder (2003)» era finito sotto «Gap Dong» (2014), una
    // serie coreana che fra gli altri nomi ha anche quello.
    const gapDong = media({ id: 61375, mediaType: 'tv', title: 'Gap Dong', releaseDate: '2014-04-11' })
    const altri = new Map([['tv-61375', ['Memories of Murder']]])
    expect(scegliAbbinamento({ titolo: 'Memories of Murder', anno: 2003 }, [gapDong], altri)).toBeNull()
    // Un episodio invece porta spesso l'anno della messa in onda: la serie va bene.
    expect(scegliAbbinamento({ titolo: 'Gap Dong', anno: 2015, stagione: 1, episodio: 3 }, [gapDong])?.id).toBe(61375)
  })

  it('senza abbastanza somiglianza non indovina: meglio chiedere', () => {
    expect(scegliAbbinamento({ titolo: 'B99' }, [media({ title: 'Brooklyn Nine-Nine', mediaType: 'tv' })])).toBeNull()
    expect(scegliAbbinamento({ titolo: '' }, [songFilm])).toBeNull()
  })
})

describe('abbinamentoDa', () => {
  it('per una serie tiene stagione ed episodio del file', () => {
    const serie = media({ id: 126308, mediaType: 'tv', title: 'Shōgun', posterPath: '/p.jpg' })
    expect(abbinamentoDa(serie, { titolo: 'Shogun', stagione: 1, episodio: 3 })).toEqual({
      tmdb_id: 126308,
      media_type: 'tv',
      titolo: 'Shōgun',
      poster_path: '/p.jpg',
      stagione: 1,
      episodio: 3,
    })
  })

  it('per un film niente stagione né episodio', () => {
    expect(abbinamentoDa(media({ id: 5 }), { titolo: 'X', stagione: 1, episodio: 2 })).toMatchObject({
      stagione: null,
      episodio: null,
    })
  })
})

describe('quando un film conta come visto', () => {
  it('oltre il 90% o negli ultimi tre minuti è arrivato alla fine', () => {
    expect(arrivatoAllaFine(5100, 5640)).toBe(true) // 90,4%
    expect(arrivatoAllaFine(5500, 5640)).toBe(true) // ultimi 140 s
    expect(arrivatoAllaFine(3000, 5640)).toBe(false)
    expect(arrivatoAllaFine(3000, null)).toBe(false)
  })

  it('saltare alla fine senza averlo guardato non vale', () => {
    expect(contaComeVisto(5200, 5640, 60)).toBe(false)
    expect(contaComeVisto(5200, 5640, 4000)).toBe(true)
  })
})

describe('puntoDiRipresa', () => {
  it('riparte qualche secondo prima di dove ci si era fermati', () => {
    expect(puntoDiRipresa(1345, 5640)).toBe(1340)
  })

  it('dall’inizio se si era appena cominciato o già finito', () => {
    expect(puntoDiRipresa(12, 5640)).toBe(0)
    expect(puntoDiRipresa(5600, 5640)).toBe(0)
  })
})

describe('formattaTempo', () => {
  it('ore solo quando servono', () => {
    expect(formattaTempo(1345)).toBe('22:25')
    expect(formattaTempo(5640)).toBe('1:34:00')
  })
})

describe('prossimoEpisodio', () => {
  const ep = (id: string, stagione: number, episodio: number, tmdb = 126308): VoceStreaming => ({
    drive_file_id: id,
    nome_file: null,
    tmdb_id: tmdb,
    media_type: 'tv',
    titolo: 'Shōgun',
    poster_path: null,
    stagione,
    episodio,
    abbinato_a_mano: false,
    posizione: 0,
    durata: null,
    secondi_visti: 0,
    visto_il: null,
  })
  const tutte = [ep('e3', 1, 3), ep('e1', 1, 1), ep('e2', 1, 2), ep('s2e1', 2, 1), ep('altra', 1, 2, 42)]

  it('il successivo della stessa stagione, della stessa serie', () => {
    expect(prossimoEpisodio(ep('e1', 1, 1), tutte)?.drive_file_id).toBe('e2')
  })

  it('finita la stagione, il primo della successiva', () => {
    expect(prossimoEpisodio(ep('e3', 1, 3), tutte)?.drive_file_id).toBe('s2e1')
  })

  it('nessuno dopo l’ultimo, e nessuno per un film', () => {
    expect(prossimoEpisodio(ep('s2e1', 2, 1), tutte)).toBeNull()
    expect(prossimoEpisodio({ ...ep('f', 1, 1), media_type: 'movie' }, tutte)).toBeNull()
  })

  it('dopo uno speciale viene lo speciale dopo, non la prima stagione', () => {
    // Con la riproduzione automatica, finito l'OAD 8 si ripartiva da S1E1.
    const conSpeciali = [...tutte, ep('oad1', 0, 1), ep('oad2', 0, 2)]
    expect(prossimoEpisodio(ep('oad1', 0, 1), conSpeciali)?.drive_file_id).toBe('oad2')
    expect(prossimoEpisodio(ep('oad2', 0, 2), conSpeciali)).toBeNull()
    // E dalle stagioni vere non si finisce negli speciali.
    expect(prossimoEpisodio(ep('e3', 1, 3), conSpeciali)?.drive_file_id).toBe('s2e1')
  })
})

describe('titoloDaMostrare', () => {
  it('per un episodio aggiunge stagione ed episodio', () => {
    expect(titoloDaMostrare({ titolo: 'Shōgun', media_type: 'tv', stagione: 1, episodio: 3 })).toBe('Shōgun · S1E3')
    expect(titoloDaMostrare({ titolo: 'La canzone del mare', media_type: 'movie', stagione: null, episodio: null })).toBe(
      'La canzone del mare',
    )
    expect(titoloDaMostrare({ titolo: null, media_type: null, stagione: null, episodio: null })).toBeNull()
  })
})

describe('posizionePiuRecente', () => {
  it('vince la copia più recente fra server e dispositivo', () => {
    const server = { posizione: 600, updated_at: '2026-09-30T10:00:00Z' }
    expect(posizionePiuRecente(server, { posizione: 900, quando: Date.parse('2026-09-30T11:00:00Z') })).toBe(900)
    expect(posizionePiuRecente(server, { posizione: 900, quando: Date.parse('2026-09-30T09:00:00Z') })).toBe(600)
    expect(posizionePiuRecente(null, { posizione: 300, quando: 1 })).toBe(300)
    expect(posizionePiuRecente(null, null)).toBe(0)
  })
})

describe('«Guarda ora»: quale file far partire', () => {
  const riga = (id: string, over: Partial<VoceStreaming> = {}): VoceStreaming => ({
    drive_file_id: id,
    nome_file: null,
    tmdb_id: 110416,
    media_type: 'movie',
    titolo: 'Song of the Sea',
    poster_path: null,
    stagione: null,
    episodio: null,
    abbinato_a_mano: false,
    posizione: 0,
    durata: 5640,
    secondi_visti: 0,
    visto_il: null,
    ...over,
  })

  it('nessun file per il titolo, nessun pulsante', () => {
    expect(fileDaGuardare([riga('a')], 999, 'movie')).toBeNull()
    // Stesso numero, altro tipo: gli id TMDB sono unici solo dentro un tipo.
    expect(fileDaGuardare([riga('a')], 110416, 'tv')).toBeNull()
  })

  it('un film lasciato a metà si riprende, con l’ora nel pulsante', () => {
    const scelto = fileDaGuardare([riga('intero'), riga('a-meta', { posizione: 1345 })], 110416, 'movie')
    expect(scelto?.drive_file_id).toBe('a-meta')
    expect(etichettaGuarda(scelto as VoceStreaming)).toBe('▶ Riprendi da 22:20')
    expect(etichettaGuarda(riga('nuovo'))).toBe('▶ Guarda ora')
    // Già visto: si riguarda dall'inizio.
    expect(etichettaGuarda(riga('visto', { posizione: 1345, visto_il: '2026-09-30' }))).toBe('▶ Guarda ora')
  })

  it('una serie: l’episodio chiesto, altrimenti il primo non visto', () => {
    const ep = (id: string, stagione: number, episodio: number, visto = false) =>
      riga(id, { media_type: 'tv', tmdb_id: 126308, stagione, episodio, visto_il: visto ? '2026-09-30' : null })
    const righe = [ep('s1e2', 1, 2), ep('s1e1', 1, 1, true), ep('s1e3', 1, 3)]
    expect(fileDaGuardare(righe, 126308, 'tv')?.drive_file_id).toBe('s1e2')
    expect(fileDaGuardare(righe, 126308, 'tv', { stagione: 1, episodio: 3 })?.drive_file_id).toBe('s1e3')
    // Episodio chiesto che non è nella videoteca: il primo non visto.
    expect(fileDaGuardare(righe, 126308, 'tv', { stagione: 2, episodio: 1 })?.drive_file_id).toBe('s1e2')
    expect(etichettaGuarda(righe[2])).toBe('▶ Guarda S1E3')
  })

  it('una serie: lo stesso episodio che propone la videoteca, con gli speciali in fondo', () => {
    // La scheda proponeva S1E2 mentre la videoteca diceva «Riprendi S0E8»: due
    // regole diverse. Ora è la stessa: quello lasciato a metà, poi il seguito
    // dell'ultimo visto, poi il primo non visto — e gli speciali dopo le stagioni.
    const ep = (id: string, stagione: number, episodio: number, over: Partial<VoceStreaming> = {}) =>
      riga(id, { media_type: 'tv', tmdb_id: 1429, stagione, episodio, durata: 1400, ...over })
    const oad = ep('oad1', 0, 1)
    expect(fileDaGuardare([oad, ep('s1e2', 1, 2), ep('s1e1', 1, 1)], 1429, 'tv')?.drive_file_id).toBe('s1e1')
    const aMeta = ep('oad8', 0, 8, { posizione: 700, secondi_visti: 700, updated_at: '2026-10-01T20:00:00Z' })
    expect(fileDaGuardare([oad, aMeta, ep('s1e1', 1, 1)], 1429, 'tv')?.drive_file_id).toBe('oad8')
    // Aperto un attimo per provare, non è da riprendere: si comincia da S1E1.
    const provato = { ...aMeta, secondi_visti: 15 }
    expect(fileDaGuardare([oad, provato, ep('s1e1', 1, 1)], 1429, 'tv')?.drive_file_id).toBe('s1e1')
    // Guardato fino in fondo ma mai spuntato: si va al successivo, non da capo.
    const finito = ep('s1e1', 1, 1, { posizione: 1390, secondi_visti: 1350, updated_at: '2026-10-01T21:00:00Z' })
    expect(fileDaGuardare([finito, ep('s1e2', 1, 2)], 1429, 'tv')?.drive_file_id).toBe('s1e2')
    const visto = ep('s1e1', 1, 1, { visto_il: '2026-10-01', posizione: 1400, updated_at: '2026-10-01T21:00:00Z' })
    expect(fileDaGuardare([visto, ep('s1e2', 1, 2), oad], 1429, 'tv')?.drive_file_id).toBe('s1e2')
  })

  it('gli speciali si chiamano «Speciale», non S0', () => {
    const oad = riga('oad8', { media_type: 'tv', stagione: 0, episodio: 8, titolo: "L'attacco dei giganti" })
    expect(etichettaGuarda(oad)).toBe('▶ Guarda Speciale 8')
    expect(titoloDaMostrare(oad)).toBe("L'attacco dei giganti · Speciale 8")
  })
})
