// Le richieste al catalogo passano da /api/tmdb, che tiene la chiave lato
// server. Prima viaggiava nel bundle come VITE_TMDB_API_KEY: chiunque aprisse
// gli strumenti da sviluppatore poteva copiarla e usarla altrove.
//
// Le immagini restano dirette: non chiedono chiave, e farle passare da noi
// significherebbe pagare la banda di ogni locandina.
const PROXY = '/api/tmdb'

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(PROXY, window.location.origin)
  url.searchParams.set('path', path)
  url.searchParams.set('language', 'it-IT')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    // Il proxy spiega cosa non va (chiave mancante sul server, percorso non
    // consentito, quota TMDB finita): riportarlo è più utile del solo numero.
    const detto = await res
      .json()
      .then((b: { error?: string }) => b?.error)
      .catch(() => undefined)
    throw new Error(detto ?? `Errore TMDB (${res.status}). Riprova più tardi.`)
  }
  return res.json() as Promise<T>
}

// Il browser non conosce più la chiave, quindi non può sapere da solo se il
// catalogo è configurato: lo chiede al server. Serve alle Impostazioni, che
// altrimenti mostrerebbero «Connesso» senza averlo verificato.
export async function tmdbConfigurato(): Promise<boolean> {
  try {
    await tmdbFetch('/configuration')
    return true
  } catch {
    return false
  }
}

// ── Normalisers ──────────────────────────────────────────────────────────
