import { describe, it, expect } from 'vitest'
import {
  episodioIniziato,
  filtraVideoteca,
  generiPresenti,
  ordinaEpisodi,
  ordinaVideoteca,
  perStagione,
  prossimoDaGuardare,
  raggruppaSerie,
  serieDaSistemare,
  sigla,
  type EpisodioVideoteca,
  type RigaVideoteca,
} from './videoteca'

function riga(over: Partial<RigaVideoteca>): RigaVideoteca {
  return { id: 'x', nome: 'X', file: 'x.mp4', anno: null, generi: [], titoli: [], aggiunto: null, guardato: null, ...over }
}

const SONG = riga({ id: 'song', nome: 'Song of the Sea', file: 'Song.of.the.Sea.2014.mp4', anno: '2014', generi: [16, 10751], titoli: ['La canzone del mare'], aggiunto: '2026-09-01T10:00:00Z', guardato: '2026-09-30T21:00:00Z' })
const KELLS = riga({ id: 'kells', nome: 'The Secret of Kells', file: 'Kells.mp4', anno: '2009', generi: [16, 14], aggiunto: '2026-09-20T10:00:00Z' })
const ALIEN = riga({ id: 'alien', nome: 'Alien', file: 'Alien.1979.mp4', anno: '1979', generi: [27, 878], aggiunto: '2026-08-01T10:00:00Z', guardato: '2026-09-10T21:00:00Z' })
const MISTERO = riga({ id: 'mistero', nome: 'video senza nome', file: 'VID_0001.mp4' })

const ids = (r: RigaVideoteca[]) => r.map((x) => x.id)

describe('cercare nella videoteca', () => {
  it('trova per titolo, per titolo tradotto e per nome del file', () => {
    expect(ids(filtraVideoteca([SONG, KELLS, ALIEN], { query: 'kells', genere: null }))).toEqual(['kells'])
    expect(ids(filtraVideoteca([SONG, KELLS, ALIEN], { query: 'canzone del', genere: null }))).toEqual(['song'])
    expect(ids(filtraVideoteca([SONG, MISTERO], { query: 'VID_0001', genere: null }))).toEqual(['mistero'])
  })

  it('filtra per genere, insieme alla ricerca', () => {
    expect(ids(filtraVideoteca([SONG, KELLS, ALIEN], { query: '', genere: 16 }))).toEqual(['song', 'kells'])
    expect(ids(filtraVideoteca([SONG, KELLS, ALIEN], { query: 'song', genere: 27 }))).toEqual([])
  })

  it('«Da sistemare» mostra solo le righe che hanno bisogno di una mano', () => {
    const daFare = { ...MISTERO, daSistemare: true }
    expect(ids(filtraVideoteca([SONG, daFare, KELLS], { query: '', genere: null, daSistemare: true }))).toEqual(['mistero'])
    expect(ids(filtraVideoteca([SONG, daFare, KELLS], { query: '', genere: null }))).toEqual(['song', 'mistero', 'kells'])
  })
})

describe('serieDaSistemare', () => {
  const ep = (stagione: number | null) => ({ id: 'e', nome: 'e', file: 'e.mp4', stagione, episodio: 1, visto: false, posizione: 0, secondiVisti: 0, durata: null, guardato: null })
  it('non riconosciuta, senza copertina o con episodi senza stagione', () => {
    expect(serieDaSistemare({ tmdb: 'tv-1', posterPath: '/p.jpg', episodi: [ep(1), ep(0)] })).toBe(false)
    expect(serieDaSistemare({ tmdb: '', posterPath: null, episodi: [ep(1)] })).toBe(true)
    expect(serieDaSistemare({ tmdb: 'tv-1', posterPath: null, episodi: [ep(1)] })).toBe(true)
    // «Gap Dong»: un film finito sotto una serie, fra gli «Altri episodi».
    expect(serieDaSistemare({ tmdb: 'tv-1', posterPath: '/p.jpg', episodi: [ep(null)] })).toBe(true)
  })
})

