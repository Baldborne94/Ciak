import type { UserTitle } from './types'

// Una lettura recente, condivisa. La collezione (più di mille titoli) la
// leggevano per intero l'indice dei badge all'avvio e poi, di nuovo, il
// diario, «Da recuperare» e il profilo dei gusti, a ogni apertura: le stesse
// righe scaricate più volte nel giro di pochi secondi.
//
// Si riusa solo per poco (`durataMs`), così un cambiamento fatto da un altro
// dispositivo arriva comunque, e chi scrive nella tabella chiama `dimentica()`:
// dopo un salvataggio la lettura successiva è sempre fresca.
export function creaMemoria<T>(durataMs: number, ora: () => number = Date.now) {
  let voce: { chiave: string; quando: number; dati: Promise<T> } | null = null
  return {
    leggi(chiave: string, carica: () => Promise<T>): Promise<T> {
      if (voce && voce.chiave === chiave && ora() - voce.quando < durataMs) return voce.dati
      const mia = { chiave, quando: ora(), dati: carica() }
      voce = mia
      // Fallita, non si tiene: la prossima pagina riprova. Solo se è ancora
      // lei: nel frattempo un salvataggio può averla già tolta.
      mia.dati.catch(() => {
        if (voce === mia) voce = null
      })
      return mia.dati
    },
    dimentica(): void {
      voce = null
    },
  }
}

// La collezione dell'utente: due minuti bastano per passare da una pagina
// all'altra senza rileggerla, e sono pochi per non mostrare a lungo una
// modifica fatta dal telefono mentre il tablet è aperto.
const collezione = creaMemoria<UserTitle[]>(2 * 60_000)
export const leggiCollezione = collezione.leggi
export const dimenticaCollezione = collezione.dimentica
