// Client-side mirror of the server's daily AI counter, used only for display
// ("usi rimasti oggi"). The real limit is enforced server-side (api/_lib/
// aiGuard.ts + tabella ai_usage): ogni risposta AI riporta `aiCreditsLeft`,
// che salviamo qui. Finché il contatore server non è configurato, mostriamo
// il valore pieno (la protezione vera resta l'auth obbligatoria sugli endpoint).

export const AI_DAILY_LIMIT = Number(import.meta.env.VITE_AI_DAILY_LIMIT ?? '3')

const PREFIX = 'cv_ai_left_'

function todayKey(): string {
  return PREFIX + new Date().toISOString().slice(0, 10)
}

// Record the remaining credits reported by the server.
export function setAiCreditsLeft(n: number): void {
  const key = todayKey()
  localStorage.setItem(key, String(Math.max(0, n)))
  // Tidy up old days' counters. Raccolgo prima le chiavi e poi le rimuovo: così
  // non muto localStorage mentre lo sto iterando con key(i).
  const stale: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX) && k !== key) stale.push(k)
  }
  for (const k of stale) localStorage.removeItem(k)
}

// Best-known remaining credits for today (full limit until the server tells us).
export function aiUsesLeft(): number {
  const raw = localStorage.getItem(todayKey())
  return raw === null ? AI_DAILY_LIMIT : Math.max(0, Number(raw))
}
