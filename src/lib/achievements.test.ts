import { describe, it, expect } from 'vitest'
import {
  computeAchievementData,
  getEarnedIds,
  ACHIEVEMENTS,
} from './achievements'

type TitleRow = Parameters<typeof computeAchievementData>[0][number]

function row(over: Partial<TitleRow> = {}): TitleRow {
  return {
    status: 'watched',
    is_favorite: false,
    personal_rating: null,
    notes: null,
    genre_ids: [],
    ...over,
  }
}

const HORROR = 27
const ACTION = 28

describe('computeAchievementData', () => {
  it('conta solo i visti per i generi, non gli altri stati', () => {
    const data = computeAchievementData([
      row({ status: 'watched', genre_ids: [HORROR] }),
      row({ status: 'to_watch', genre_ids: [HORROR] }), // non deve contare
      row({ status: 'watched', genre_ids: [HORROR, ACTION] }),
    ])
    expect(data.totalWatched).toBe(2)
    expect(data.genreCounts[HORROR]).toBe(2)
    expect(data.genreCounts[ACTION]).toBe(1)
  })

  it('aggrega preferiti, voti, 5 stelle, note e in corso', () => {
    const data = computeAchievementData([
      row({ is_favorite: true, personal_rating: 5, notes: 'top' }),
      row({ personal_rating: 4 }),
      row({ status: 'in_progress' }),
      row({ notes: '   ' }), // note vuote non contano
    ])
    expect(data.totalFavorites).toBe(1)
    expect(data.totalRatings).toBe(2)
    expect(data.fiveStarCount).toBe(1)
    expect(data.withNotes).toBe(1)
    expect(data.inProgress).toBe(1)
  })
})

describe('getEarnedIds', () => {
  it('non assegna nulla con dati vuoti', () => {
    const earned = getEarnedIds(computeAchievementData([]))
    expect(earned).toEqual([])
  })

  it('sblocca il primo visto e la milestone dei 10', () => {
    const titles = Array.from({ length: 10 }, () => row({ genre_ids: [] }))
    const earned = getEarnedIds(computeAchievementData(titles))
    expect(earned).toContain('first_watch')
    expect(earned).toContain('ten_watched')
    expect(earned).not.toContain('twentyfive_watched')
  })

  it('somma generi correlati per i trofei combinati (crime + mystery)', () => {
    const titles = [
      ...Array(3).fill(null).map(() => row({ genre_ids: [80] })), // crime
      ...Array(2).fill(null).map(() => row({ genre_ids: [9648] })), // mystery
    ]
    const earned = getEarnedIds(computeAchievementData(titles))
    expect(earned).toContain('crime_fan')
  })
})

describe('definizioni dei trofei', () => {
  it('hanno id univoci e campi obbligatori', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of ACHIEVEMENTS) {
      expect(a.title).toBeTruthy()
      expect(typeof a.check).toBe('function')
      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(a.rarity)
    }
  })
})
