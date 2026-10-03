import { createHmac, timingSafeEqual } from 'node:crypto'

// Il collegamento a Drive che non scade, lato server (api/drive.ts). Qui le
// parti pure: lo `state` firmato che accompagna il giro da Google e torna,
// l'indirizzo del consenso, l'origine della richiesta. Stanno in src/lib
// perché le funzioni serverless di Vercel includono i moduli importati da
// qui (vedi api/sigle.ts), e così si provano con Vitest.
//
// Il permesso di Google dura un'ora. Il browser da solo può solo tornare da
// Google a chiederne un altro (un redirect, con tutto quello che può andare
// storto: più account, sessioni scadute, pagina bianca). Con un «refresh
// token», che Google dà solo a un server con il client secret, il server di
// Ciak rinnova il permesso quando vuole, senza che si veda niente.

export const SCOPE_DRIVE = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'].join(' ')
export const PERCORSO_CALLBACK = '/api/drive-callback'
export const ENDPOINT_TOKEN_GOOGLE = 'https://oauth2.googleapis.com/token'
// Quanto può durare il giro da Google: più di così è una richiesta vecchia.
export const DURATA_STATO_MS = 10 * 60_000

// Cosa viaggia nello `state`: l'utente di Ciak (u), lo state scelto dal
// browser (c, che il browser confronta al ritorno), dove tornare (r) e da
// quale origine (o), e la scadenza (e). Firmato: Google ce lo restituisce
// tale e quale, e nessuno può cambiarlo per strada.
export interface DatiStato {
  u: string
  c: string
  r: string
  o: string
  e: number
}

export function firmaStato(dati: DatiStato, segreto: string): string {
  const corpo = Buffer.from(JSON.stringify(dati)).toString('base64url')
  const firma = createHmac('sha256', segreto).update(corpo).digest('base64url')
  return `${corpo}.${firma}`
}

export function verificaStato(stato: string | undefined, segreto: string, ora: number): DatiStato | null {
  if (!stato || !segreto) return null
  const [corpo, firma] = stato.split('.')
  if (!corpo || !firma) return null
  const attesa = createHmac('sha256', segreto).update(corpo).digest('base64url')
  const a = Buffer.from(firma)
  const b = Buffer.from(attesa)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const dati = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as Partial<DatiStato>
    if (typeof dati.u !== 'string' || typeof dati.c !== 'string' || typeof dati.o !== 'string' || typeof dati.e !== 'number') return null
    if (ora > dati.e) return null
    return { u: dati.u, c: dati.c, r: percorsoSicuro(dati.r), o: dati.o, e: dati.e }
  } catch {
    return null
  }
}

// Lo state che il browser si sceglie (vedi googleDrive.ts): lo si accetta
// solo in quella forma, perché finisce in un indirizzo.
export function statoClienteValido(c: unknown): c is string {
  return typeof c === 'string' && /^ciak-drive-[0-9a-f]{32}$/.test(c)
}

// Solo percorsi di Ciak: un `//altro-sito` non è un percorso.
export function percorsoSicuro(p: unknown): string {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('#') ? p : '/streaming'
}

// Da dove è arrivata la richiesta, com'è vista da Vercel (dietro al proxy).
export function origineRichiesta(headers: Record<string, string | string[] | undefined> | undefined): string | null {
  const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const host = primo(headers?.['x-forwarded-host']) ?? primo(headers?.host)
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null
  const proto = primo(headers?.['x-forwarded-proto']) === 'http' ? 'http' : 'https'
  return `${proto}://${host}`
}

// Il consenso di Google per il server: un codice da scambiare (non un token
// nell'indirizzo), `offline` per avere il refresh token, `consent` perché
// Google lo dà solo alla prima autorizzazione, e noi potremmo averla già.
export function urlConsensoServer(clientId: string, origine: string, stato: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', origine + PERCORSO_CALLBACK)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', SCOPE_DRIVE)
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', stato)
  return u.toString()
}

// Dove rimandare il browser, nella stessa forma del vecchio ritorno dal
// consenso (vedi ritornoDrive.ts): il token nel frammento, che non arriva a
// nessun server, e lo state del browser perché lo riconosca.
export function indirizzoRitorno(dati: Pick<DatiStato, 'o' | 'r' | 'c'>, esito: { token: string; secondi: number } | { errore: string }): string {
  const p = new URLSearchParams()
  if ('token' in esito) {
    p.set('access_token', esito.token)
    p.set('token_type', 'Bearer')
    p.set('expires_in', String(esito.secondi))
  } else p.set('error', esito.errore)
  p.set('state', dati.c)
  return `${dati.o}${dati.r}#${p.toString()}`
}
