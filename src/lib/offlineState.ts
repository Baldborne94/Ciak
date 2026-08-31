import { useSyncExternalStore } from 'react'

// Chi serve una copia salvata lo dice qui; la banda in cima alla pagina lo
// legge. Un piccolo negozio di stato invece di un contesto: il dato è uno solo
// e lo scrive il livello di accesso ai dati, che non è un componente React.

let copiaInUso: string | null = null
const ascoltatori = new Set<() => void>()

function avvisa() {
  for (const a of ascoltatori) a()
}

// Stiamo mostrando una copia salvata a questa data.
export function segnalaCopia(salvatoIl: string): void {
  if (copiaInUso === salvatoIl) return
  copiaInUso = salvatoIl
  avvisa()
}

// La rete ha risposto: da qui in poi i dati sono freschi.
export function segnalaDatiFreschi(): void {
  if (copiaInUso === null) return
  copiaInUso = null
  avvisa()
}

function iscriviti(a: () => void): () => void {
  ascoltatori.add(a)
  return () => {
    ascoltatori.delete(a)
  }
}

const leggi = () => copiaInUso

export function useCopiaSalvata(): string | null {
  // Il terzo argomento serve al render sul server e ai test che montano senza
  // window: senza, useSyncExternalStore lancia.
  return useSyncExternalStore(iscriviti, leggi, () => null)
}
