// La ricerca dentro una lista personale: un titolo si trova col nome italiano,
// con quello originale o con quello inglese («Song of the Sea» trova «La
// canzone del mare»), senza badare a maiuscole, accenti e punteggiatura
// («shogun» trova «Shōgun», «mr pickles» trova «Mr. Pickles»).

// Lettere e cifre di qualunque alfabeto restano: un titolo giapponese va
// cercato in giapponese, non ridotto a una stringa vuota che trova tutto.
export function normalizzaRicerca(t: string): string {
  return t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Gli alfabeti che non separano le parole con gli spazi: lì una parola
// comincia ovunque, e «千尋» va trovato dentro «千と千尋の神隠し».
const SENZA_SPAZI = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u

// Il testo cercato va trovato all'inizio di una parola, non a metà: «long»
// trovava «Insieme agli Dei», perché l'originale è «Along with the Gods».
function contiene(titolo: string, q: string): boolean {
  const t = normalizzaRicerca(titolo)
  return SENZA_SPAZI.test(q) ? t.includes(q) : ` ${t}`.includes(` ${q}`)
}

export function corrispondeRicerca(query: string, titoli: (string | null | undefined)[]): boolean {
  const q = normalizzaRicerca(query)
  if (!q) return true
  return titoli.some((t) => !!t && contiene(t, q))
}

// Il titolo che ha risposto alla ricerca: se non è quello a schermo (l'originale,
// l'inglese) la lista lo mostra, altrimenti non si capisce perché il titolo c'è.
export function titoloTrovato(query: string, titoli: (string | null | undefined)[]): string | null {
  const q = normalizzaRicerca(query)
  if (!q) return null
  return titoli.find((t): t is string => !!t && contiene(t, q)) ?? null
}
