// Il ritorno da Google dopo il consenso a Drive, nell'app installata.
//
// Lì il popup di Google non funziona: Android lo apre in una finestra a parte
// che, finito il consenso, non riesce a ridare il permesso all'app — si sceglie
// l'account e poi non succede niente. Nell'app installata si va quindi su
// Google con un redirect vero, e Google torna indietro con il permesso nel
// frammento dell'indirizzo (`#access_token=…&state=…`).
//
// Questo modulo va importato PER PRIMO in main.tsx, prima di Supabase: anche
// Supabase cerca `#access_token` nell'indirizzo per i suoi login, e trovando
// quello di Google proverebbe a usarlo come sessione — e fallendo farebbe
// uscire dall'account. Il frammento va letto e cancellato prima che ci guardi.
// Per lo stesso motivo qui non si usa logFailure, che caricherebbe Supabase.

export const CHIAVE_TOKEN_DRIVE = 'ciak:drive-token'
export const CHIAVE_ATTESA_DRIVE = 'ciak:drive-attesa'
export const CHIAVE_ERRORE_DRIVE = 'ciak:drive-errore'
// Lo `state` dei nostri redirect comincia così: un frammento con uno `state`
// diverso non è nostro e si lascia stare.
export const PREFISSO_STATO_DRIVE = 'ciak-drive-'
// L'unico indirizzo a cui Google rimanda: va registrato tra gli «URI di
// reindirizzamento autorizzati» del Client ID. Da lì si torna alla pagina di
// partenza, che resta in sessionStorage.
export const PERCORSO_RITORNO_DRIVE = '/streaming'

export type RispostaGoogle = { token: string; scadenza: number } | { errore: string }

export function leggiRispostaGoogle(hash: string, statoAtteso: string | null, ora: number): RispostaGoogle | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const stato = p.get('state')
  if (!stato || !stato.startsWith(PREFISSO_STATO_DRIVE)) return null
  // Uno state che non è quello partito da qui: un link forgiato, o una scheda
  // vecchia. Il token non si usa.
  if (stato !== statoAtteso) return { errore: 'Risposta di Google non riconosciuta: riprova a collegarti.' }
  const errore = p.get('error')
  if (errore) {
    return { errore: errore === 'access_denied' ? 'Accesso a Google Drive negato.' : `Google ha risposto: ${errore}` }
  }
  const token = p.get('access_token')
  if (!token) return { errore: 'Google non ha mandato il permesso: riprova a collegarti.' }
  const secondi = Number(p.get('expires_in')) || 3600
  // Margine di sicurezza sotto l'ora dichiarata, come per il popup.
  return { token, scadenza: ora + Math.max(0, secondi - 120) * 1000 }
}

// Solo percorsi di Ciak: un `//altro-sito` non è un percorso.
function percorsoSicuro(p: unknown): string {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : PERCORSO_RITORNO_DRIVE
}

export function completaRitornoDrive(): void {
  if (typeof window === 'undefined' || !window.location.hash.includes('state=')) return
  let attesa: { stato?: string; ritorno?: string } | null = null
  try {
    attesa = JSON.parse(sessionStorage.getItem(CHIAVE_ATTESA_DRIVE) ?? 'null')
  } catch {
    attesa = null // storage negato o illeggibile: la risposta risulterà non riconosciuta
  }
  const risposta = leggiRispostaGoogle(window.location.hash, attesa?.stato ?? null, Date.now())
  if (!risposta) return
  try {
    sessionStorage.removeItem(CHIAVE_ATTESA_DRIVE)
    if ('token' in risposta) {
      sessionStorage.setItem(CHIAVE_TOKEN_DRIVE, JSON.stringify({ t: risposta.token, e: risposta.scadenza }))
    } else {
      sessionStorage.setItem(CHIAVE_ERRORE_DRIVE, risposta.errore)
    }
  } catch {
    // Senza storage il token non si può tenere: la pagina proporrà di nuovo il
    // collegamento, che è il massimo che si possa fare.
  }
  // Via il token dall'indirizzo (e dalla cronologia), di nuovo alla pagina da
  // cui si era partiti, prima che il router la legga.
  window.history.replaceState(null, '', percorsoSicuro(attesa?.ritorno))
}

completaRitornoDrive()
