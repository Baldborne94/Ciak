import { useEffect, useState } from 'react'

// Stato React che si rispecchia in localStorage: sopravvive a cambio scheda e
// refresh, finché l'utente non lo sovrascrive (nuova ricerca) o lo cancella.
// Best-effort: se lo storage non è disponibile (modalità privacy, quota piena),
// si comporta come un normale useState senza persistenza.
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage non disponibile: si ignora, lo stato resta solo in memoria.
    }
  }, [key, value])

  return [value, setValue]
}
