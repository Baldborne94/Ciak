import { accountDrive, clientIdDrive, consensoConRedirect, driveConnesso } from './googleDrive'
import { logFailure } from './logFailure'
import { CHIAVE_RICORDA_DRIVE, CHIAVE_RINNOVO_DRIVE } from './ritornoDrive'

// Drive collegato da solo. Il permesso di Google dura un'ora e, senza un
// server che tenga un refresh token, l'unico modo di rinnovarlo è tornare da
// Google. Ma se il permesso c'è già, Google risponde subito e senza schermate
// (`prompt=none`): un attimo di pagina bianca invece di «Collega Google Drive»
// a ogni apertura dell'app.

export type Rinnovo = { quando: number; fallito?: boolean }

// Fra un tentativo e l'altro: chi va avanti e indietro fra le pagine con un
// token che Google non rinnova non deve rimbalzare su Google a ogni clic.
export const PAUSA_RINNOVO_MS = 10 * 60_000

export function deveRinnovare(s: {
  ricordato: boolean
  connesso: boolean
  online: boolean
  inRiproduzione: boolean
  ultimo: Rinnovo | null
  ora: number
}): boolean {
  if (!s.ricordato || s.connesso || !s.online) return false
  // Si lascia la pagina: mai a film in corso.
  if (s.inRiproduzione) return false
  // Una volta fallito (account cambiato, permesso tolto) si resta al pulsante.
  if (s.ultimo?.fallito) return false
  return !s.ultimo || s.ora - s.ultimo.quando >= PAUSA_RINNOVO_MS
}

function leggi<T>(storage: () => Storage, chiave: string): T | null {
  try {
    const raw = storage().getItem(chiave)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function videoInRiproduzione(): boolean {
  return [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended)
}

// Se serve e si può, parte verso Google (la pagina se ne va e torna da sola).
export function rinnovaDriveDaSolo(): boolean {
  const clientId = clientIdDrive()
  const ricorda = leggi<{ account?: string | null }>(() => localStorage, CHIAVE_RICORDA_DRIVE)
  if (
    !clientId ||
    !deveRinnovare({
      ricordato: !!ricorda,
      connesso: driveConnesso(),
      online: navigator.onLine !== false,
      inRiproduzione: videoInRiproduzione(),
      ultimo: leggi<Rinnovo>(() => sessionStorage, CHIAVE_RINNOVO_DRIVE),
      ora: Date.now(),
    })
  )
    return false
  try {
    sessionStorage.setItem(CHIAVE_RINNOVO_DRIVE, JSON.stringify({ quando: Date.now() }))
  } catch {
    // Senza sessionStorage non si saprebbe di averci già provato: meglio non
    // rischiare un giro infinito fra Ciak e Google.
    return false
  }
  void consensoConRedirect(clientId, { account: ricorda?.account ?? null })
  return true
}

// L'account con cui si è collegati, una volta per dispositivo.
let cercato = false
export async function annotaAccountDrive(): Promise<void> {
  if (cercato || !driveConnesso()) return
  const ricorda = leggi<{ account?: string | null }>(() => localStorage, CHIAVE_RICORDA_DRIVE)
  if (!ricorda || ricorda.account) return
  cercato = true
  try {
    const account = await accountDrive()
    if (account) localStorage.setItem(CHIAVE_RICORDA_DRIVE, JSON.stringify({ account }))
  } catch (e) {
    logFailure('Account Google di Drive')(e)
  }
}
