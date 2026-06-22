import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastCtx, type Toast, type ToastKind } from './toastCtx'

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'error') => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, message, kind }])
      // Gli errori restano un po' più a lungo: vanno letti.
      setTimeout(() => dismissToast(id), kind === 'error' ? 6000 : 3500)
    },
    [dismissToast],
  )

  const value = useMemo(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast],
  )

  return <ToastCtx.Provider value={value}>{children}</ToastCtx.Provider>
}
