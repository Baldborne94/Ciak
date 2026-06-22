import { describe, it, expect } from 'vitest'
import {
  analyzeTaste,
  buildIdentity,
  personaById,
  avatarDataUrl,
  CALIBRATING,
  PERSONAS,
  type TasteInput,
} from './cinephileIdentity'

// Generi TMDB usati nei test (gli stessi del modulo).
const HORROR = 27
const THRILLER = 53
const SCIFI = 878
const ACTION = 28

function watched(genre_ids: number[], extra: Partial<TasteInput> = {}): TasteInput {
  return { status: 'watched', is_favorite: false, personal_rating: null, genre_ids, ...extra }
}

describe('analyzeTaste', () => {
  it('va in calibrazione con meno di 3 titoli visti', () => {
    const res = analyzeTaste([watched([HORROR]), watched([HORROR])])
    expect(res.persona).toBe(CALIBRATING)
    expect(res.rankedPersonas).toEqual([])
  })

  it('va in calibrazione se non c\'è alcun genere con punteggio', () => {
    const res = analyzeTaste([watched([]), watched([]), watched([])])
    expect(res.persona).toBe(CALIBRATING)
  })

  it('individua la persona dominante dal genere più visto', () => {
    const res = analyzeTaste([
      watched([HORROR]),
      watched([HORROR, THRILLER]),
      watched([HORROR]),
      watched([SCIFI]),
    ])
    expect(res.persona.id).toBe('horror')
    expect(res.watchedCount).toBe(4)
  })

  it('pesa di più preferiti e voti alti', () => {
    // Un solo sci-fi ma preferito + 5 stelle (peso 3) batte due horror semplici.
    const res = analyzeTaste([
      watched([HORROR]),
      watched([HORROR]),
      watched([SCIFI], { is_favorite: true, personal_rating: 5 }),
    ])
    expect(res.persona.id).toBe('scifi')
  })

  it('include un preferito non ancora visto nel punteggio ma non nel conteggio visti', () => {
    const res = analyzeTaste([
      watched([ACTION]),
      watched([ACTION]),
      watched([ACTION]),
      { status: 'to_watch', is_favorite: true, personal_rating: null, genre_ids: [SCIFI] },
    ])
    expect(res.watchedCount).toBe(3)
    expect(res.rankedPersonas.map((p) => p.id)).toContain('scifi')
  })

  it('ordina le persone affini per punteggio decrescente', () => {
    const res = analyzeTaste([
      watched([ACTION]),
      watched([ACTION]),
      watched([ACTION]),
      watched([SCIFI]),
      watched([SCIFI]),
      watched([HORROR]),
    ])
    expect(res.rankedPersonas[0].id).toBe('action')
    expect(res.rankedPersonas[1].id).toBe('scifi')
    // tutte le persone elencate sono distinte
    const ids = res.rankedPersonas.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('buildIdentity', () => {
  const horror = personaById('horror')!

  it('è deterministico: stessa variante → stesso nickname e icona', () => {
    expect(buildIdentity(horror, 0)).toEqual(buildIdentity(horror, 0))
  })

  it('cicla sul pool con il modulo e gestisce le varianti negative', () => {
    const len = horror.nicknames.length
    expect(buildIdentity(horror, len).nickname).toBe(buildIdentity(horror, 0).nickname)
    expect(buildIdentity(horror, -1).nickname).toBe(buildIdentity(horror, len - 1).nickname)
  })

  it('produce sempre nickname e avatar appartenenti alla persona', () => {
    const id = buildIdentity(horror, 3)
    expect(horror.nicknames).toContain(id.nickname)
    expect(horror.avatars).toContain(id.emoji)
    expect(id.personaId).toBe('horror')
    expect(id.avatarUrl.startsWith('data:image/svg+xml,')).toBe(true)
  })
})

describe('personaById', () => {
  it('risolve gli id noti, calibrating compreso', () => {
    expect(personaById('scifi')?.id).toBe('scifi')
    expect(personaById('calibrating')).toBe(CALIBRATING)
  })

  it('ritorna null per id assenti o vuoti', () => {
    expect(personaById('boh')).toBeNull()
    expect(personaById(null)).toBeNull()
    expect(personaById(undefined)).toBeNull()
  })
})

describe('avatarDataUrl', () => {
  it('genera un SVG data URL con icona e colori', () => {
    const url = avatarDataUrl('👻', ['#000000', '#ffffff'])
    expect(url.startsWith('data:image/svg+xml,')).toBe(true)
    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('👻')
    expect(decoded).toContain('#000000')
  })
})

describe('coerenza dei dati delle persone', () => {
  it('ogni persona ha id univoco, tema, colori e pool non vuoti', () => {
    const ids = PERSONAS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PERSONAS) {
      expect(p.nicknames.length).toBeGreaterThan(0)
      expect(p.avatars.length).toBeGreaterThan(0)
      expect(p.genres.length).toBeGreaterThan(0)
      expect(p.colors).toHaveLength(2)
    }
  })
})
