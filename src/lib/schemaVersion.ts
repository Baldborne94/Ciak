import { supabase } from './supabase'
import { logFailure } from './logFailure'

// Il database di Ciak si aggiorna eseguendo a mano i file di `supabase/`. Il
// codice, invece, si aggiorna da solo a ogni deploy. Quando i due si separano —
// codice nuovo, schema vecchio — l'app non se ne accorge: prova a scrivere su
// una tabella che non esiste e restituisce un errore che non spiega niente.
//
// Qui leggiamo la versione applicata (tabella `schema_version`) e la
// confrontiamo con quella che questo codice si aspetta.

// Alzalo insieme a ogni nuovo file supabase/schema_vN_*.sql.
export const SCHEMA_RICHIESTO = 17

export type EsitoSchema =
  | { stato: 'ok'; versione: number }
  // Il registro c'è ma si ferma prima: mancano uno o più file SQL.
  | { stato: 'vecchio'; versione: number }
  // Nemmeno il registro esiste: lo schema è anteriore alla v16.
  | { stato: 'assente' }

// PostgREST segnala così una tabella che non esiste: `42P01` è il codice
// Postgres, `PGRST205` è quello che arriva quando manca dalla cache dello
// schema. Sono gli unici errori che ci autorizzano a dire «il registro non
// c'è»: tutto il resto (rete, permessi, server giù) è un'altra storia.
const TABELLA_ASSENTE = new Set(['42P01', 'PGRST205'])

interface ErroreLettura {
  code?: string
  message?: string
}

// Il cuore della decisione, separato dalla rete perché è dove si sbaglia.
// Torna `null` quando non c'è niente di sensato da dire all'utente: meglio
// tacere che spaventarlo per un errore di rete.
export function valutaSchema(
  versioneTrovata: number | null,
  errore: ErroreLettura | null,
  richiesto: number = SCHEMA_RICHIESTO,
): EsitoSchema | null {
  if (errore) {
    if (errore.code && TABELLA_ASSENTE.has(errore.code)) return { stato: 'assente' }
    // Un errore che non sappiamo interpretare non diventa un allarme: un blip
    // di rete non è un database da aggiornare.
    return null
  }
  if (versioneTrovata === null) return { stato: 'assente' }
  if (versioneTrovata >= richiesto) return { stato: 'ok', versione: versioneTrovata }
  return { stato: 'vecchio', versione: versioneTrovata }
}

// Il testo mostrato all'utente. Sta qui, e non nel componente, perché è la
// parte che vogliamo poter verificare senza aprire un browser.
export function messaggioSchema(esito: EsitoSchema, richiesto: number = SCHEMA_RICHIESTO): string {
  const coda =
    'Alcune funzioni recenti potrebbero non salvare finché non esegui i file SQL mancanti di supabase/.'
  if (esito.stato === 'assente') {
    return `Il database sembra più vecchio del codice (versione dello schema sconosciuta, serve la ${richiesto}). ${coda}`
  }
  return `Il database è indietro rispetto all'app: schema v${esito.versione}, ne serve almeno v${richiesto}. ${coda}`
}

// Legge la versione più alta registrata. `null` significa "non pronunciarsi".
export async function leggiSchema(): Promise<EsitoSchema | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('schema_version')
      .select('version')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    const versione = (data as { version: number } | null)?.version ?? null
    return valutaSchema(versione, error)
  } catch (e) {
    logFailure('lettura della versione dello schema')(e)
    return null
  }
}
