import { supabase } from './supabase'
import { setAiCreditsLeft } from './aiQuota'

// Single entry point for calling the AI serverless endpoints. It attaches the
// logged-in user's Supabase token (the endpoints reject anonymous calls) and
// keeps the local "usi rimasti" counter in sync with the server's response.
export async function aiFetch<T>(path: string, body: unknown): Promise<T> {
  if (!supabase) throw new Error('Supabase non è configurato.')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Accedi per usare le funzioni AI.')

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({} as Record<string, unknown>))
  if (typeof (data as { aiCreditsLeft?: unknown }).aiCreditsLeft === 'number') {
    setAiCreditsLeft((data as { aiCreditsLeft: number }).aiCreditsLeft)
  }
  if (!res.ok) {
    const serverError = (data as { error?: string }).error
    // Se il server non ha restituito un messaggio JSON (es. timeout/crash della
    // funzione su Vercel) mostriamo almeno il codice HTTP, così l'errore è
    // diagnosticabile invece del generico "non disponibile".
    throw new Error(serverError ?? `Servizio AI non disponibile (HTTP ${res.status}).`)
  }
  return data as T
}
