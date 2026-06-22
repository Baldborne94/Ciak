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

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const style = STYLES[t.kind]
        return (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            role="alert"
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
