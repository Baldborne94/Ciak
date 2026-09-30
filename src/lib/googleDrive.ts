// I tuoi film restano su Google Drive: qui li si ELENCA e li si riproduce in
// streaming (via l'anteprima di Google), senza scaricarli in locale.
//
// Autenticazione: Google Identity Services (GIS), flusso token per una SPA — il
// Client ID è pubblico (nessun segreto lato client), lo scope è in sola lettura.
// Il token vive in memoria e scade dopo ~1h: senza backend non c'è refresh,
// quindi ogni tanto va ri-collegato. Va bene per un uso personale.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

// La funzione esiste solo se è stato configurato un Client ID: senza, la voce di
// menu e la pagina restano nascoste, così il resto dell'app non cambia.
export function driveConfigurato(): boolean {
  return !!CLIENT_ID
}

export interface DriveVideo {
  id: string
  name: string
  size: number | null
  mimeType: string
}

// GIS espone `window.google.accounts.oauth2`. Tipizzato al minimo che serve.
interface TokenResponse {
  access_token?: string
  error?: string
  expires_in?: number
}
interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void
}
interface GoogleOauth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
  }) => TokenClient
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOauth2 } }
  }
}

let accessToken: string | null = null
let tokenExpiry = 0

export function driveConnesso(): boolean {
  return !!accessToken && Date.now() < tokenExpiry
}

export function driveDisconnetti(): void {
  accessToken = null
  tokenExpiry = 0
}

// Carica lo script GIS una sola volta (idempotente: se c'è già, non lo riaggiunge).
function caricaGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const esistente = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (esistente) {
      esistente.addEventListener('load', () => resolve())
      esistente.addEventListener('error', () => reject(new Error('Script Google non caricato')))
      return
    }
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Script Google non caricato'))
    document.head.appendChild(s)
  })
}

// Apre il consenso Google e mette da parte il token. Da chiamare su gesto utente
// (un click): il popup di Google richiede un'interazione.
export async function collegaDrive(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Google Drive non è configurato.')
  await caricaGis()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google Identity Services non disponibile.')

  const resp = await new Promise<TokenResponse>((resolve) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: resolve,
    })
    client.requestAccessToken()
  })
  if (resp.error || !resp.access_token) {
    throw new Error(resp.error || 'Accesso a Google Drive non riuscito.')
  }
  accessToken = resp.access_token
  // Margine di sicurezza sotto l'ora dichiarata, per non usare un token già scaduto.
  const secondi = resp.expires_in ?? 3600
  tokenExpiry = Date.now() + Math.max(0, secondi - 120) * 1000
}

// I file video del Drive dell'utente, i più recenti per nome. Solo lettura.
export async function elencaVideo(): Promise<DriveVideo[]> {
  if (!driveConnesso() || !accessToken) throw new Error('Google Drive non collegato.')
  const params = new URLSearchParams({
    q: "mimeType contains 'video/' and trashed = false",
    fields: 'files(id,name,size,mimeType)',
    orderBy: 'name',
    pageSize: '100',
  })
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Google Drive ha risposto ${res.status}.`)
  const data = (await res.json()) as { files?: { id: string; name: string; size?: string; mimeType: string }[] }
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size ? Number(f.size) : null,
    mimeType: f.mimeType,
  }))
}

// L'URL dell'anteprima di Google: riproduce in streaming dentro un iframe, senza
// scaricare il file. Usa la sessione Google del browser (nessun token nell'URL).
export function anteprimaUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`
}
