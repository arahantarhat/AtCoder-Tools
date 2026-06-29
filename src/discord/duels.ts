import type { Duel, DuelResult } from "./types";

export const DUEL_PENDING_TTL_SECONDS = 15 * 60;
export const DUEL_ACTIVE_TTL_SECONDS = 24 * 60 * 60;
export const DUEL_UNRATED_DEFAULT = 1200;

export interface DuelEloChange {
  ratingAAfter: number;
  ratingBAfter: number;
  deltaA: number;
  deltaB: number;
}

export interface DuelCompletion {
  result: DuelResult;
  winnerUserId?: string | undefined;
  challengerScore: number;
  challengerSolvedAt?: number | undefined;
  targetSolvedAt?: number | undefined;
}

export type DuelComparison =
  | { status: "pending_judgement" }
  | { status: "active"; reason: "nobody_solved" | "higher_window_open"; remainingSeconds?: number | undefined }
  | { status: "expired" }
  | ({ status: "completed" } & DuelCompletion);

export function calculateDuelElo(ratingA: number, ratingB: number, scoreA: number): DuelEloChange {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const deltaA = Math.round(60 * (scoreA - expectedA));
  const deltaB = deltaA === 0 ? 0 : -deltaA;
  return {
    ratingAAfter: ratingA + deltaA,
    ratingBAfter: ratingB + deltaB,
    deltaA,
    deltaB
  };
}

export function calculateHandicapCoefficient(problemRating: number, lowerRating: number, higherRating: number): number {
  if (lowerRating === higherRating) return 1;
  const pLow = 1 / (1 + 10 ** ((problemRating - lowerRating) / 1000));
  const pHigh = 1 / (1 + 10 ** ((problemRating - higherRating) / 1000));
  return clamp(pHigh / pLow, 1 / 3, 3);
}

export function compareDuelSolves(input: {
  duel: Duel;
  challengerSolvedAt?: number | undefined;
  targetSolvedAt?: number | undefined;
  hasPendingJudgement: boolean;
  now: number;
}): DuelComparison {
  const { duel, challengerSolvedAt, targetSolvedAt, hasPendingJudgement, now } = input;
  if (!duel.acceptedAt || !duel.expiresAt || !duel.lowerRatedUserId || !duel.higherRatedUserId || !duel.handicapCoefficient) {
    return { status: "active", reason: "nobody_solved" };
  }

  const lowerSolvedAt = duel.lowerRatedUserId === duel.challengerUserId ? challengerSolvedAt : targetSolvedAt;
  const higherSolvedAt = duel.higherRatedUserId === duel.challengerUserId ? challengerSolvedAt : targetSolvedAt;
  const lowerIsChallenger = duel.lowerRatedUserId === duel.challengerUserId;

  if (lowerSolvedAt && !higherSolvedAt) {
    return completed(lowerIsChallenger ? "challenger_win" : "target_win", duel.lowerRatedUserId, lowerIsChallenger ? 1 : 0, challengerSolvedAt, targetSolvedAt);
  }

  if (lowerSolvedAt && higherSolvedAt) {
    const lowerDuration = lowerSolvedAt - duel.acceptedAt;
    const higherAdjustedDuration = (higherSolvedAt - duel.acceptedAt) * duel.handicapCoefficient;
    const difference = lowerDuration - higherAdjustedDuration;
    if (Math.abs(difference) < 1e-9) {
      return completed("draw", undefined, 0.5, challengerSolvedAt, targetSolvedAt);
    }
    const lowerWins = difference < 0;
    const winnerUserId = lowerWins ? duel.lowerRatedUserId : duel.higherRatedUserId;
    const challengerWon = winnerUserId === duel.challengerUserId;
    return completed(challengerWon ? "challenger_win" : "target_win", winnerUserId, challengerWon ? 1 : 0, challengerSolvedAt, targetSolvedAt);
  }

  if (higherSolvedAt) {
    const higherAdjustedDuration = Math.ceil((higherSolvedAt - duel.acceptedAt) * duel.handicapCoefficient);
    const lowerDeadline = duel.acceptedAt + higherAdjustedDuration;
    const remainingSeconds = lowerDeadline - now;
    if (remainingSeconds > 0) {
      if (hasPendingJudgement) return { status: "pending_judgement" };
      if (now >= duel.expiresAt) return { status: "expired" };
      return { status: "active", reason: "higher_window_open", remainingSeconds };
    }
    const challengerWon = duel.higherRatedUserId === duel.challengerUserId;
    return completed(challengerWon ? "challenger_win" : "target_win", duel.higherRatedUserId, challengerWon ? 1 : 0, challengerSolvedAt, targetSolvedAt);
  }

  if (hasPendingJudgement) return { status: "pending_judgement" };
  if (now >= duel.expiresAt) return { status: "expired" };
  return { status: "active", reason: "nobody_solved" };
}

export function duelResultLabel(result: DuelResult | undefined, perspectiveUserId: string | undefined, winnerUserId?: string | undefined): string {
  if (result === "draw") return "draw";
  if (result === "expired") return "expired";
  if (!result || !winnerUserId || !perspectiveUserId) return result ?? "unknown";
  return winnerUserId === perspectiveUserId ? "win" : "loss";
}

function completed(
  result: Exclude<DuelResult, "expired">,
  winnerUserId: string | undefined,
  challengerScore: number,
  challengerSolvedAt?: number | undefined,
  targetSolvedAt?: number | undefined
): DuelComparison {
  return {
    status: "completed",
    result,
    winnerUserId,
    challengerScore,
    challengerSolvedAt,
    targetSolvedAt
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
