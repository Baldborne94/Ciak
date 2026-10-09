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
    return { message: decodificaAncora(parametri.get('error_description') || errore), code }
  }
  return null
}

// Supabase a volte codifica la descrizione due volte: a schermo usciva
// «code%3A 4%2F0A» invece di «code: 4/0A».
function decodificaAncora(testo: string): string {
  if (!/%[0-9A-F]{2}/i.test(testo)) return testo
  try {
    return decodeURIComponent(testo)
  } catch {
    return testo
  }
}

export function spiegaErroreAccesso({ message, code }: ErroreAccesso): string {
  if (code === 'signup_disabled' || /signups not allowed/i.test(message)) {
    return (
      'Google ti ha riconosciuto, ma Ciak non accetta account nuovi. Chi gestisce Ciak deve ' +
      'attivarli su Supabase (Authentication → Sign In / Providers → «Allow new users to sign up»).'
    )
  }
  // Google usa access_denied sia per chi annulla sia per chi non è fra gli
  // utenti di prova di un'app ancora in «Testing»: il secondo è il caso di un
  // amico che sceglie l'account e si ritrova fuori senza aver annullato nulla.
  if (code === 'access_denied') {
    return (
      "Google ha negato l'accesso. Se non l'hai annullato tu, chi gestisce Ciak deve aggiungere il tuo " +
      'account Gmail fra gli utenti di prova (Google Cloud → Google Auth Platform → Audience → Test users).'
    )
  }
  // Google ha accettato l'account, ma Supabase non è riuscito a usare il
  // codice che gli ha dato: già usato (pagina ricaricata, tornati indietro,
  // due schede) o scaduto, oppure — se succede a tutti — il Client Secret di
  // Google su Supabase non è quello giusto.
  if (/unable to exchange external code/i.test(message)) {
    return (
      'Google ti ha riconosciuto, ma il passaggio finale non è riuscito. Riprova una volta da capo, aprendo ' +
      'Ciak direttamente in Chrome e senza tornare indietro. Se succede a tutti, chi gestisce Ciak deve ' +
      'controllare il Client Secret di Google su Supabase (Authentication → Sign In / Providers → Google). ' +
      `(${message})`
    )
  }
  // Il testo originale resta: è quello che si cerca nei log di Supabase.
  return `L'accesso con Google non è riuscito: ${message}`
}
