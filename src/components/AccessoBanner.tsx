import { useAuth } from '../lib/auth'

// Il motivo per cui l'accesso con Google è stato rifiutato, in cima a ogni
// pagina: Supabase rimanda alla home, non al login, e lì un messaggio dentro
// il modulo d'accesso nessuno lo vedrebbe.
export default function AccessoBanner() {
  const { erroreAccesso, chiudiErroreAccesso } = useAuth()
  if (!erroreAccesso) return null

  return (
    <div role="alert" className="border-b border-curtain/40 bg-curtain-dark/20">
      <div className="container-cine flex items-start gap-3 py-3 text-sm text-curtain-light">
        <span aria-hidden="true">🔒</span>
        <p className="flex-1">
          <span className="font-semibold">Accesso non riuscito.</span> {erroreAccesso}
        </p>
        <button type="button" onClick={chiudiErroreAccesso} className="text-xs underline">
          Chiudi
        </button>
      </div>
    </div>
  )
}
