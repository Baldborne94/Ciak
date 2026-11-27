// Quando la rete non tiene il passo col video del server di casa. Il tablet
// lontano dal router si fermava a caricare ogni tanto, e un episodio da 8
// Mbit al secondo restava a scatti finché non si spostava: ora, dopo troppe
// attese, il lettore passa da solo alla qualità ridotta (flussoHlsRidotto) e
// lo dice. Le attese dopo un salto o prima della partenza non contano: lì
// aspettare è normale.

export interface Attesa {
  inizio: number
  fine: number | null
}

// Tre attese in due minuti, o una che dura più di dieci secondi.
export const FINESTRA_MS = 120_000
export const TROPPE = 3
export const LUNGA_MS = 10_000

export function connessioneLenta(attese: Attesa[], adesso: number): boolean {
  if (attese.filter((a) => adesso - a.inizio <= FINESTRA_MS).length >= TROPPE) return true
  return attese.some((a) => a.fine === null && adesso - a.inizio >= LUNGA_MS)
}
