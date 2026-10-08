import { supabase } from './supabase'
import { mapLimit } from './mapLimit'
import { fetchAllRows } from './paged'
import { logFailure } from './logFailure'
import { dimenticaCollezione } from './memoriaCollezione'
import { fetchTitoloEPoster, isReadableTitle } from './tmdb'
import type { MediaType, TmdbType } from './types'

// I titoli salvati prima che Ciak scegliesse l'italiano: «The Godfather» nel
// diario accanto a «L'attacco dei giganti». Si riscrivono una volta, nelle
// tabelle che il titolo se lo tengono (collezione, diario, liste).
// Il segno sul dispositivo che il lavoro è fatto, per persona.
export const segnoTitoliItaliani = (userId: string) => `ciak:titoli-italiani-v1:${userId}`

export const TABELLE_CON_TITOLO = ['user_titles', 'user_diary', 'user_list_items'] as const

export interface RigaConTitolo {
  tmdb_id: number
  media_type: MediaType
  title: string
  poster_path: string | null
}

// I tipi di TMDB da provare per una riga. Un anime o un cartone può essere un
// film o una serie, e gli id sono unici solo dentro un tipo: si provano tutti e
// due e vale quello con la stessa locandina salvata.
export function tipiDaProvare(mediaType: MediaType): TmdbType[] {
  if (mediaType === 'movie') return ['movie']
  if (mediaType === 'tv') return ['tv']
  return ['movie', 'tv']
}

const chiave = (r: Pick<RigaConTitolo, 'tmdb_id' | 'media_type'>) => `${r.media_type}-${r.tmdb_id}`

// Il titolo italiano di ogni titolo distinto (chiave `${media_type}-${id}`).
// Per un tipo ambiguo serve la locandina uguale; se nessuno dei due combacia,
// o TMDB non sa dirlo, il titolo non entra e la riga resta com'è.
export async function titoliDaRiscrivere(
  righe: RigaConTitolo[],
  chiedi: (tipo: TmdbType, id: number) => Promise<{ titolo: string; posterPath: string | null }>,
): Promise<{ titoli: Map<string, string>; falliti: number }> {
  const distinti = new Map(righe.map((r) => [chiave(r), r]))
  const titoli = new Map<string, string>()
  let falliti = 0
  await mapLimit([...distinti], 6, async ([k, r]) => {
    const tipi = tipiDaProvare(r.media_type)
    for (const tipo of tipi) {
      try {
        const { titolo, posterPath } = await chiedi(tipo, r.tmdb_id)
        if (tipi.length > 1 && (!r.poster_path || posterPath !== r.poster_path)) continue
        if (isReadableTitle(titolo)) titoli.set(k, titolo)
        return
      } catch {
        // Un tipo sbagliato per un anime torna 404: non è un fallimento finché
        // resta l'altro da provare.
        if (tipi.length === 1) falliti++
      }
    }
  })
  return { titoli, falliti }
}

// Riscrive in italiano i titoli salvati. Una richiesta a TMDB per titolo
// distinto, un aggiornamento per titolo e tabella (non per riga). Torna quante
// righe ha cambiato.
export async function uniformaTitoli(userId: string): Promise<number> {
  if (!supabase) return 0
  const db = supabase
  const perTabella = await Promise.all(
    TABELLE_CON_TITOLO.map((tabella) =>
      fetchAllRows<RigaConTitolo>((da, a) =>
        db.from(tabella).select('tmdb_id, media_type, title, poster_path').eq('user_id', userId).range(da, a),
      ),
    ),
  )
  const { titoli, falliti: nonLetti } = await titoliDaRiscrivere(perTabella.flat(), fetchTitoloEPoster)

  let cambiate = 0
  let nonScritti = 0
  await Promise.all(
    TABELLE_CON_TITOLO.map(async (tabella, i) => {
      // Un aggiornamento per titolo distinto da cambiare in questa tabella;
      // si contano le righe che tocca, per dirlo all'utente.
      const daCambiare = new Map<string, { riga: RigaConTitolo; quante: number }>()
      for (const r of perTabella[i]) {
        const nuovo = titoli.get(chiave(r))
        if (!nuovo || nuovo === r.title) continue
        const prima = daCambiare.get(chiave(r))
        daCambiare.set(chiave(r), { riga: r, quante: (prima?.quante ?? 0) + 1 })
      }
      await mapLimit([...daCambiare.values()], 6, async ({ riga, quante }) => {
        const { error } = await db
          .from(tabella)
          .update({ title: titoli.get(chiave(riga)) })
          .eq('user_id', userId)
          .eq('tmdb_id', riga.tmdb_id)
          .eq('media_type', riga.media_type)
        if (error) nonScritti++
        else cambiate += quante
      })
    }),
  )
  dimenticaCollezione()
  // Una riga sola col totale, non una per titolo.
  if (nonLetti > 0) logFailure('Titoli in italiano')(new Error(`${nonLetti} titoli su ${titoli.size + nonLetti} non letti da TMDB`))
  if (nonScritti > 0) logFailure('Titoli in italiano')(new Error(`${nonScritti} titoli non riscritti`))
  return cambiate
}
