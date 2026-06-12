import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { type Achievement } from './achievements'
import { Ctx } from './achievementsCtx'

const ID_KEY    = 'cinevault_active_achievement_id'
const THEME_KEY = 'cinevault_active_theme'

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme === 'default' ? '' : theme
}

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Achievement[]>([])
  const [activeAchievementId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(ID_KEY),
  )

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

  const notify = useCallback((a: Achievement[]) => {
    setPending((prev) => [...prev, ...a])
  }, [])

  const dismiss = useCallback(() => setPending([]), [])

  const value = useMemo(
    () => ({ pending, notify, dismiss, activeAchievementId, setActiveAchievement }),
    [pending, notify, dismiss, activeAchievementId, setActiveAchievement],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
