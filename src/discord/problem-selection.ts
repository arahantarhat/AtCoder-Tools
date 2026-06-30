import { buildProblemRows } from "../features/problemset";
import { roundTrainingTarget } from "../features/training";
import type { AtCoderDataset, ContestType, ProblemRow } from "../types";
import { pointsForDelta, normalizeGitgudDelta } from "./scoring";
import type { DifficultyColor, ProblemCategory, ProblemFilters, SelectedProblem } from "./types";

const COLOR_RANGES: Record<DifficultyColor, [number, number]> = {
  gray: [0, 399],
  brown: [400, 799],
  green: [800, 1199],
  cyan: [1200, 1599],
  blue: [1600, 1999],
  yellow: [2000, 2399],
  orange: [2400, 2799],
  red: [2800, 3199]
};

export function selectRandomProblem(dataset: AtCoderDataset, filters: ProblemFilters, seed = Math.random()): ProblemRow | null {
  const rows = filterProblemRows(buildProblemRows(dataset), filters);
  if (rows.length === 0) return null;
  return rows[Math.floor(seed * rows.length) % rows.length] ?? null;
}

export function selectRandomDuelProblem(
  challengerDataset: AtCoderDataset,
  targetDataset: AtCoderDataset,
  filters: ProblemFilters,
  seed = Math.random()
): ProblemRow | null {
  const rows = filterProblemRows(buildProblemRows(challengerDataset), filters);
  const targetSolvedIds = new Set(
    filters.unsolvedOnly === true
      ? buildProblemRows(targetDataset).filter((row) => row.solved).map((row) => row.problem.id)
      : []
  );
  const candidates = targetSolvedIds.size === 0
    ? rows
    : rows.filter((row) => !targetSolvedIds.has(row.problem.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(seed * candidates.length) % candidates.length] ?? null;
}

export function selectTrainingProblem(
  dataset: AtCoderDataset,
  trainingRating: number,
  requestedDelta: number,
  usedProblemIds: Set<string>,
  seed = Math.random()
): SelectedProblem | null {
  const targetDelta = normalizeGitgudDelta(requestedDelta);
  const targetDifficulty = roundTrainingTarget(trainingRating) + targetDelta;
  const rows = buildProblemRows(dataset)
    .filter((row) => row.difficulty !== null && !row.solved && !usedProblemIds.has(row.problem.id))
    .filter((row) => row.contestType === "ABC" || row.contestType === "ARC" || row.contestType === "AGC")
    .map((row) => ({
      row,
      score: Math.abs((row.difficulty ?? 0) - targetDifficulty)
    }))
    .filter(({ score }) => score <= 350)
    .sort((a, b) => a.score - b.score || (b.row.startEpochSecond ?? 0) - (a.row.startEpochSecond ?? 0));
  if (rows.length === 0) return null;
  const nearBest = rows.filter((entry) => entry.score <= (rows[0]?.score ?? 0) + 100);
  const picked = nearBest[Math.floor(seed * nearBest.length) % nearBest.length]?.row ?? rows[0]?.row;
  return picked ? { row: picked, targetDelta, points: pointsForDelta(targetDelta) } : null;
}

export function filterProblemRows(rows: ProblemRow[], filters: ProblemFilters): ProblemRow[] {
  const [colorMin, colorMax] = filters.color ? COLOR_RANGES[filters.color] : [undefined, undefined];
  const minDifficulty = filters.minDifficulty ?? colorMin;
  const maxDifficulty = filters.maxDifficulty ?? colorMax;
  const categories = new Set<ContestType>(filters.categories ?? []);
  const contestId = filters.contestId?.trim().toLowerCase();
  return rows
    .filter((row) => row.difficulty !== null)
    .filter((row) => minDifficulty === undefined || (row.difficulty ?? 0) >= minDifficulty)
    .filter((row) => maxDifficulty === undefined || (row.difficulty ?? 0) <= maxDifficulty)
    .filter((row) => filters.category === undefined || matchesProblemCategory(row, filters.category))
    .filter((row) => categories.size === 0 || categories.has(row.contestType))
    .filter((row) => !contestId || row.problem.contest_id.toLowerCase() === contestId)
    .filter((row) => filters.unsolvedOnly !== true || !row.solved)
    .filter((row) => withinContestNumber(row, filters.contestNumberMin, filters.contestNumberMax))
    .filter((row) => filters.afterEpochSecond === undefined || (row.startEpochSecond ?? 0) >= filters.afterEpochSecond)
    .filter((row) => filters.beforeEpochSecond === undefined || (row.startEpochSecond ?? Number.POSITIVE_INFINITY) <= filters.beforeEpochSecond)
    .sort((a, b) => (b.startEpochSecond ?? 0) - (a.startEpochSecond ?? 0));
}

function matchesProblemCategory(row: ProblemRow, category: ProblemCategory): boolean {
  const contestId = row.problem.contest_id.toLowerCase();
  if (category === "ABC") return row.contestType === "ABC" || /^adt/.test(contestId);
  return row.contestType === category;
}

function withinContestNumber(row: ProblemRow, min: number | undefined, max: number | undefined): boolean {
  if (min === undefined && max === undefined) return true;
  const number = Number(row.problem.contest_id.match(/\d+/)?.[0]);
  if (!Number.isFinite(number)) return false;
  return (min === undefined || number >= min) && (max === undefined || number <= max);
}
