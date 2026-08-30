// Da un link YouTube (in una qualsiasi delle sue forme) alla chiave del video.
// Chi incolla un trailer non copia mai lo stesso formato: dalla barra degli
// indirizzi arriva `watch?v=`, dal pulsante Condividi `youtu.be/`, da un embed
// `/embed/`, e a volte si incolla direttamente l'id. Accettarle tutte è la
// differenza fra una funzione che si usa e una che fa arrabbiare.

// Gli id YouTube sono 11 caratteri fra lettere, cifre, trattino e underscore.
const ID = /^[A-Za-z0-9_-]{11}$/

export function parseYoutubeKey(input: string): string | null {
  const testo = input.trim()
  if (!testo) return null

  // Già un id nudo.
  if (ID.test(testo)) return testo

  let url: URL
  try {
    // Senza schema `new URL` fallisce: lo aggiungiamo per accettare anche
    // "youtu.be/xyz" incollato senza https.
    url = new URL(/^https?:\/\//i.test(testo) ? testo : `https://${testo}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase()

  if (host === 'youtu.be') {
    const key = url.pathname.slice(1).split('/')[0]
    return ID.test(key) ? key : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v')
    if (v && ID.test(v)) return v
    // /embed/<id>, /shorts/<id>, /v/<id>
    const m = /^\/(embed|shorts|v)\/([A-Za-z0-9_-]{11})/.exec(url.pathname)
    if (m) return m[2]
  }

  return null
}
