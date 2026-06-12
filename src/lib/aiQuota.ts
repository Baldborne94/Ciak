// Client-side daily cap on AI usage (song search, photo identify, AI
// recommendations, saga story-order) to protect the Anthropic credit balance.
// Shared counter across all AI features, reset every day (local time-ish/UTC date).

export const AI_DAILY_LIMIT = 3

const PREFIX = 'cv_ai_usage_'

function todayKey(): string {
  return PREFIX + new Date().toISOString().slice(0, 10)
}

function currentCount(): number {
  return Number(localStorage.getItem(todayKey()) || '0')
}

export function aiUsesLeft(): number {
  return Math.max(0, AI_DAILY_LIMIT - currentCount())
}

// Throws when the daily limit is reached — call before an AI request.
export function assertAiQuota(): void {
  if (aiUsesLeft() <= 0) {
    throw new Error(
      `Hai raggiunto il limite di ${AI_DAILY_LIMIT} ricerche AI per oggi. Riprova domani.`,
    )
  }
}

// Record one AI use (call only after a real AI request, not on cache hits).
export function recordAiUse(): void {
  const key = todayKey()
  localStorage.setItem(key, String(currentCount() + 1))
  // Tidy up old days' counters.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX) && k !== key) localStorage.removeItem(k)
  }
}
