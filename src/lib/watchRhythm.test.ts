import { describe, it, expect } from 'vitest'
import { computeWatchRhythm } from './watchRhythm'

// Data fissa: 15 giugno 2026. Iniettarla rende i test indipendenti dal giorno
// in cui girano.
const OGGI = new Date('2026-06-15T12:00:00Z')
const v = (watched_on: string | null) => ({ watched_on })

describe('computeWatchRhythm', () => {
  it('conta le visioni nel mese giusto dell anno in corso', () => {
    const r = computeWatchRhythm([v('2026-03-02'), v('2026-03-20'), v('2026-06-01')], OGGI)
    expect(r.perMonth[2].count).toBe(2) // marzo
    expect(r.perMonth[5].count).toBe(1) // giugno
    expect(r.thisYear).toBe(3)
  })

  it('restituisce sempre dodici mesi, anche quelli vuoti', () => {
    // I mesi a zero raccontano quanto quelli pieni: senza, il grafico mentirebbe.
    const r = computeWatchRhythm([v('2026-03-02')], OGGI)
    expect(r.perMonth).toHaveLength(12)
    expect(r.perMonth.filter((m) => m.count === 0)).toHaveLength(11)
  })

  it('tiene separato l anno scorso da quello in corso', () => {
    const r = computeWatchRhythm([v('2026-01-10'), v('2025-01-10'), v('2025-08-02')], OGGI)
    expect(r.thisYear).toBe(1)
    expect(r.lastYear).toBe(2)
  })

  it('ignora gli anni più vecchi nel confronto', () => {
    const r = computeWatchRhythm([v('2019-05-05')], OGGI)
    expect(r.thisYear).toBe(0)
    expect(r.lastYear).toBe(0)
  })

  it('indica il mese più intenso dell anno in corso', () => {
    const r = computeWatchRhythm(
      [v('2026-02-01'), v('2026-04-01'), v('2026-04-02'), v('2026-04-03')],
      OGGI,
    )
    expect(r.busiest).toEqual({ month: 4, count: 3 })
  })

  it('non indica un mese più intenso se non hai guardato niente quest anno', () => {
    expect(computeWatchRhythm([v('2025-04-01')], OGGI).busiest).toBeNull()
  })

  it('conta i giorni consecutivi fino a oggi', () => {
    const r = computeWatchRhythm([v('2026-06-15'), v('2026-06-14'), v('2026-06-13')], OGGI)
    expect(r.currentStreakDays).toBe(3)
  })

  it('non spezza la serie solo perché oggi non hai ancora guardato niente', () => {
    // Alle 9 del mattino la serie di ieri è ancora viva.
    const r = computeWatchRhythm([v('2026-06-14'), v('2026-06-13')], OGGI)
    expect(r.currentStreakDays).toBe(2)
  })

  it('la serie si interrompe con un giorno saltato', () => {
    const r = computeWatchRhythm([v('2026-06-15'), v('2026-06-12'), v('2026-06-11')], OGGI)
    expect(r.currentStreakDays).toBe(1)
  })

  it('più visioni nello stesso giorno valgono un giorno solo', () => {
    const r = computeWatchRhythm([v('2026-06-15'), v('2026-06-15'), v('2026-06-14')], OGGI)
    expect(r.currentStreakDays).toBe(2)
  })

  it('regge righe senza data e date malformate', () => {
    const r = computeWatchRhythm([v(null), v(''), v('non-una-data'), v('2026-06-15')], OGGI)
    expect(r.thisYear).toBe(1)
    expect(r.currentStreakDays).toBe(1)
  })

  it('su un diario vuoto non inventa niente', () => {
    const r = computeWatchRhythm([], OGGI)
    expect(r).toMatchObject({ thisYear: 0, lastYear: 0, busiest: null, currentStreakDays: 0 })
  })
})
