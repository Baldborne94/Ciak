import type { DiaryEntry } from './types'

export interface Flashback {
  entry: DiaryEntry
  yearsAgo: number
}

// Le visioni registrate in questo stesso giorno (MM-GG) di un anno passato: il
// ricordo «Un anno fa guardavi…» della home. Ordinate dal ricordo più lontano,
// che è quello che sorprende di più.
//
// `today` è iniettabile perché la funzione dipende dalla data odierna: senza,
// un test sarebbe verde o rosso a seconda del giorno in cui lo si esegue.
export function onThisDayFlashbacks(diary: DiaryEntry[], today = new Date()): Flashback[] {
  const md = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const currentYear = today.getFullYear()
  // Chiave composta: un film e una serie possono condividere lo stesso id
  // TMDB, e deduplicando per solo numero uno dei due sparirebbe dai ricordi.
  const seen = new Set<string>()
  const out: Flashback[] = []

  for (const e of diary) {
    if (!e.watched_on || e.watched_on.slice(5, 10) !== md) continue
    const yearsAgo = currentYear - Number(e.watched_on.slice(0, 4))
    if (yearsAgo < 1) continue // solo anni passati: oggi non è un ricordo
    const key = `${e.media_type}-${e.tmdb_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ entry: e, yearsAgo })
  }

  return out.sort((a, b) => b.yearsAgo - a.yearsAgo)
}
