// In-memory cache keyed by history entry key (location.key).
// Survives in-app back/forward navigation but is cleared on full page reload,
// which is the desired behaviour: the cache mirrors what was on screen,
// not a persistent data store.
const cache = new Map<string, unknown>()

export function getPageState<T>(locationKey: string): T | undefined {
  return cache.get(locationKey) as T | undefined
}

export function setPageState<T>(locationKey: string, value: T): void {
  cache.set(locationKey, value)
}
