import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { ACHIEVEMENTS, type Achievement } from './achievements'

interface AchievementsCtx {
  pending: Achievement[]
  notify: (achievements: Achievement[]) => void
  dismiss: () => void
  activeAchievementId: string | null
  setActiveAchievement: (id: string, theme: string) => void
}

const Ctx = createContext<AchievementsCtx>({
  pending: [],
  notify: () => {},
  dismiss: () => {},
  activeAchievementId: null,
  setActiveAchievement: () => {},
})

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

  function setActiveAchievement(id: string, theme: string) {
    setActiveId(id)
    localStorage.setItem(ID_KEY, id)
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
  }

  return (
    <Ctx.Provider
      value={{
        pending,
        notify: (a) => setPending((prev) => [...prev, ...a]),
        dismiss: () => setPending([]),
        activeAchievementId,
        setActiveAchievement,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAchievementsCtx() {
  return useContext(Ctx)
}

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}
