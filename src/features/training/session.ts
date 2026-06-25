import type { ContestType, ProblemRow, TrainingMode, TrainingProblem, TrainingSession, TrainingSettings } from "../../types";
import { TRAINING_MODES } from "../../shared/training-modes";

export { TRAINING_MODES };

const DIFFICULTY_WINDOW = 80;

export function roundTrainingTarget(rating: number): number {
  return Math.max(400, Math.round(rating / 100) * 100);
}

export function createTrainingSettings(username: string, officialRating: number | null, now: number): TrainingSettings {
  const initial = typeof officialRating === "number" && Number.isFinite(officialRating) ? officialRating : 400;
  return {
    schemaVersion: 1,
    username,
    eloByMode: { "ladder-2h": initial, "consistency-1h": initial },
    contestTypes: ["ABC", "ARC", "AGC"],
    initializedFrom: { type: officialRating === null ? "default" : "atcoder-rating", value: initial, at: now }
  };
}

export function generateTrainingSession(
  mode: TrainingMode,
  username: string,
  targetRating: number,
  rows: ProblemRow[],
  usedProblemIds: Set<string>,
  now: number,
  contestTypes: ContestType[] = ["ABC", "ARC", "AGC"]
): TrainingSession {
  const config = TRAINING_MODES[mode];
  const selectedTypes = new Set(contestTypes.length > 0 ? contestTypes : ["ABC", "ARC", "AGC"]);
  const selected: TrainingProblem[] = [];
  const selectedIds = new Set<string>();

  for (let order = 0; order < config.offsets.length; order++) {
    const offset = config.offsets[order] ?? 0;
    const targetDifficulty = Math.max(0, targetRating + offset);
    const candidates = rows
      .filter((row) => row.difficulty !== null && selectedTypes.has(row.contestType) && !row.solved && !selectedIds.has(row.problem.id))
      .map((row) => ({
        row,
        score: Math.abs((row.difficulty ?? 0) - targetDifficulty) + (usedProblemIds.has(row.problem.id) ? 10000 : 0)
      }))
      .filter(({ row, score }) => score < 10000 || Math.abs((row.difficulty ?? 0) - targetDifficulty) <= DIFFICULTY_WINDOW * 4)
      .sort((a, b) => a.score - b.score || (b.row.startEpochSecond ?? 0) - (a.row.startEpochSecond ?? 0));
    const picked = candidates[0]?.row;
    if (!picked || picked.difficulty === null) throw new Error(`No available rated problem near ${targetDifficulty}`);
    selectedIds.add(picked.problem.id);
    selected.push({
      problemId: picked.problem.id,
      contestId: picked.problem.contest_id,
      title: picked.problem.title,
      difficulty: picked.difficulty,
      targetDifficulty,
      targetOffset: offset,
      point: typeof picked.problem.point === "number" ? picked.problem.point : 100,
      rawDifficulty: picked.model?.rawDifficulty,
      slope: picked.model?.slope,
      intercept: picked.model?.intercept,
      variance: picked.model?.variance,
      order,
      unlocked: order === 0,
      wrongAttempts: 0
    });
  }
  return {
    id: `${mode}:${username}:${now}`,
    mode,
    username,
    startedAt: now,
    durationSeconds: config.durationSeconds,
    targetRating,
    problems: selected,
    rawSubmissions: [],
    manualRefreshAvailableAt: now
  };
}
