import { supabase } from './supabase'
import { fetchAllRows } from './paged'
import { leggiSchema } from './schemaVersion'

// Voti, diario, liste: è l'unica parte di Ciak che non si può ricostruire da
// TMDB. Finora viveva solo dentro un progetto Supabase — e i progetti gratuiti
// vengono sospesi per inattività. Da qui si porta via tutto in un file.

export type Riga = Record<string, unknown>

// Le tabelle che contengono davvero *i tuoi dati*, quelle che perderle fa male.
// Ordine pensato per chi apre il file: prima la collezione, poi ciò che le sta
// intorno.
export const TABELLE_ESPORTATE = [
  'user_titles',
  'user_diary',
  'user_lists',
  'user_list_items',
  'user_episodes',
  'user_entities',
  'user_alerts',
  'user_trailers',
  'user_preferences',
] as const

// Volutamente fuori: `user_song_cache` e `ai_usage` sono cache e contatori
// (si ricostruiscono da soli), `push_subscriptions` vale solo per il browser
// che l'ha creata e altrove è spazzatura. Un backup che contiene tutto è un
// backup che nessuno legge.

export interface EsportazioneCiak {
  formato: 'ciak-export'
  versione: 1
  esportatoIl: string
  schema: number | null
  utente: { id: string; email: string | null }
  righeTotali: number
  // Le tabelle che non si è riusciti a leggere, con il perché. Un backup
  // parziale che si spaccia per completo è peggio di nessun backup: se manca
  // qualcosa deve essere scritto nel file stesso, non solo a schermo.
  problemi: { tabella: string; errore: string }[]
  tabelle: Record<string, Riga[]>
}

export function costruisciEsportazione(
  utente: { id: string; email: string | null },
  tabelle: Record<string, Riga[]>,
  problemi: { tabella: string; errore: string }[],
  schema: number | null,
  quando: Date = new Date(),
): EsportazioneCiak {
  return {
    formato: 'ciak-export',
    versione: 1,
    esportatoIl: quando.toISOString(),
    schema,
    utente,
    righeTotali: Object.values(tabelle).reduce((n, righe) => n + righe.length, 0),
    problemi,
    tabelle,
  }
}

// ciak-backup-2026-08-30.json: la data in testa tiene i file in ordine da soli
// nella cartella Download.
export function nomeFileEsportazione(quando: Date = new Date()): string {
  return `ciak-backup-${quando.toISOString().slice(0, 10)}.json`
}

// Riassunto per l'utente, che non deve aprire il JSON per sapere com'è andata.
export function riassuntoEsportazione(dati: EsportazioneCiak): string {
  const n = dati.righeTotali
  const t = Object.keys(dati.tabelle).length
  const base = `${n} ${n === 1 ? 'riga' : 'righe'} da ${t} ${t === 1 ? 'tabella' : 'tabelle'}.`
  if (dati.problemi.length === 0) return base
  return `${base} Non lette: ${dati.problemi.map((p) => p.tabella).join(', ')}.`
}

function client() {
  if (!supabase) throw new Error('Supabase non è configurato.')
  return supabase
}

// Legge tutto ciò che appartiene all'utente. Una tabella che non si riesce a
// leggere (schema più vecchio del codice, per dire) non fa fallire l'intero
// backup: finisce in `problemi`, perché avere nove tabelle su dieci è meglio
// che non avere niente — purché sia scritto quale manca.
export async function esportaTutto(
  utente: { id: string; email: string | null },
  quando: Date = new Date(),
): Promise<EsportazioneCiak> {
  const tabelle: Record<string, Riga[]> = {}
  const problemi: { tabella: string; errore: string }[] = []

  for (const tabella of TABELLE_ESPORTATE) {
    try {
      tabelle[tabella] = await fetchAllRows<Riga>((from, to) =>
        client()
          .from(tabella)
          .select('*')
          .eq('user_id', utente.id)
          // Ordine stabile: due backup dello stesso archivio devono somigliarsi,
          // altrimenti confrontarli è impossibile.
          .order('created_at', { ascending: true })
          .range(from, to),
      )
    } catch (e) {
      problemi.push({ tabella, errore: (e as Error).message })
    }
  }

  const esito = await leggiSchema()
  const schema = esito && esito.stato !== 'assente' ? esito.versione : null
  return costruisciEsportazione(utente, tabelle, problemi, schema, quando)
}
