import type { OfficialRatingPoint, ProgressMode, TrainingSession } from "../../types";
import { TRAINING_MODES } from "../../shared/training-modes";
import type { TimelinePoint } from "./types";

export function buildProgressTimeline(
  official: OfficialRatingPoint[],
  sessions: TrainingSession[],
  mode: ProgressMode
): TimelinePoint[] {
  const bestTrainingByDay = new Map<string, TimelinePoint>();
  sessions
    .filter((session) => session.ratingAfter !== undefined && (mode === "all" || session.mode === mode))
    .forEach((session) => {
      const epochSecond = session.endedAt ?? session.startedAt + session.durationSeconds;
      const key = getUtcDayKey(epochSecond);
      const point = {
        epochSecond,
        trainingRating: session.ratingAfter,
        label: TRAINING_MODES[session.mode].label,
        mode: session.mode
      } satisfies TimelinePoint;
      const current = bestTrainingByDay.get(key);
      if (!current || (point.trainingRating ?? 0) > (current.trainingRating ?? 0)) bestTrainingByDay.set(key, point);
    });
  const trainingEvents = [...bestTrainingByDay.values()].map((point) => ({
    ...point,
    epochSecond: getUtcNoon(point.epochSecond)
  }));
  const officialEvents = official.map((point) => ({
    epochSecond: point.epochSecond,
    officialRating: point.rating,
    label: point.contestName ?? point.contestScreenName ?? "Official contest",
    mode: "official"
  } satisfies TimelinePoint));
  return [...officialEvents, ...trainingEvents].sort((a, b) => a.epochSecond - b.epochSecond);
}

function getUtcDayKey(epochSecond: number): string {
  return new Date(epochSecond * 1000).toISOString().slice(0, 10);
}

function getUtcNoon(epochSecond: number): number {
  return Math.floor(new Date(`${getUtcDayKey(epochSecond)}T12:00:00.000Z`).getTime() / 1000);
}
