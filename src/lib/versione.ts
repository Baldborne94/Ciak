import { logFailure } from './logFailure'

// La versione di questa build, scritta da Vite (plugin `ciak-versione` in
// vite.config.ts) anche in /versione.json. «dev» in sviluppo e nei test, dove
// non c'è niente da confrontare.
export const VERSIONE_APP: string = (import.meta.env.VITE_VERSIONE_APP as string | undefined) ?? 'dev'

let erroreSegnalato = false

// La versione appena pubblicata, o null se non si sa (offline, file assente).
export async function versionePubblicata(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetcher(`/versione.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const { versione } = (await res.json()) as { versione?: unknown }
    return typeof versione === 'string' ? versione : null
  } catch (e) {
    // Si riprova da sé al giro dopo: lo si segnala una volta per sessione, non
    // ogni dieci minuti per tutto il tempo che la rete manca.
    if (!erroreSegnalato) logFailure('Controllo della nuova versione')(e)
    erroreSegnalato = true
    return null
  }
}

export function eNuova(attuale: string, pubblicata: string | null): boolean {
  return attuale !== 'dev' && !!pubblicata && pubblicata !== attuale
}
