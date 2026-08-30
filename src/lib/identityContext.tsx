import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { logFailure } from './logFailure'
import { Ctx } from './identityCtx'
import { useAuth } from './auth'
import { getIdentity } from './userTitles'
import { avatarDataUrl, personaById } from './cinephileIdentity'

const THEME_KEY = 'cinevault_active_theme'
const IDENTITY_KEY = 'cinevault_identity'

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme === 'default' ? '' : theme
}

interface StoredIdentity {
  nickname: string
  avatarUrl: string
}

function readIdentity(): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    return raw ? (JSON.parse(raw) as StoredIdentity) : null
  } catch {
    // localStorage negato (navigazione privata): si riparte dal profilo remoto.
    return null
  }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // Nickname e avatar ricordati in locale: il Navbar li mostra subito al
  // refresh, poi la pagina Profilo li risincronizza da Supabase.
  const [identity, setIdentityState] = useState<StoredIdentity | null>(readIdentity)

  // Tema salvato, riapplicato all'avvio prima che arrivino i dati remoti.
  useEffect(() => {
    applyTheme(localStorage.getItem(THEME_KEY) ?? 'default')
  }, [])

  const setIdentity = useCallback(
    (next: { nickname: string; avatarUrl: string; theme: string }) => {
      const stored: StoredIdentity = { nickname: next.nickname, avatarUrl: next.avatarUrl }
      setIdentityState(stored)
      try {
        localStorage.setItem(IDENTITY_KEY, JSON.stringify(stored))
        localStorage.setItem(THEME_KEY, next.theme)
      } catch {
        /* storage negato: l'identità vale comunque per questa sessione */
      }
      applyTheme(next.theme)
    },
    [],
  )

  // Sync all'avvio: appena c'è un utente carico l'identità da Supabase, così
  // Navbar e tema sono corretti su qualsiasi dispositivo senza dover prima
  // aprire il Profilo (il localStorage è vuoto su un device nuovo).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getIdentity(user.id)
      .then((stored) => {
        if (cancelled || !stored?.nickname || !stored.avatar_style) return
        const persona = personaById(stored.avatar_seed)
        const colors: [string, string] = persona?.colors ?? ['#18181b', '#3f3f46']
        setIdentity({
          nickname: stored.nickname,
          avatarUrl: avatarDataUrl(stored.avatar_style, colors),
          theme: stored.theme ?? persona?.theme ?? 'default',
        })
      })
      .catch(logFailure('identità cinefila non caricata'))
    return () => {
      cancelled = true
    }
    // setIdentity è stabile (useCallback senza dipendenze).
  }, [user, setIdentity])

  const value = useMemo(
    () => ({
      nickname: identity?.nickname ?? null,
      avatarUrl: identity?.avatarUrl ?? null,
      setIdentity,
    }),
    [identity, setIdentity],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
