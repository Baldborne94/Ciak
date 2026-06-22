import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { type Achievement } from './achievements'
import { Ctx } from './achievementsCtx'

const ID_KEY       = 'cinevault_active_achievement_id'
const THEME_KEY    = 'cinevault_active_theme'
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
    return null
  }
}

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Achievement[]>([])
  const [activeAchievementId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(ID_KEY),
  )
  // Identità (nickname + avatar) ricordata in localStorage: il Navbar la mostra
  // subito al refresh, poi la pagina Profilo la risincronizza da Supabase.
  const [identity, setIdentityState] = useState<StoredIdentity | null>(readIdentity)

  // Restore theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY) ?? 'default'
    applyTheme(savedTheme)
  }, [])

  const setActiveAchievement = useCallback((id: string, theme: string) => {
    setActiveId(id)
    localStorage.setItem(ID_KEY, id)
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
  }, [])

  const setIdentity = useCallback(
    (next: { nickname: string; avatarUrl: string; theme: string }) => {
      const stored: StoredIdentity = { nickname: next.nickname, avatarUrl: next.avatarUrl }
      setIdentityState(stored)
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(stored))
      localStorage.setItem(THEME_KEY, next.theme)
      applyTheme(next.theme)
    },
    [],
  )

  const notify = useCallback((a: Achievement[]) => {
    setPending((prev) => [...prev, ...a])
  }, [])

  const dismiss = useCallback(() => setPending([]), [])

  const value = useMemo(
    () => ({
      pending,
      notify,
      dismiss,
      activeAchievementId,
      setActiveAchievement,
      nickname: identity?.nickname ?? null,
      avatarUrl: identity?.avatarUrl ?? null,
      setIdentity,
    }),
    [pending, notify, dismiss, activeAchievementId, setActiveAchievement, identity, setIdentity],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
