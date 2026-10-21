import { describe, it, expect } from 'vitest'
import { leggiRicerca, ordinaCandidati, parametriRicerca, tentativiRicerca } from './sottotitoli'

describe('leggiRicerca', () => {
  it('tiene solo i campi con una forma sensata', () => {
    expect(
      leggiRicerca({ query: '  Song of the Sea ', anno: 2014, hash: '8e245d9679d31e12', extra: 'x' }),
    ).toEqual({ query: 'Song of the Sea', anno: 2014, stagione: undefined, episodio: undefined, hash: '8e245d9679d31e12' })
  })

  it('scarta un hash o un anno malformati invece di girarli a OpenSubtitles', () => {
    const r = leggiRicerca({ query: 'Film', anno: '2014', hash: 'abc&x=1' })
    expect(r?.anno).toBeUndefined()
    expect(r?.hash).toBeUndefined()
  })

  it('senza titolo non c’è ricerca', () => {
    expect(leggiRicerca({ query: '   ' })).toBeNull()
    expect(leggiRicerca(null)).toBeNull()
  })
})

describe('parametriRicerca', () => {
  it('un film: anno, hash e lingue, in ordine alfabetico', () => {
    expect(parametriRicerca({ query: 'Song of the Sea', anno: 2014, hash: '8e245d9679d31e12' })).toBe(
      'languages=en%2Cit&moviehash=8e245d9679d31e12&query=song+of+the+sea&type=movie&year=2014',
    )
  })

  it('un episodio: stagione ed episodio, senza anno', () => {
    expect(parametriRicerca({ query: 'Shogun', anno: 2024, stagione: 1, episodio: 3 })).toBe(
      'episode_number=3&languages=en%2Cit&query=shogun&season_number=1&type=episode',
    )
  })

  it('il secondo tentativo lascia solo il titolo', () => {
    expect(parametriRicerca({ query: 'Film', anno: 2014, hash: '8e245d9679d31e12' }, { conHash: false, conAnno: false })).toBe(
      'languages=en%2Cit&query=film&type=movie',
    )
  })
})

describe('ordinaCandidati', () => {
  const r = (language: string, file_id: number, extra: Record<string, unknown> = {}) => ({
    attributes: { language, download_count: 10, files: [{ file_id, file_name: `${language}-${file_id}.srt` }], ...extra },
  })

  it('prima quelli sincronizzati sul file, poi l’italiano, poi i più scaricati', () => {
    const ordinati = ordinaCandidati([
      r('en', 1, { download_count: 900 }),
      r('it', 2, { download_count: 5 }),
      r('it', 3, { download_count: 50 }),
      r('en', 4, { moviehash_match: true }),
    ])
    expect(ordinati.map((c) => c.fileId)).toEqual([4, 3, 2, 1])
  })

  it('le traduzioni automatiche vanno in fondo alla loro lingua', () => {
    const ordinati = ordinaCandidati([r('it', 1, { machine_translated: true, download_count: 999 }), r('it', 2)])
    expect(ordinati.map((c) => c.fileId)).toEqual([2, 1])
  })

  it('scarta le lingue non chieste e i risultati senza file', () => {
    expect(ordinaCandidati([r('fr', 1), { attributes: { language: 'it', files: [] } }, {}])).toEqual([])
  })
})

describe('la ricerca per id TMDB', () => {
  // Lo speciale di L'attacco dei giganti: il nome del file («… S04P03 THE FINAL
  // CHAPTERS») non trovava niente; l'id della serie e il numero giusto sì.
  const speciale = { query: 'Shingeki no Kyojin The Final Season THE FINAL CHAPTERS', stagione: 0, episodio: 36, tmdb: 1429, hash: '8e245d9679d31e12' }

  it('un id che non è un numero sensato si scarta', () => {
    expect(leggiRicerca({ query: 'x', tmdb: 1429 })?.tmdb).toBe(1429)
    expect(leggiRicerca({ query: 'x', tmdb: '1429&x=1' })?.tmdb).toBeUndefined()
    expect(leggiRicerca({ query: 'x', tmdb: -3 })?.tmdb).toBeUndefined()
  })

  it('un episodio si cerca con l’id della serie, senza il titolo', () => {
    expect(parametriRicerca(speciale, { conTmdb: true, conHash: false })).toBe(
      'episode_number=36&languages=en%2Cit&parent_tmdb_id=1429&season_number=0&type=episode',
    )
  })

  it('un film con l’id del film, senza anno né titolo', () => {
    expect(parametriRicerca({ query: 'Song of the Sea', anno: 2014, tmdb: 110416 }, { conTmdb: true })).toBe(
      'languages=en%2Cit&tmdb_id=110416&type=movie',
    )
  })

  it('i tentativi vanno dall’id col file al solo titolo, senza ripetersi', () => {
    expect(tentativiRicerca(speciale)).toEqual([
      'episode_number=36&languages=en%2Cit&moviehash=8e245d9679d31e12&parent_tmdb_id=1429&season_number=0&type=episode',
      'episode_number=36&languages=en%2Cit&parent_tmdb_id=1429&season_number=0&type=episode',
      'episode_number=36&languages=en%2Cit&moviehash=8e245d9679d31e12&query=shingeki+no+kyojin+the+final+season+the+final+chapters&season_number=0&type=episode',
      'episode_number=36&languages=en%2Cit&query=shingeki+no+kyojin+the+final+season+the+final+chapters&season_number=0&type=episode',
    ])
    // Senza id né hash né anno, una ricerca sola.
    expect(tentativiRicerca({ query: 'Shogun', stagione: 1, episodio: 3 })).toHaveLength(1)
  })
})

