import { describe, it, expect } from 'vitest'
import { senzaGeneri } from './userTitles'

// Distinguere «nessun genere» da «campo assente» è ciò che decide se un titolo
// verrà riletto da TMDB o lasciato indietro per sempre.

describe('senzaGeneri', () => {
  it('prende le righe con l array vuoto', () => {
    expect(senzaGeneri([{ id: 'a', genre_ids: [] }])).toHaveLength(1)
  })

  it('prende anche quelle in cui il campo manca del tutto', () => {
    // Righe salvate prima che la colonna esistesse: arrivano come null o
    // undefined, e sono proprio quelle da recuperare.
    expect(senzaGeneri([{ id: 'a', genre_ids: null }])).toHaveLength(1)
    expect(senzaGeneri([{ id: 'b' } as { id: string; genre_ids?: number[] }])).toHaveLength(1)
  })

  it('lascia stare quelle già a posto', () => {
    expect(senzaGeneri([{ id: 'a', genre_ids: [27] }])).toHaveLength(0)
  })

  it('su un elenco misto tiene solo quelle da fare, nell ordine ricevuto', () => {
    const righe = [
      { id: 'ok', genre_ids: [27] },
      { id: 'vuoto', genre_ids: [] },
      { id: 'assente', genre_ids: null },
      { id: 'ok2', genre_ids: [18, 35] },
    ]
    expect(senzaGeneri(righe).map((r) => r.id)).toEqual(['vuoto', 'assente'])
  })
})
