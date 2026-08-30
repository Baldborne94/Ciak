import { createContext, useContext } from 'react'

// Identità Cinefila: nickname, avatar e tema derivati da ciò che guardi.
// Prima viveva insieme ai trofei, che potevano sovrascrivere avatar e tema
// equipaggiando un premio. Tolti quelli, la personalizzazione del profilo ha
// una sola sorgente — i tuoi film — e questo contesto la trasporta.
export interface IdentityCtxValue {
  nickname: string | null
  avatarUrl: string | null
  setIdentity: (identity: { nickname: string; avatarUrl: string; theme: string }) => void
}

export const Ctx = createContext<IdentityCtxValue>({
  nickname: null,
  avatarUrl: null,
  setIdentity: () => {},
})

export function useIdentityCtx() {
  return useContext(Ctx)
}
