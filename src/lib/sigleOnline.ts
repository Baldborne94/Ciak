import { logFailure } from './logFailure'

// I tempi esatti di sigla e titoli di coda di un episodio, da TheIntroDB (via
// /api/sigle). Dove ci sono valgono loro, episodio per episodio; dove mancano
// resta il punto imparato per la serie (sigle.ts).

export interface SigleEpisodio {
  inizio: { da: number; a: number } | null
  finale: { da: number } | null
}

const CHIAVE = 'ciak:sigle-online:'
// Un episodio che TheIntroDB non conosce si richiede dopo una settimana: chi
// guarda può aggiungerlo nel frattempo. Uno trovato non cambia più.
const RIPROVA_VUOTO_MS = 7 * 24 * 3600_000

const valido = (v: unknown): v is SigleEpisodio => {
  if (!v || typeof v !== 'object') return false
  const { inizio, finale } = v as Record<string, unknown>
  const inizioOk =
    inizio === null ||
    (!!inizio && typeof (inizio as { da?: unknown }).da === 'number' && typeof (inizio as { a?: unknown }).a === 'number')
  const finaleOk = finale === null || (!!finale && typeof (finale as { da?: unknown }).da === 'number')
  return inizioOk && finaleOk
}

function leggiCopia(chiave: string): SigleEpisodio | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE + chiave) ?? 'null') as { sigle?: unknown; quando?: unknown } | null
    if (!v || !valido(v.sigle) || typeof v.quando !== 'number') return undefined
    const vuoto = !v.sigle.inizio && !v.sigle.finale
    return vuoto && Date.now() - v.quando > RIPROVA_VUOTO_MS ? undefined : v.sigle
  } catch {
    return undefined
  }
}

function salvaCopia(chiave: string, sigle: SigleEpisodio): void {
  try {
    localStorage.setItem(CHIAVE + chiave, JSON.stringify({ sigle, quando: Date.now() }))
  } catch {
    /* storage pieno o negato: si richiederà la prossima volta */
  }
}

// Una sola segnalazione per sessione: se TheIntroDB non risponde, non risponde
// per tutti gli episodi di fila.
let segnalato = false

export async function sigleEpisodio(tmdbId: number, stagione: number, episodio: number): Promise<SigleEpisodio | null> {
  const chiave = `tv-${tmdbId}-${stagione}-${episodio}`
  const copia = leggiCopia(chiave)
  if (copia) return copia
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  try {
    const res = await fetch(`/api/sigle?tmdb_id=${tmdbId}&season=${stagione}&episode=${episodio}`)
    if (!res.ok) throw new Error(`/api/sigle ha risposto ${res.status}`)
    const dati: unknown = await res.json()
    if (!valido(dati)) throw new Error('Risposta di /api/sigle non riconosciuta')
    salvaCopia(chiave, dati)
    return dati
  } catch (e) {
    if (!segnalato) logFailure('Tempi delle sigle da TheIntroDB')(e)
    segnalato = true
    return null
  }
}
