import {
  calibrateTrainingPerformance,
  estimateTrainingPerformance,
  updateTrainingElo
} from "../features/training";
import type { OfficialRatingPoint, TrainingMode, TrainingSession, TrainingSettings } from "../types";

export function completeSessionRating(session: TrainingSession, ratingBefore: number): TrainingSession {
  const performance = calibrateTrainingPerformance(estimateTrainingPerformance(session), session);
  const ratingAfter = updateTrainingElo(ratingBefore, performance, session.mode);
  return {
    ...session,
    performance,
    ratingBefore,
    ratingAfter
  };
}

export function getOfficialRatingAtOrBefore(
  history: OfficialRatingPoint[],
  epochSecond: number
): number | undefined {
  const before = history
    .filter((point) => point.epochSecond <= epochSecond)
    .sort((a, b) => b.epochSecond - a.epochSecond)[0];
  return before?.rating ?? history[history.length - 1]?.rating;
}

export function getPreviousModeRating(
  sessions: TrainingSession[],
  settings: TrainingSettings | null,
  mode: TrainingMode
): number {
  const previous = sessions
    .filter((session) => session.mode === mode && session.ratingAfter !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  return previous?.ratingAfter ?? settings?.eloByMode[mode] ?? 400;
}

export function recalibrateTrainingSessions(
  sessions: TrainingSession[],
  settings: TrainingSettings | null,
  officialHistory: OfficialRatingPoint[]
): { sessions: TrainingSession[]; settings: TrainingSettings | null; changed: boolean } {
  if (!settings || sessions.length === 0) return { sessions, settings, changed: false };

  const firstSessionTime = Math.min(...sessions.map((session) => session.startedAt));
  const baseRating = getOfficialRatingAtOrBefore(officialHistory, firstSessionTime) ?? settings.initializedFrom?.value ?? 400;
  const nextEloByMode = {
    "ladder-2h": baseRating,
    "consistency-1h": baseRating
  };
  let changed = false;
  const recalibrated = sessions
    .slice()
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((session) => {
      const before = nextEloByMode[session.mode];
      const updated = completeSessionRating(session, before);
      nextEloByMode[session.mode] = updated.ratingAfter ?? before;
      if (updated.performance !== session.performance || updated.ratingAfter !== session.ratingAfter || updated.ratingBefore !== session.ratingBefore) {
        changed = true;
      }
      return updated;
    });

  if (!changed) return { sessions, settings, changed: false };
  return {
    sessions: recalibrated,
    settings: {
      ...settings,
      eloByMode: nextEloByMode
    },
    changed: true
  };
}
