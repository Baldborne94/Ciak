import { registraErrore } from './errorLog'

// Alcune operazioni sono volutamente "best effort": arricchiscono la pagina
// (anni di uscita, generi, allineamenti di stato) e se falliscono non vale la
// pena interrompere ciò che l'utente sta facendo.
//
// Silenziarle del tutto, però, le rende invisibili anche a noi: un fallimento
// ripetuto si presenta come un dato che "sparisce", e si finisce a cercarlo
// nel posto sbagliato. Questo helper tiene il fallimento fuori dai piedi
// dell'utente ma in due posti dove si può ritrovare: la console, per chi la
// sta guardando adesso, e il diario su Supabase, per tutte le altre volte —
// che sono la maggioranza, perché quella console non la apre mai nessuno.
export function logFailure(context: string) {
  return (e: unknown) => {
    console.error(`[Ciak] ${context}:`, e instanceof Error ? e.message : e)
    // Senza await: chi chiama sta già gestendo un guasto e non deve aspettare
    // la diagnostica. `registraErrore` non lancia mai.
    void registraErrore(context, e)
  }
}