describe('ordinare la videoteca', () => {
  const tutti = [KELLS, MISTERO, SONG, ALIEN]

  it('per titolo, con gli episodi in ordine numerico', () => {
    expect(ids(ordinaVideoteca(tutti, 'titolo'))).toEqual(['alien', 'song', 'kells', 'mistero'])
    const e2 = riga({ id: 'e2', nome: 'Shōgun · S1E2' })
    const e10 = riga({ id: 'e10', nome: 'Shōgun · S1E10' })
    expect(ids(ordinaVideoteca([e10, e2], 'titolo'))).toEqual(['e2', 'e10'])
  })

  it('per anno, con quelli senza anno in fondo in entrambi i versi', () => {
    expect(ids(ordinaVideoteca(tutti, 'anno-desc'))).toEqual(['song', 'kells', 'alien', 'mistero'])
    expect(ids(ordinaVideoteca(tutti, 'anno-asc'))).toEqual(['alien', 'kells', 'song', 'mistero'])
  })

  it('per data di arrivo su Drive e per ultima visione', () => {
    expect(ids(ordinaVideoteca(tutti, 'aggiunti'))).toEqual(['kells', 'song', 'alien', 'mistero'])
    // Mai guardati in fondo, in ordine di titolo.
    expect(ids(ordinaVideoteca(tutti, 'guardati'))).toEqual(['song', 'alien', 'kells', 'mistero'])
  })

  it('non tocca la lista di partenza', () => {
    const copia = [...tutti]
    ordinaVideoteca(tutti, 'anno-desc')
    expect(tutti).toEqual(copia)
  })
})

describe('generiPresenti', () => {
  it('conta i titoli per genere e tralascia i generi senza nome', () => {
    const nomi = new Map([
      [16, 'Animazione'],
      [27, 'Horror'],
      [14, 'Fantasy'],
    ])
    expect(generiPresenti([SONG, KELLS, ALIEN], nomi)).toEqual([
      { id: 16, nome: 'Animazione', quanti: 2 },
      { id: 14, nome: 'Fantasy', quanti: 1 },
      { id: 27, nome: 'Horror', quanti: 1 },
    ])
  })
})

function ep(over: Partial<EpisodioVideoteca>): EpisodioVideoteca {
  return { id: 'e', nome: 'e', file: 'e.mp4', stagione: 1, episodio: 1, visto: false, posizione: 0, secondiVisti: 0, durata: 1320, guardato: null, ...over }
}

