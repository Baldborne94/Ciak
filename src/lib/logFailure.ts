// Alcune operazioni sono volutamente "best effort": arricchiscono la pagina
// (anni di uscita, generi, trofei, allineamenti di stato) e se falliscono non
// vale la pena interrompere ciò che l'utente sta facendo.
//
// Silenziarle del tutto, però, le rende invisibili anche a noi: un fallimento
// ripetuto si presenta come un dato che "sparisce", e si finisce a cercarlo
// nel posto sbagliato. Questo helper tiene il fallimento fuori dai piedi
// dell'utente ma dentro la console, dove si può trovare.
export function logFailure(context: string) {
  return (e: unknown) => {
    console.error(`[Ciak] ${context}:`, e instanceof Error ? e.message : e)
  }
}
