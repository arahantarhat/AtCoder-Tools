const GITGUD_DELTAS = [-300, -200, -100, 0, 100, 200, 300] as const;
const GITGUD_POINTS = [2, 3, 5, 8, 12, 17, 23] as const;

export type GitgudDelta = (typeof GITGUD_DELTAS)[number];

export function normalizeGitgudDelta(value: number): GitgudDelta {
  const rounded = Math.max(-300, Math.min(300, Math.round(value / 100) * 100));
  if (rounded === -300 || rounded === -200 || rounded === -100 || rounded === 0 || rounded === 100 || rounded === 200 || rounded === 300) {
    return rounded;
  }
  return 0;
}

export function pointsForDelta(delta: number): number {
  const normalized = normalizeGitgudDelta(delta);
  return GITGUD_POINTS[normalized / 100 + 3] ?? 8;
}

export function updateTrainingRating(current: number, outcome: "completed" | "assisted" | "skipped", targetDelta: number): number {
  const base = outcome === "completed" ? 100 : outcome === "assisted" ? -50 : -100;
  const challengeAdjustment = Math.round(targetDelta / 4);
  return Math.max(400, Math.min(4000, current + base + challengeAdjustment));
}

export function reviewDelaySeconds(reason: "assisted" | "skipped"): number {
  return reason === "assisted" ? 21 * 24 * 60 * 60 : 42 * 24 * 60 * 60;
}