describe('le serie, per stagioni', () => {
  const s1e2 = ep({ id: 's1e2', stagione: 1, episodio: 2 })
  const s1e10 = ep({ id: 's1e10', stagione: 1, episodio: 10 })
  const s2e1 = ep({ id: 's2e1', stagione: 2, episodio: 1 })
  const extra = ep({ id: 'extra', nome: 'Speciale', stagione: null, episodio: null })

  it('ordina per stagione ed episodio, con gli speciali dopo e chi non ha niente in fondo', () => {
    const oad = ep({ id: 'oad', stagione: 0, episodio: 1 })
    expect(ordinaEpisodi([extra, oad, s2e1, s1e10, s1e2]).map((e) => e.id)).toEqual(['s1e2', 's1e10', 's2e1', 'oad', 'extra'])
  })

  it('divide per stagione', () => {
    expect(perStagione([s2e1, s1e10, extra, s1e2]).map((g) => [g.stagione, g.episodi.map((e) => e.id)])).toEqual([
      [1, ['s1e2', 's1e10']],
      [2, ['s2e1']],
      [null, ['extra']],
    ])
  })

  it('senza niente di visto si comincia dal primo', () => {
    expect(prossimoDaGuardare([s2e1, s1e10, s1e2])?.id).toBe('s1e2')
  })

  it('si riprende l episodio lasciato a metà', () => {
    const aMeta = { ...s1e10, posizione: 600, secondiVisti: 600, guardato: '2026-10-01T20:00:00Z' }
    expect(prossimoDaGuardare([s1e2, aMeta, s2e1])?.id).toBe('s1e10')
  })

  it('aperto un attimo, o solo spostando la barra, non è «iniziato»', () => {
    // L'OAD 8 aperto per provare il lettore proponeva «Riprendi Speciale 8»
    // a chi non aveva ancora visto niente.
    const provato = ep({ id: 'oad8', stagione: 0, episodio: 8, posizione: 700, secondiVisti: 20, guardato: '2026-10-01T20:00:00Z' })
    expect(episodioIniziato(provato)).toBe(false)
    expect(prossimoDaGuardare([provato, s2e1, s1e2])?.id).toBe('s1e2')
    expect(episodioIniziato({ ...provato, secondiVisti: 120 })).toBe(true)
  })

  it('dopo l ultimo finito viene il successivo, non il primo non visto', () => {
    // Chi ha visto solo la seconda stagione non deve tornare alla prima.
    const visto = { ...s2e1, visto: true, guardato: '2026-10-01T20:00:00Z' }
    const s2e2 = ep({ id: 's2e2', stagione: 2, episodio: 2 })
    expect(prossimoDaGuardare([s1e2, visto, s2e2])?.id).toBe('s2e2')
    // Finita l'ultima, si torna al primo rimasto indietro.
    expect(prossimoDaGuardare([s1e2, visto])?.id).toBe('s1e2')
  })

  it('un episodio arrivato alla fine non si «riprende»: si va al successivo', () => {
    // «Riprendi S3E6» su un episodio finito lo faceva ripartire da capo.
    const finito = ep({ id: 's3e6', stagione: 3, episodio: 6, posizione: 1320, secondiVisti: 1300, durata: 1328, guardato: '2026-10-01T20:00:00Z' })
    const s3e7 = ep({ id: 's3e7', stagione: 3, episodio: 7 })
    expect(episodioIniziato(finito)).toBe(false)
    expect(prossimoDaGuardare([finito, s3e7])?.id).toBe('s3e7')
    // E quello dopo, appena cominciato, si riprende.
    const cominciato = { ...s3e7, posizione: 300, secondiVisti: 300, guardato: '2026-10-02T08:00:00Z' }
    expect(prossimoDaGuardare([finito, cominciato])?.id).toBe('s3e7')
  })

  it('tutto visto: niente da continuare', () => {
    expect(prossimoDaGuardare([{ ...s1e2, visto: true }])).toBeNull()
  })

  it('la sigla dell episodio', () => {
    expect(sigla(s1e10)).toBe('S1E10')
    expect(sigla(extra)).toBeNull()
    expect(sigla(ep({ stagione: 0, episodio: 8 }))).toBe('Speciale 8')
  })
})

