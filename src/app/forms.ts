import { CONTEST_TYPES, type ContestType, type Filters, type SortOrder } from "../types";
import { DEFAULT_FILTERS } from "../features/problemset";

export function readFiltersFromForm(form: HTMLFormElement, currentPage: number): Filters {
  const formData = new FormData(form);
  const minDifficulty = Number(formData.get("minDifficulty"));
  const maxDifficulty = Number(formData.get("maxDifficulty"));
  const contestTypes = formData.getAll("contestType").filter(isContestType);
  const solvedStatus = String(formData.get("solvedStatus"));
  const sortOrder = String(formData.get("sortOrder"));

  return {
    minDifficulty: Number.isFinite(minDifficulty) ? minDifficulty : DEFAULT_FILTERS.minDifficulty,
    maxDifficulty: Number.isFinite(maxDifficulty) ? maxDifficulty : DEFAULT_FILTERS.maxDifficulty,
    contestTypes: contestTypes.length > 0 ? contestTypes : [...CONTEST_TYPES],
    solvedStatus: solvedStatus === "solved" || solvedStatus === "unsolved" ? solvedStatus : "all",
    sortOrder: isSortOrder(sortOrder) ? sortOrder : DEFAULT_FILTERS.sortOrder,
    query: String(formData.get("query") ?? ""),
    page: currentPage
  };
}

function isContestType(value: FormDataEntryValue): value is ContestType {
  return isContestTypeString(value);
}

export function isContestTypeString(value: unknown): value is ContestType {
  return typeof value === "string" && CONTEST_TYPES.includes(value as ContestType);
}

export function isSortOrder(value: unknown): value is SortOrder {
  return value === "date_desc" || value === "date_asc" || value === "difficulty_asc" || value === "difficulty_desc";
}
