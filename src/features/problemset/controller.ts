import type { Filters, ProblemRow } from "../../types";
import { applyFilters, countUnratedInScope } from "./filters";

export class ProblemsetController {
  constructor(
    private rows: ProblemRow[],
    private filters: Filters
  ) {}

  updateRows(rows: ProblemRow[]): void {
    this.rows = rows;
  }

  updateFilters(filters: Filters): void {
    this.filters = filters;
  }

  getFilteredRows(): ProblemRow[] {
    return applyFilters(this.rows, this.filters);
  }

  getUnratedCount(): number {
    return countUnratedInScope(this.rows, this.filters);
  }
}
