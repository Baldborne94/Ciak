import { useToast, type ToastKind } from '../lib/toastCtx'

// I toast trofei stanno in basso a destra: questi li mettiamo in basso a
// sinistra per non sovrapporsi.
const STYLES: Record<ToastKind, { ring: string; icon: string }> = {
  error: { ring: 'border-curtain-light/50', icon: '⚠️' },
  success: { ring: 'border-projector/40', icon: '✓' },
  info: { ring: 'border-theatre-700', icon: 'ℹ️' },
}

export default function ToastHost() {
  const { toasts, dismissToast } = useToast()

  // Il contenitore resta SEMPRE nel documento, anche vuoto: un lettore di
  // schermo annuncia ciò che compare dentro una regione che stava già
  // sorvegliando, mentre una regione creata insieme al messaggio può passare
  // inosservata. Senza toast non intercetta i clic (pointer-events-none).
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className={`fixed bottom-6 left-6 z-50 flex flex-col gap-2 ${
        toasts.length === 0 ? 'pointer-events-none' : ''
      }`}
    >
      {toasts.map((t) => {
        const style = STYLES[t.kind]
        return (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            // Un errore interrompe la lettura in corso, una conferma aspetta
            // il suo turno: sentirsi troncare una frase per un "salvato" è
            // fastidioso quanto perdersi un errore.
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`flex max-w-xs cursor-pointer items-start gap-2 rounded-xl border ${style.ring} bg-theatre-900/95 p-3 text-sm text-zinc-200 shadow-reel backdrop-blur animate-in fade-in slide-in-from-bottom-4 duration-300`}
          >
            <span className="shrink-0">{style.icon}</span>
            <span className="leading-snug">{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
