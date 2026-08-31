import { Component, type ErrorInfo, type ReactNode } from 'react'
import { registraErrore } from '../lib/errorLog'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Rete di sicurezza: un errore di render non gestito altrimenti lascia lo
// schermo bianco. Qui lo intercettiamo e mostriamo un fallback con il pulsante
// per ricaricare, senza perdere navbar e footer (il boundary sta dentro Layout).
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Errore non gestito:', error, info.componentStack)
    // Un errore che ha svuotato lo schermo è il più importante da ritrovare
    // dopo: la console dell'utente non la leggerà nessuno.
    void registraErrore('render (schermata bianca evitata)', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md rounded-2xl border border-curtain/40 bg-theatre-900/60 p-8 text-center">
          <div className="text-4xl">🎬💥</div>
          <h2 className="mt-3 font-display text-2xl tracking-wide text-zinc-100">
            Qualcosa è andato storto
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Si è verificato un errore imprevisto. Ricarica la pagina per riprovare.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary mt-5 px-4 py-2 text-sm"
          >
            ↻ Ricarica
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
