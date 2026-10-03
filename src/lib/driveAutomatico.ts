import { accountDrive, clientIdDrive, consensoConRedirect, driveConnesso, impostaTokenDrive, scadenzaDrive } from './googleDrive'
import { rinnovaDalServer } from './driveServer'
import { logFailure } from './logFailure'
import { CHIAVE_PROVATO_DRIVE, CHIAVE_RICORDA_DRIVE, CHIAVE_RINNOVO_DRIVE } from './ritornoDrive'

// Drive collegato da solo. Il permesso di Google dura un'ora e, senza un
// server che tenga un refresh token, l'unico modo di rinnovarlo è tornare da
// Google. Ma se il permesso c'è già, Google risponde subito e senza schermate
// (`prompt=none`): un attimo di pagina bianca invece di «Collega Google Drive»
// a ogni apertura dell'app.
//
// Anche la prima volta su un dispositivo (o dopo l'aggiornamento che ha
// introdotto tutto questo) si prova una volta senza domande: se il permesso
// era già stato dato, Google lo ridà; se no, resta il pulsante.

export type Rinnovo = { quando: number; fallito?: boolean }

// Fra un tentativo e l'altro: chi va avanti e indietro fra le pagine con un
// token che Google non rinnova non deve rimbalzare su Google a ogni clic.
export const PAUSA_RINNOVO_MS = 10 * 60_000

export function deveRinnovare(s: {
  ricordato: boolean
  // Il primo tentativo su questo dispositivo è già stato fatto (o Drive è
  // stato scollegato a mano).
  provato: boolean
  connesso: boolean
  online: boolean
  inRiproduzione: boolean
  ultimo: Rinnovo | null
  ora: number
}): boolean {
  if ((!s.ricordato && s.provato) || s.connesso || !s.online) return false
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
      provato: leggi<unknown>(() => localStorage, CHIAVE_PROVATO_DRIVE) !== null,
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
    if (!ricorda) localStorage.setItem(CHIAVE_PROVATO_DRIVE, '1')
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

// ── Dal server di Ciak ──────────────────────────────────────────────────────
// Col refresh token in mano al server (api/drive-token) il permesso si rinnova
// senza lasciare la pagina: anche a film in corso, e un po' prima che scada,
// così non scade mai davvero.

export const MARGINE_RINNOVO_SERVER_MS = 5 * 60_000
// Fra un tentativo andato a vuoto e l'altro: senza server non si insiste.
export const PAUSA_SERVER_MS = 60_000

export function deveRinnovareDalServer(s: { online: boolean; scadenza: number; ora: number; ultimoTentativo: number | null }): boolean {
  if (!s.online) return false
  if (s.scadenza - s.ora > MARGINE_RINNOVO_SERVER_MS) return false
  return s.ultimoTentativo === null || s.ora - s.ultimoTentativo >= PAUSA_SERVER_MS
}

let ultimoTentativoServer: number | null = null

// Prima il server; se non c'è, o non ha il permesso, il giro di prima.
export async function rinnovaDrive(): Promise<void> {
  const ora = Date.now()
  if (deveRinnovareDalServer({ online: navigator.onLine !== false, scadenza: scadenzaDrive(), ora, ultimoTentativo: ultimoTentativoServer })) {
    ultimoTentativoServer = ora
    const esito = await rinnovaDalServer()
    if (esito.stato === 'rinnovato') {
      impostaTokenDrive(esito.token, esito.scadenza)
      return
    }
  }
  if (!rinnovaDriveDaSolo()) void annotaAccountDrive()
}
