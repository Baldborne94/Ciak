import { useToast } from '../lib/toastCtx'
import type { TmdbType } from '../lib/types'

// Condivide un singolo titolo con chi usa Ciak. Il link porta a /consiglia,
// una pagina pubblica dove il destinatario se lo aggiunge a "Da vedere" con un
// click: niente copia-incolla di titoli da ricercare a mano.
export default function ShareTitleButton({
  tmdbId,
  mediaType,
  title,
}: {
  tmdbId: number
  mediaType: TmdbType
  title: string
}) {
  const { showToast } = useToast()

  async function share() {
    const url = `${window.location.origin}/consiglia/${mediaType}/${tmdbId}`

    // Su telefono il foglio di condivisione nativo è la strada più corta
    // (WhatsApp, Telegram, messaggi); altrove ripieghiamo sugli appunti.
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Ti consiglio «${title}» su Ciak`, url })
        return
      } catch (e) {
        // Foglio chiuso dall'utente: è una scelta, non un errore da segnalare.
        if ((e as Error).name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copiato: mandalo a chi vuoi consigliarlo!', 'success')
    } catch {
      // Appunti negati (permessi, http): almeno mostriamo il link da copiare.
      showToast(`Link da condividere: ${url}`, 'info')
    }
  }

  return (
    <button onClick={share} className="btn-ghost" title={`Consiglia «${title}» a qualcuno`}>
      📤 Consiglia a un amico
    </button>
  )
}
