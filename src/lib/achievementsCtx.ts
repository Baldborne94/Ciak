import { createContext, useContext } from 'react'
import { ACHIEVEMENTS, type Achievement } from './achievements'

export interface AchievementsCtx {
  pending: Achievement[]
  notify: (achievements: Achievement[]) => void
  dismiss: () => void
  activeAchievementId: string | null
  setActiveAchievement: (id: string, theme: string) => void
  // Identità Cinefila: nickname + avatar mostrati nel Navbar.
  nickname: string | null
  avatarUrl: string | null
  setIdentity: (identity: { nickname: string; avatarUrl: string; theme: string }) => void
}

export const Ctx = createContext<AchievementsCtx>({
  pending: [],
  notify: () => {},
  dismiss: () => {},
  activeAchievementId: null,
  setActiveAchievement: () => {},
  nickname: null,
  avatarUrl: null,
  setIdentity: () => {},
})

export function useAchievementsCtx() {
  return useContext(Ctx)
}

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}
