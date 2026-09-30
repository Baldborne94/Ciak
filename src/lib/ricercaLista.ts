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

export function corrispondeRicerca(query: string, titoli: (string | null | undefined)[]): boolean {
  const q = normalizzaRicerca(query)
  if (!q) return true
  return titoli.some((t) => !!t && normalizzaRicerca(t).includes(q))
}
