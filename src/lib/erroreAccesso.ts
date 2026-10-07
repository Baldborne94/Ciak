// Quando Supabase rifiuta un accesso con Google, non lo dice a nessuno: rimanda
// al sito con l'errore nell'indirizzo (#error=…&error_description=…) e la
// sessione resta vuota. L'app mostrava di nuovo «Accedi» e basta, e chi ci
// provava aveva l'impressione di essere entrato e poi buttato fuori, senza
// alcun indizio sul perché.

import { PREFISSO_STATO_DRIVE } from './ritornoDrive'

export interface ErroreAccesso {
  message: string
  code?: string
}

// L'errore che Supabase ha messo nell'indirizzo di ritorno, se c'è. Lo cerca
// sia dopo il # (flusso implicito, quello di Ciak) sia nella query.
export function leggiErroreAccesso(href: string): ErroreAccesso | null {
  const url = new URL(href)
  for (const parametri of [new URLSearchParams(url.hash.slice(1)), url.searchParams]) {
    const errore = parametri.get('error')
    if (!errore) continue
    // Un rifiuto del collegamento a Drive (stesso Google, altro permesso) ha
    // il suo avviso in ritornoDrive: qui sembrerebbe un login fallito.
    if (parametri.get('state')?.startsWith(PREFISSO_STATO_DRIVE)) return null
    const code = parametri.get('error_code') || errore
    return { message: parametri.get('error_description') || errore, code }
  }
  return null
}

export function spiegaErroreAccesso({ message, code }: ErroreAccesso): string {
  if (code === 'signup_disabled' || /signups not allowed/i.test(message)) {
    return (
      'Google ti ha riconosciuto, ma Ciak non accetta account nuovi. Chi gestisce Ciak deve ' +
      'attivarli su Supabase (Authentication → Sign In / Providers → «Allow new users to sign up»).'
    )
  }
  if (code === 'access_denied') {
    return "L'accesso con Google è stato annullato. Riprova e conferma l'account."
  }
  // Il testo originale resta: è quello che si cerca nei log di Supabase.
  return `L'accesso con Google non è riuscito: ${message}`
}
