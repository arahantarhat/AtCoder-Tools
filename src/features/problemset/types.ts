import type { Contest, Problem, ProblemModel } from "../../services/atcoder/types";
export { CONTEST_TYPES, type ContestType } from "../../shared/contest-types";
import type { ContestType } from "../../shared/contest-types";
export type SolvedStatus = "all" | "solved" | "unsolved";
export type SortOrder = "date_desc" | "date_asc" | "difficulty_asc" | "difficulty_desc";

export interface Filters {
  minDifficulty: number;
  maxDifficulty: number;
  contestTypes: ContestType[];
  solvedStatus: SolvedStatus;
  sortOrder: SortOrder;
  query: string;
  page: number;
}

export interface ProblemRow {
  problem: Problem;
  contest: Contest | undefined;
  contestType: ContestType;
  difficulty: number | null;
  model: ProblemModel | undefined;
  startEpochSecond: number | null;
  solved: boolean;
}
