import { createContext, useContext } from 'react'

// Toast notifications: per ora usate soprattutto per rendere VISIBILI gli errori
// di salvataggio (prima venivano ingoiati silenziosamente). Niente più "ho
// premuto Salva e non so se ha funzionato".
export type ToastKind = 'error' | 'success' | 'info'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

export interface ToastCtxValue {
  toasts: Toast[]
  showToast: (message: string, kind?: ToastKind) => void
  dismissToast: (id: number) => void
}

export const ToastCtx = createContext<ToastCtxValue>({
  toasts: [],
  showToast: () => {},
  dismissToast: () => {},
})

export function useToast() {
  return useContext(ToastCtx)
}
