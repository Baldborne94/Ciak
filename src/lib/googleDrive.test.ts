import { describe, it, expect } from 'vitest'
import { idDriveValido, queryInCartelle, soloRiproducibili, titoloVideo } from './googleDrive'

describe('titoloVideo', () => {
  it('usa il nome della sottocartella, che di solito è il film', () => {
    expect(
      titoloVideo({ name: 'Song.of.the.Sea.2014.1080p.BluRay.x264.mkv', cartella: 'Song of the Sea (2014) [1080p]' }),
    ).toBe('Song of the Sea (2014) [1080p]')
  })

  it('senza sottocartella usa il nome del file senza estensione', () => {
    expect(titoloVideo({ name: 'B99 S7E2.mp4', cartella: null })).toBe('B99 S7E2')
    expect(titoloVideo({ name: 'Shogun.S01E01.mkv', cartella: null })).toBe('Shogun.S01E01')
  })

  it('non taglia un nome che non ha estensione', () => {
    expect(titoloVideo({ name: 'Film senza estensione', cartella: null })).toBe('Film senza estensione')
  })
})

describe('queryInCartelle', () => {
  it('mette le cartelle in OR e aggiunge la condizione e il cestino', () => {
    expect(queryInCartelle(['a', 'b'], "mimeType contains 'video/'")).toEqual([
      "('a' in parents or 'b' in parents) and mimeType contains 'video/' and trashed = false",
    ])
  })

  it('divide le cartelle in blocchi, per non superare la lunghezza di un URL', () => {
    const ids = Array.from({ length: 45 }, (_, i) => `c${i}`)
    const query = queryInCartelle(ids, 'x', 20)
    expect(query).toHaveLength(3)
    expect(query[2]).toBe("('c40' in parents or 'c41' in parents or 'c42' in parents or 'c43' in parents or 'c44' in parents) and x and trashed = false")
  })

  it('nessuna cartella, nessuna query', () => {
    expect(queryInCartelle([], 'x')).toEqual([])
  })
})

describe('idDriveValido', () => {
  it('accetta gli id veri di Drive', () => {
    expect(idDriveValido('1AbC_dEf-GhIjKlMnOpQrStUv')).toBe(true)
  })

  it('rifiuta ciò che potrebbe uscire dall’URL del lettore', () => {
    expect(idDriveValido('../../evil')).toBe(false)
    expect(idDriveValido('abc?x=1')).toBe(false)
    expect(idDriveValido('corto')).toBe(false)
    expect(idDriveValido('')).toBe(false)
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
})
