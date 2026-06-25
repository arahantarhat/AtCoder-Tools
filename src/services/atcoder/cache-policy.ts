export const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function isFresh(fetchedAt: number, now = Date.now(), ttlMs = CACHE_TTL_MS): boolean {
  return now - fetchedAt < ttlMs;
}

export function isDatasetCacheKey(key: string): boolean {
  return key.startsWith("resources:") || key.startsWith("submissions:") || key.startsWith("rating-history:");
}
