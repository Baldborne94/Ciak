import { describe, it, expect } from 'vitest'
import { videoDaPercorsi } from './cartellaLocale'
import { idLocale } from './filmLocali'
import { titoloVideo } from './googleDrive'

// La cartella del PC letta come la videoteca di Drive: scheda, serie,
// stagione, e lo stesso id che si avrebbe aprendo il file a mano.

describe('videoDaPercorsi', () => {
  it('scheda, serie e stagione dalle cartelle, come su Drive', () => {
    const [ep] = videoDaPercorsi([{ percorso: ['SERIE TV', 'South Park', 'Season 26', 'South Park S26E06.mp4'], dimensione: 350_000_000 }])
    expect(ep).toMatchObject({
      name: 'South Park S26E06.mp4',
      categoria: 'SERIE TV',
      cartella: 'Season 26',
      serie: 'South Park',
      size: 350_000_000,
    })
    expect(titoloVideo(ep)).toBe('South Park · S26E6')
  })

  it('l’id è quello del file aperto a mano: titolo, diario e ripresa coincidono', () => {
    const [film] = videoDaPercorsi([{ percorso: ['FILM', 'Paprika (2006)', 'Paprika.2006.mp4'], dimensione: 123 }])
    expect(film.id).toBe(idLocale({ name: 'Paprika.2006.mp4', size: 123 }))
    expect(film).toMatchObject({ categoria: 'FILM', cartella: 'Paprika (2006)', serie: null })
  })

  it('un film direttamente nella scheda, o un file sciolto nella cartella scelta', () => {
    const [nellaScheda, sciolto] = videoDaPercorsi([
      { percorso: ['FILM', 'Memories.1995.mp4'], dimensione: 1 },
      { percorso: ['Trinita.mp4'], dimensione: 2 },
    ])
    expect(nellaScheda).toMatchObject({ categoria: 'FILM', cartella: null })
    expect(sciolto).toMatchObject({ categoria: null, cartella: null })
  })

  it('scelta la cartella sopra «Ciak» (E:\\), si scende in Ciak da soli', () => {
    const [ep] = videoDaPercorsi([{ percorso: ['Ciak', 'ANIME', 'Shingeki no Kyojin', 'Season 1', 'S01E01.mp4'], dimensione: 5 }])
    expect(ep).toMatchObject({ categoria: 'ANIME', cartella: 'Season 1', serie: 'Shingeki no Kyojin' })
  })

  it('solo i video: sottotitoli, script e altri file non diventano titoli', () => {
    const video = videoDaPercorsi([
      { percorso: ['FILM', 'Film.mp4'], dimensione: 1 },
      { percorso: ['FILM', 'Film.it.srt'], dimensione: 1 },
      { percorso: ['sposta-su-disco.bat'], dimensione: 1 },
    ])
    expect(video.map((v) => v.name)).toEqual(['Film.mp4'])
  })

  it('la data del file, per «Aggiunti di recente»', () => {
    const [v] = videoDaPercorsi([{ percorso: ['FILM', 'Film.mp4'], dimensione: 1, modificato: Date.UTC(2026, 9, 14) }])
    expect(v.aggiunto).toBe('2026-10-14T00:00:00.000Z')
  })
})
