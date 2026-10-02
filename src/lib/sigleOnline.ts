import { logFailure } from './logFailure'
import { normalizzaSigle, urlTheIntroDb, type SigleEpisodio } from './theIntroDb'

// I tempi esatti di sigla e titoli di coda di un episodio, da TheIntroDB. Dove
// ci sono valgono loro, episodio per episodio; dove mancano resta il punto
// imparato per la serie (sigle.ts).
//
// Si chiedono dal browser: la protezione anti-bot di TheIntroDB respinge le
// richieste dai server di Vercel (403 con una pagina HTML di blocco), non
// quelle da una connessione di casa. /api/sigle resta come riserva, se il
// browser non può (regole CORS, rete).

export type { SigleEpisodio }

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
  let motivo: unknown
  // Senza intestazioni aggiunte: una GET «semplice» non chiede il permesso
  // preventivo (preflight) del CORS.
  try {
    const res = await fetch(urlTheIntroDb({ tmdbId, stagione, episodio }))
    // Un episodio che TheIntroDB non conosce: niente da saltare, non un errore.
    const sigle = res.status === 404 ? { inizio: null, finale: null } : res.ok ? normalizzaSigle(await res.json()) : null
    if (sigle) {
      salvaCopia(chiave, sigle)
      return sigle
    }
    motivo = new Error(`TheIntroDB ha risposto ${res.status} al browser`)
  } catch (e) {
    motivo = e
  }
  try {
    const res = await fetch(`/api/sigle?tmdb_id=${tmdbId}&season=${stagione}&episode=${episodio}`)
    if (!res.ok) throw new Error(`/api/sigle ha risposto ${res.status}`)
    const dati: unknown = await res.json()
    if (!valido(dati)) throw new Error('Risposta di /api/sigle non riconosciuta')
    salvaCopia(chiave, dati)
    return dati
  } catch (e) {
    if (!segnalato) logFailure('Tempi delle sigle da TheIntroDB')(new Error(`${String(motivo)}; riserva: ${String(e)}`))
    segnalato = true
    return null
  }
}
