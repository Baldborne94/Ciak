// Una cache per titolo in una sola chiave di localStorage, per i dati di TMDB
// che cambiano di rado (titoli originali, generi): si chiedono una volta per
// dispositivo invece che a ogni apertura di una lista.

export interface CacheLocale<T> {
  // Solo le voci presenti, valide e fresche: le altre vanno chieste a TMDB.
  leggi(keys: string[], now?: number): Map<string, T>
  scrivi(valori: Map<string, T>, now?: number): void
}

type Entry<T> = [valore: T, savedAt: number]

export function creaCacheLocale<T>(
  chiave: string,
  { durataMs, valido, max = 5000 }: { durataMs: number; valido: (v: unknown) => v is T; max?: number },
): CacheLocale<T> {
  function read(): Record<string, Entry<T>> {
    try {
      const raw = localStorage.getItem(chiave)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, Entry<T>>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      // localStorage negato o dati corrotti: si lavora senza cache.
      return {}
    }
  }

  function write(store: Record<string, Entry<T>>): void {
    try {
      localStorage.setItem(chiave, JSON.stringify(store))
    } catch {
      /* quota piena o storage negato: la cache è un di più */
    }
  }

  return {
    leggi(keys, now = Date.now()) {
      const store = read()
      const out = new Map<string, T>()
      for (const k of keys) {
        const entry = store[k]
        if (Array.isArray(entry) && valido(entry[0]) && now - entry[1] <= durataMs) out.set(k, entry[0])
      }
      return out
    },
    scrivi(valori, now = Date.now()) {
      if (valori.size === 0) return
      let store = read()
      // Contro la crescita illimitata, non un limite di funzionamento.
      if (Object.keys(store).length + valori.size > max) store = {}
      for (const [k, v] of valori) store[k] = [v, now]
      write(store)
    },
  }
}
