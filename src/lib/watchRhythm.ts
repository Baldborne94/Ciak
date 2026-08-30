// Il diario sa *quando* hai guardato, ma finora quel dato serviva solo a
// raggruppare le visioni per data. È l'informazione più personale che l'app
// possiede: quanto guardi in un mese, in quale periodo dell'anno ti concedi di
// più, se stai andando più o meno dell'anno scorso.
//
// Logica pura: la data di riferimento è iniettabile, altrimenti i test
// sarebbero verdi solo nel mese in cui li scrivi.

export interface MonthBucket {
  month: number // 1 = gennaio
  count: number
}

export interface WatchRhythm {
  perMonth: MonthBucket[] // sempre 12 voci, anche a zero: il vuoto racconta
  thisYear: number
  lastYear: number
  busiest: MonthBucket | null // il mese più intenso dell'anno in corso
  currentStreakDays: number // giorni consecutivi con almeno una visione
}

export const MONTH_LABELS = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
]

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export function computeWatchRhythm(
  entries: { watched_on: string | null }[],
  today = new Date(),
): WatchRhythm {
  const currentYear = today.getFullYear()
  const perMonth: MonthBucket[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: 0,
  }))
  let thisYear = 0
  let lastYear = 0
  const giorni = new Set<string>()

  for (const e of entries) {
    if (!e.watched_on) continue
    const year = Number(e.watched_on.slice(0, 4))
    const month = Number(e.watched_on.slice(5, 7))
    if (!year || !month || month < 1 || month > 12) continue

    giorni.add(e.watched_on.slice(0, 10))
    if (year === currentYear) {
      thisYear++
      perMonth[month - 1].count++
    } else if (year === currentYear - 1) {
      lastYear++
    }
  }

  const busiest = perMonth.reduce<MonthBucket | null>(
    (best, m) => (m.count > 0 && (!best || m.count > best.count) ? m : best),
    null,
  )

  return { perMonth, thisYear, lastYear, busiest, currentStreakDays: streak(giorni, today) }
}

// Giorni consecutivi con almeno una visione, contando all'indietro da oggi.
// Se oggi non hai ancora guardato niente si parte da ieri: la serie non si
// spezza solo perché è mattina.
function streak(giorni: Set<string>, today: Date): number {
  const cursore = new Date(today)
  if (!giorni.has(isoDay(cursore))) cursore.setDate(cursore.getDate() - 1)

  let n = 0
  while (giorni.has(isoDay(cursore))) {
    n++
    cursore.setDate(cursore.getDate() - 1)
  }
  return n
}
