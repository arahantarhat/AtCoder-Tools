import { CONTEST_TYPES, type ContestType, type Filters, type ProblemRow, type SortOrder } from "../../types";

export const DEFAULT_FILTERS: Filters = {
  minDifficulty: 800,
  maxDifficulty: 1600,
  contestTypes: [...CONTEST_TYPES],
  solvedStatus: "all",
  sortOrder: "date_desc",
  query: "",
  page: 1
};

export function applyFilters(rows: ProblemRow[], filters: Filters): ProblemRow[] {
  const query = filters.query.trim().toLowerCase();
  const selectedTypes = new Set(filters.contestTypes);
  return rows
    .filter((row) => {
      if (!selectedTypes.has(row.contestType) || row.difficulty === null) return false;
      if (row.difficulty < filters.minDifficulty || row.difficulty > filters.maxDifficulty) return false;
      if (filters.solvedStatus === "solved" && !row.solved) return false;
      if (filters.solvedStatus === "unsolved" && row.solved) return false;
      if (!query) return true;
      return [row.problem.id, row.problem.title, row.problem.contest_id, row.contest?.title ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => compareRows(a, b, filters.sortOrder));
}

export function countUnratedInScope(rows: ProblemRow[], filters: Filters): number {
  const selectedTypes = new Set(filters.contestTypes);
  return rows.filter((row) => selectedTypes.has(row.contestType) && row.difficulty === null).length;
}

export function normalizeFilters(value: unknown): Filters {
  if (!value || typeof value !== "object") return { ...DEFAULT_FILTERS };
  const candidate = value as Partial<Filters>;
  return {
    minDifficulty: typeof candidate.minDifficulty === "number" ? candidate.minDifficulty : DEFAULT_FILTERS.minDifficulty,
    maxDifficulty: typeof candidate.maxDifficulty === "number" ? candidate.maxDifficulty : DEFAULT_FILTERS.maxDifficulty,
    contestTypes: Array.isArray(candidate.contestTypes) && candidate.contestTypes.every(isContestType)
      ? candidate.contestTypes
      : [...CONTEST_TYPES],
    solvedStatus: candidate.solvedStatus === "solved" || candidate.solvedStatus === "unsolved" ? candidate.solvedStatus : "all",
    sortOrder: isSortOrder(candidate.sortOrder) ? candidate.sortOrder : DEFAULT_FILTERS.sortOrder,
    query: typeof candidate.query === "string" ? candidate.query : "",
    page: typeof candidate.page === "number" && candidate.page >= 1 ? candidate.page : 1
  };
}

export function isContestType(value: unknown): value is ContestType {
  return typeof value === "string" && CONTEST_TYPES.includes(value as ContestType);
}

export function isSortOrder(value: unknown): value is SortOrder {
  return value === "date_desc" || value === "date_asc" || value === "difficulty_asc" || value === "difficulty_desc";
}

function compareRows(a: ProblemRow, b: ProblemRow, sortOrder: Filters["sortOrder"]): number {
  if (sortOrder === "date_asc" || sortOrder === "date_desc") {
    const direction = sortOrder === "date_desc" ? -1 : 1;
    const aDate = a.startEpochSecond ?? Number.NEGATIVE_INFINITY;
    const bDate = b.startEpochSecond ?? Number.NEGATIVE_INFINITY;
    if (aDate !== bDate) return (aDate - bDate) * direction;
  }
  if (sortOrder === "difficulty_asc" || sortOrder === "difficulty_desc") {
    const direction = sortOrder === "difficulty_desc" ? -1 : 1;
    const aDifficulty = a.difficulty ?? Number.POSITIVE_INFINITY;
    const bDifficulty = b.difficulty ?? Number.POSITIVE_INFINITY;
    if (aDifficulty !== bDifficulty) return (aDifficulty - bDifficulty) * direction;
  }
  if (b.problem.contest_id !== a.problem.contest_id) {
    return b.problem.contest_id.localeCompare(a.problem.contest_id, undefined, { numeric: true });
  }
  return a.problem.id.localeCompare(b.problem.id, undefined, { numeric: true });
}
