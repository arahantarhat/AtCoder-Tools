import type { OfficialRatingPoint, ProblemRow, TrainingMode, TrainingSession, TrainingSettings } from "../../types";
import { calibrateTrainingPerformance, estimateTrainingPerformance, updateTrainingElo } from "./rating";
import { generateTrainingSession, roundTrainingTarget } from "./session";

export class TrainingController {
  start(
    mode: TrainingMode,
    username: string,
    settings: TrainingSettings,
    rows: ProblemRow[],
    sessions: TrainingSession[],
    now: number
  ): TrainingSession {
    const used = new Set(sessions.flatMap((session) => session.problems.map((problem) => problem.problemId)));
    return generateTrainingSession(
      mode,
      username,
      roundTrainingTarget(settings.eloByMode[mode]),
      rows,
      used,
      now,
      settings.contestTypes
    );
  }

  complete(session: TrainingSession, ratingBefore: number): TrainingSession {
    const performance = calibrateTrainingPerformance(estimateTrainingPerformance(session), session);
    return { ...session, performance, ratingBefore, ratingAfter: updateTrainingElo(ratingBefore, performance, session.mode) };
  }

  officialRatingAtOrBefore(history: OfficialRatingPoint[], epochSecond: number): number | undefined {
    return history
      .filter((point) => point.epochSecond <= epochSecond)
      .sort((a, b) => b.epochSecond - a.epochSecond)[0]?.rating ?? history[history.length - 1]?.rating;
  }
}
