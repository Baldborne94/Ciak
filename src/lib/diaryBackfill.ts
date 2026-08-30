import type { DiaryEntry, TitleStatus, UserTitle } from './types'

// Riparazione dello storico. Per un periodo, registrare una visione nel diario
// creava la scheda del titolo SOLO se davi anche un voto: le visioni senza
// stelle finivano nel diario e basta. Quei titoli risultano visti nel diario ma
// non hanno la riga in user_titles, quindi non mostrano il badge «✓ Visto»
// sulle card e non entrano nelle statistiche.
//
// Questa è la parte che decide *cosa* va ricostruito: pura, quindi verificabile
// senza database.

export interface RecoveredTitle {
  tmdb_id: number
  media_type: string
  title: string
  poster_path: string | null
  status: TitleStatus
  personal_rating: number | null
  watched_at: string
}

const keyOf = (mediaType: string, tmdbId: number) => `${mediaType}-${tmdbId}`

// Le schede da creare a partire dal diario. Non tocca nulla di esistente: se un
// titolo ha già la sua riga, qualunque sia il suo stato, viene lasciato com'è.
export function missingTitleRows(diary: DiaryEntry[], titles: UserTitle[]): RecoveredTitle[] {
  const esistenti = new Set(titles.map((t) => keyOf(t.media_type, t.tmdb_id)))
  const perTitolo = new Map<string, DiaryEntry[]>()

  for (const e of diary) {
    if (!e.watched_on) continue
    const k = keyOf(e.media_type, e.tmdb_id)
    if (esistenti.has(k)) continue
    const gruppo = perTitolo.get(k)
    if (gruppo) gruppo.push(e)
    else perTitolo.set(k, [e])
  }

  const out: RecoveredTitle[] = []
  for (const visioni of perTitolo.values()) {
    // Dalla più recente alla più vecchia: serve sia per la data sia per il voto.
    const ordinate = [...visioni].sort((a, b) => b.watched_on.localeCompare(a.watched_on))
    const ultima = ordinate[0]
    // Stessa regola che l'app applica dal vivo (resyncUserTitleRating): vale il
    // voto della visione più recente che ne ha uno. Così una scheda ricostruita
    // è indistinguibile da una scritta al momento giusto.
    const conVoto = ordinate.find((v) => v.rating != null)

    out.push({
      tmdb_id: ultima.tmdb_id,
      media_type: ultima.media_type,
      title: ultima.title,
      poster_path: ultima.poster_path,
      status: 'watched',
      personal_rating: conVoto?.rating ?? null,
      watched_at: ultima.watched_on,
    })
  }

  return out
}
