import { supabase } from './supabase'

// Il permesso di Drive dal server di Ciak (api/drive.ts), che tiene il refresh
// token di Google e rinnova il permesso senza che si veda niente. Quando il
// server non c'è (non configurato, o l'anteprima dei test che a /api risponde
// con la pagina), tutto torna al giro di prima: il token di un'ora e il
// redirect verso Google.

export type EsitoRinnovo =
  | { stato: 'rinnovato'; token: string; scadenza: number }
  // Il server c'è ma per questo utente non ha un permesso: si collega da capo.
  | { stato: 'non-collegato' }
  // Niente server: vale il vecchio giro.
  | { stato: 'non-disponibile' }

// Margine di sicurezza sotto l'ora dichiarata, come per il consenso.
const MARGINE_S = 120

async function tokenSessione(): Promise<string | null> {
  try {
    const { data } = (await supabase?.auth.getSession()) ?? { data: null }
    return data?.session?.access_token ?? null
  } catch {
    return null
  }
}

async function chiama(metodo: 'POST' | 'DELETE', percorso: string, corpo?: unknown): Promise<{ stato: number; dati: Record<string, unknown> } | null> {
  const sessione = await tokenSessione()
  if (!sessione) return null
  try {
    const r = await fetch(percorso, {
      method: metodo,
      headers: { Authorization: `Bearer ${sessione}`, ...(corpo !== undefined && { 'Content-Type': 'application/json' }) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
    // L'anteprima e il dev server rispondono con la pagina (HTML, 200): non è
    // una risposta del server di Ciak.
    const testo = await r.text()
    const dati = JSON.parse(testo) as Record<string, unknown>
    return dati && typeof dati === 'object' ? { stato: r.status, dati } : null
  } catch {
    return null
  }
}

export function interpretaRinnovo(risposta: { stato: number; dati: Record<string, unknown> } | null, ora: number): EsitoRinnovo {
  if (!risposta) return { stato: 'non-disponibile' }
  if (risposta.stato === 200 && typeof risposta.dati.access_token === 'string') {
    const secondi = typeof risposta.dati.expires_in === 'number' ? risposta.dati.expires_in : 3600
    return { stato: 'rinnovato', token: risposta.dati.access_token, scadenza: ora + Math.max(0, secondi - MARGINE_S) * 1000 }
  }
  if (risposta.stato === 404) return { stato: 'non-collegato' }
  return { stato: 'non-disponibile' }
}

export async function rinnovaDalServer(): Promise<EsitoRinnovo> {
  return interpretaRinnovo(await chiama('POST', '/api/drive?azione=token'), Date.now())
}

// L'indirizzo del consenso di Google, firmato dal server; null se il server
// non c'è. `stato` è quello che il browser ritroverà al ritorno.
export async function urlConsensoDalServer(stato: string, ritorno: string): Promise<string | null> {
  const r = await chiama('POST', '/api/drive?azione=auth', { stato, ritorno })
  return r?.stato === 200 && typeof r.dati.url === 'string' && r.dati.url.startsWith('https://accounts.google.com/') ? r.dati.url : null
}

export async function dimenticaSulServer(): Promise<void> {
  await chiama('DELETE', '/api/drive?azione=token')
}