describe('raggruppaSerie', () => {
  const sp = { tmdb_id: 2190, media_type: 'tv' as const, titolo: 'South Park', poster_path: '/sp.jpg', visto_il: null, posizione: 0, secondi_visti: 0, durata: 1320, updated_at: undefined }

  it('gli episodi non ancora riconosciuti vanno sotto la serie riconosciuta della stessa cartella', () => {
    // Prima: due «South Park», una con 50 episodi abbinati e una con 264 no.
    const { serie, sciolti } = raggruppaSerie([
      { id: 'a', name: 'South Park S01E01.mp4', cartella: 'South Park', serie: null, voce: { ...sp, stagione: 1, episodio: 1 } },
      { id: 'b', name: '01 Rainforest Shmainforest.mp4', cartella: 'Season 03', serie: 'South Park (1997)', voce: null },
      { id: 'c', name: 'South.Park.S02E05.mp4', cartella: null, serie: null },
    ])
    expect(sciolti).toEqual([])
    expect(serie).toHaveLength(1)
    expect(serie[0]).toMatchObject({ chiave: 'tv-2190', titolo: 'South Park', tmdb: 'tv-2190', posterPath: '/sp.jpg' })
    expect(serie[0].episodi.map((e) => [e.id, e.stagione, e.episodio])).toEqual([
      ['a', 1, 1],
      ['b', 3, 1],
      ['c', 2, 5],
    ])
  })

  it('gli episodi di un anime con i nomi alla giapponese sono una serie sola', () => {
    // Prima: 26 righe «[a-S] Samurai Champloo (01-26) (1080p)», una per file.
    const cartella = '[a-S] Samurai Champloo (01-26) (1080p)'
    const { serie, sciolti } = raggruppaSerie([
      { id: 'a', name: '[a-s]_samurai_champloo_-_26_-_evanescent_encounter_part_3__rs2_[1080p_bd-rip][BFA66184].mp4', cartella, serie: null },
      { id: 'b', name: '[a-s]_samurai_champloo_-_01_-_tempestuous_temperaments__rs2_[1080p_bd-rip][7E6C2D0A].mp4', cartella, serie: null },
    ])
    expect(sciolti).toEqual([])
    expect(serie).toHaveLength(1)
    expect(serie[0].titolo).toBe('Samurai Champloo')
    expect(serie[0].episodi.map((e) => [e.id, e.stagione, e.episodio])).toEqual([
      ['a', 1, 26],
      ['b', 1, 1],
    ])
  })

  it('gli episodi coi trattini bassi e senza « - » sono una serie sola', () => {
    // Prima: una riga per file, tutte «[asaadas] Fullmetal Alchemist Brotherhood [720p][MP4][AAC]».
    const cartella = '[asaadas] Fullmetal Alchemist Brotherhood [720p][MP4][AAC]'
    const { serie, sciolti } = raggruppaSerie([
      { id: 'a', name: '[asaadas]Fullmetal_Alchemist_Brotherhood_17v2_[BD_720p][AtsA][2154EF7C][MP4][AAC].mp4', cartella, serie: null },
      { id: 'b', name: '[asaadas]Fullmetal_Alchemist_Brotherhood_47_[BD_720p][AtsA][BA59C3B8][MP4][AAC].mp4', cartella, serie: null },
    ])
    expect(sciolti).toEqual([])
    expect(serie).toHaveLength(1)
    expect(serie[0].titolo).toBe('Fullmetal Alchemist Brotherhood')
    expect(serie[0].episodi.map((e) => [e.id, e.stagione, e.episodio])).toEqual([
      ['a', 1, 17],
      ['b', 1, 47],
    ])
  })

  it('una cartella di speciali scritta male resta dentro la sua serie', () => {
    // A Mickey Mouse Cartoon/Speicals/… compariva come due righe «Speicals».
    const { serie, sciolti } = raggruppaSerie([
      { id: 'a', name: 'A Mickey Mouse Cartoon - S01E01 - No Service.mp4', cartella: 'Season 01', serie: 'A Mickey Mouse Cartoon' },
      { id: 'b', name: 'A Mickey Mouse Cartoon - Surprise! EXCLUSIVE CLIP.mp4', cartella: 'Speicals', serie: 'A Mickey Mouse Cartoon' },
    ])
    expect(sciolti).toEqual([])
    expect(serie).toHaveLength(1)
    expect(serie[0].titolo).toBe('A Mickey Mouse Cartoon')
    expect(serie[0].episodi.map((e) => [e.id, e.stagione])).toEqual([
      ['a', 1],
      ['b', 0],
    ])
  })

  it('la cartella della serie resta la stessa prima e dopo il riconoscimento', () => {
    const file = { id: 'b', name: '01 Rainforest Shmainforest.mp4', cartella: 'Season 03', serie: 'South Park' }
    const prima = raggruppaSerie([file, { ...file, id: 'c', name: '02 Volcano.mp4' }]).serie[0]
    const dopo = raggruppaSerie([{ ...file, voce: { ...sp, stagione: 3, episodio: 1 } }, { ...file, id: 'c', name: '02 Volcano.mp4' }]).serie[0]
    expect(prima.chiave).not.toBe(dopo.chiave)
    expect(prima.cartella).toBe(dopo.cartella)
  })

  it('anche se il primo file della serie non è quello riconosciuto', () => {
    const { serie } = raggruppaSerie([
      { id: 'b', name: '02 Volcano.mp4', cartella: 'Season 01', serie: 'South Park' },
      { id: 'a', name: 'South Park S01E01.mp4', cartella: 'South Park', serie: null, voce: { ...sp, stagione: 1, episodio: 1 } },
    ])
    expect(serie.map((s) => [s.chiave, s.titolo, s.ids])).toEqual([['tv-2190', 'South Park', ['b', 'a']]])
  })

  it('gli OAD stanno sotto la serie, con gli episodi normali', () => {
    const { serie, sciolti } = raggruppaSerie([
      { id: 'oad1', name: 'Shingeki no Kyojin - OADE01 - Ilse.mp4', cartella: 'OADs', serie: 'Shingeki no Kyojin [10bits x265]' },
      { id: 's1e4', name: 'Shingeki no Kyojin - S01E04 - Night.mp4', cartella: 'Shingeki no Kyojin [10bits x265]', serie: null },
    ])
    expect(sciolti).toEqual([])
    expect(serie).toHaveLength(1)
    expect(serie[0].titolo).toBe('Shingeki no Kyojin')
    expect(serie[0].episodi.map((e) => [e.id, e.stagione, e.episodio])).toEqual([
      ['oad1', 0, 1],
      ['s1e4', 1, 4],
    ])
  })

  it('il riassunto «S01E13.5» sta fra gli speciali, anche se era stato salvato come S1E13', () => {
    const snk = { ...sp, tmdb_id: 1429, titolo: "L'attacco dei giganti" }
    const cartella = 'Shingeki no Kyojin [10bits x265]'
    const { serie } = raggruppaSerie([
      { id: 's1e13', name: 'Shingeki no Kyojin - S01E13 - Primal Desires.mp4', cartella, serie: null, voce: { ...snk, stagione: 1, episodio: 13 } },
      { id: 'mezzo', name: 'Shingeki no Kyojin - S01E13.5 - Since That Day.mp4', cartella, serie: null, voce: { ...snk, stagione: 1, episodio: 13 } },
    ])
    expect(serie[0].episodi.map((e) => [e.id, e.stagione, e.episodio])).toEqual([
      ['s1e13', 1, 13],
      ['mezzo', 0, null],
    ])
  })

  it('un episodio guardato fino in fondo conta come visto anche se non è stato spuntato', () => {
    // Finito quando ancora non si sapeva di che serie fosse: il lettore non
    // l'aveva segnato.
    const { serie } = raggruppaSerie([
      { id: 'a', name: 'South Park S03E06.mp4', cartella: 'Season 03', serie: 'South Park', voce: { ...sp, stagione: 3, episodio: 6, posizione: 1320, secondi_visti: 1300, durata: 1328 } },
      { id: 'b', name: 'South Park S03E07.mp4', cartella: 'Season 03', serie: 'South Park', voce: { ...sp, stagione: 3, episodio: 7, posizione: 30, secondi_visti: 30 } },
    ])
    expect(serie[0].episodi.map((e) => [e.id, e.visto])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  it('senza nessun episodio riconosciuto raggruppa per cartella; un episodio isolato resta a sé', () => {
    const { serie, sciolti } = raggruppaSerie([
      { id: 'x1', name: '01 Pilot.mp4', cartella: 'Season 01', serie: 'Serie Ignota' },
      { id: 'x2', name: '02 Secondo.mp4', cartella: 'Season 01', serie: 'Serie Ignota' },
      { id: 'b99', name: 'B99 S7E2.mp4', cartella: null, serie: null },
      { id: 'film', name: 'Song.of.the.Sea.2014.mp4', cartella: 'Song of the Sea (2014)', serie: null },
    ])
    expect(serie.map((s) => [s.chiave, s.titolo, s.tmdb])).toEqual([['cartella-serie ignota', 'Serie Ignota', '']])
    expect(sciolti).toEqual(['film', 'b99'])
  })
})
