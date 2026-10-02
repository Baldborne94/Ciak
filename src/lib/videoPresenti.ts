// Quali file ci sono ancora su Drive. Il legame file → titolo (user_streaming)
// resta anche quando il file viene cancellato, e «▶ Riprendi da 7:40» portava
// a un file che non c'era più. La videoteca, ogni volta che legge Drive per
// intero, ricorda qui gli id trovati; i pulsanti «Guarda» li consultano.
//
// Sta sul dispositivo: è il riflesso dell'ultimo elenco letto, non un dato da
// conservare, e la riga in Supabase (posizione, visto) non si tocca — se il
// file torna, torna anche il pulsante.

const CHIAVE = 'ciak:drive-presenti'

export function salvaPresenti(ids: string[]): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ ids, quando: Date.now() }))
  } catch {
    /* storage pieno o negato: i pulsanti restano tutti, come prima */
  }
}

// null se Drive non è mai stato letto per intero da qui: allora non si sa, e
// non si toglie niente.
export function leggiPresenti(): Set<string> | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as { ids?: unknown } | null
    return v && Array.isArray(v.ids) ? new Set(v.ids.filter((id): id is string => typeof id === 'string')) : null
  } catch {
    return null
  }
}

// Un film scaricato sul dispositivo si guarda anche se su Drive non c'è più.
export function soloPresenti<T extends { drive_file_id: string }>(righe: T[], presenti: Set<string> | null, scaricati: Set<string>): T[] {
  if (!presenti) return righe
  return righe.filter((r) => presenti.has(r.drive_file_id) || scaricati.has(r.drive_file_id))
}
