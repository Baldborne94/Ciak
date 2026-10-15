// Quando Supabase rifiuta un link d'accesso (quello di «Password
// dimenticata?»), non lo dice a nessuno: rimanda al sito con l'errore
// nell'indirizzo (#error=…&error_description=…) e la sessione resta vuota.
// L'app mostrava di nuovo «Accedi» e basta, senza alcun indizio sul perché.
// (Nato per l'accesso con Google, che non c'è più: i link dell'email tornano
// allo stesso modo.)

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
  // Il link dell'email vale una volta e per poco: aperto due volte, da
  // un'email vecchia o dopo averne chiesta un'altra, Supabase rimanda qui.
  if (code === 'otp_expired' || /link is invalid or has expired/i.test(message)) {
    return 'Il link dell’email è scaduto o è già stato usato. Chiedine un altro dalla pagina di accesso, con «Password dimenticata?».'
  }
  // Il testo originale resta: è quello che si cerca nei log di Supabase.
  return `L'accesso dal link non è riuscito: ${message}`
}
