import type { TrainingMode, TrainingProblem, TrainingSession } from "../../types";
import { TRAINING_MODES } from "./session";

const WRONG_PENALTY_SECONDS = 300;

export interface TrainingTotalResult {
  point: number;
  penalties: number;
  lastUpdatedEpochSecond: number;
}

export function calcTrainingTotalResult(problems: TrainingProblem[], start: number): TrainingTotalResult {
  let point = 0;
  let penalties = 0;
  let lastUpdatedEpochSecond = start;
  for (const problem of problems) {
    if (problem.solvedAt === undefined) break;
    point += problem.point;
    penalties += problem.wrongAttempts;
    lastUpdatedEpochSecond = Math.max(lastUpdatedEpochSecond, problem.solvedAt);
  }
  return { point, penalties, lastUpdatedEpochSecond };
}

export function compareTrainingResults(a: TrainingTotalResult, b: TrainingTotalResult): number {
  if (a.point !== b.point) return b.point - a.point;
  const aPenalty = a.lastUpdatedEpochSecond + a.penalties * WRONG_PENALTY_SECONDS;
  const bPenalty = b.lastUpdatedEpochSecond + b.penalties * WRONG_PENALTY_SECONDS;
  if (aPenalty !== bPenalty) return aPenalty - bPenalty;
  return a.penalties - b.penalties;
}

export function estimateTrainingPerformance(session: TrainingSession): number {
  const standings = [
    { rating: Number.NaN, result: calcTrainingTotalResult(session.problems, session.startedAt) },
    ...makeBotResults(session)
  ].sort((a, b) => compareTrainingResults(a.result, b.result));
  const userIndex = standings.findIndex((entry) => Number.isNaN(entry.rating));
  const performances = calculatePerformances(
    standings.filter((entry) => !Number.isNaN(entry.rating)).map((entry) => entry.rating)
  );
  const lower = performances[Math.max(0, userIndex - 1)];
  const upper = performances[Math.min(performances.length - 1, userIndex)];
  if (lower !== undefined && upper !== undefined) return Math.round((lower + upper) / 2);
  return lower ?? upper ?? session.targetRating;
}

export function calibrateTrainingPerformance(rawPerformance: number, session: TrainingSession): number {
  const factor = session.mode === "consistency-1h" ? 0.55 : 0.7;
  return Math.round(session.targetRating + (rawPerformance - session.targetRating) * factor);
}

export function updateTrainingElo(current: number, performance: number, mode: TrainingMode): number {
  const blend = mode === "consistency-1h" ? 0.1 : 0.15;
  const unclampedDelta = Math.round((performance - current) * blend);
  const clamp = TRAINING_MODES[mode].clamp;
  return current + Math.max(-clamp, Math.min(clamp, unclampedDelta));
}

function makeBotResults(session: TrainingSession): Array<{ rating: number; result: TrainingTotalResult }> {
  const bots: Array<{ rating: number; result: TrainingTotalResult }> = [];
  for (let rating = -1000; rating <= 4000; rating += 25) {
    const rng = mulberry32(hashString(`${session.id}:${rating}`));
    let currentTime = session.startedAt;
    const botProblems: TrainingProblem[] = [];
    for (const problem of session.problems) {
      const probability = predictSolveProbability(problem.difficulty, rating);
      const meanSeconds = predictSolveSeconds(problem, rating, session.durationSeconds);
      if (rng() > probability) {
        botProblems.push({ ...problem, solvedAt: undefined, wrongAttempts: Math.floor(rng() * 3), unlocked: true });
        continue;
      }
      const solveSeconds = Math.max(30, logNormal(Math.log(meanSeconds), Math.sqrt(problem.variance ?? 0.2), rng));
      if (currentTime + solveSeconds > session.startedAt + session.durationSeconds) {
        botProblems.push({ ...problem, solvedAt: undefined, wrongAttempts: Math.floor(rng() * 3), unlocked: true });
        continue;
      }
      currentTime += solveSeconds;
      botProblems.push({
        ...problem,
        solvedAt: Math.round(currentTime),
        wrongAttempts: Math.floor(rng() * 2),
        unlocked: true
      });
    }
    bots.push({ rating, result: calcTrainingTotalResult(botProblems, session.startedAt) });
  }
  return bots;
}

function calculatePerformances(participantRawRatings: number[]): number[] {
  const perfs: number[] = [];
  for (let position = 0; position < participantRawRatings.length; position++) {
    let ub = 10000;
    let lb = -10000;
    while (Math.round(lb) < Math.round(ub)) {
      const middle = (lb + ub) / 2;
      const predictedRank = participantRawRatings.reduce(
        (sum, rating) => sum + 1 / (1 + 6 ** ((middle - rating) / 400)),
        0
      );
      if (predictedRank < position + 0.5) ub = middle;
      else lb = middle;
    }
    perfs.push(Math.round(lb));
  }
  return perfs;
}

function predictSolveProbability(difficulty: number, rating: number): number {
  return 1 / (1 + 6 ** ((difficulty - rating) / 400));
}

function predictSolveSeconds(problem: TrainingProblem, rating: number, durationSeconds: number): number {
  if (typeof problem.slope === "number" && typeof problem.intercept === "number") {
    const seconds = Math.exp(problem.slope * rating + problem.intercept);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(durationSeconds * 0.7, Math.max(30, seconds));
  }
  const ratio = 1 / Math.max(0.08, predictSolveProbability(problem.difficulty, rating));
  return Math.min(durationSeconds * 0.7, Math.max(90, 280 * ratio));
}

function logNormal(mean: number, sigma: number, rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
  return Math.exp(mean + sigma * normal);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
