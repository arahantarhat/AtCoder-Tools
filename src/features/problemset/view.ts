import { CONTEST_TYPES, type Filters, type ProblemRow } from "../../types";
import { getDifficultyColor, getDifficultyColorName } from "../../shared/difficulty";
import { escapeAttribute, escapeHtml } from "../../shared/html";

export const PAGE_SIZE = 100;

export interface ProblemsetViewModel {
  rows: ProblemRow[];
  filters: Filters;
  noticeMessage: string;
}

export function renderProblemset({ rows, filters, noticeMessage }: ProblemsetViewModel): string {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(filters.page, 1), totalPages);
  const pageRows = getCurrentPageRows(rows, page);
  return `
    <div class="acps-table-box">
      <div class="acps-box-title">Problems <span>${rows.length.toLocaleString()} found</span></div>
      <div class="acps-table-toolbar">
        <button type="button" class="btn btn-success btn-sm" data-acps-random>Random unsolved from this page</button>
      </div>
      ${noticeMessage ? `<div class="alert alert-info acps-notice">${escapeHtml(noticeMessage)}</div>` : ""}
      ${renderPagination(page, totalPages, rows.length)}
      <table class="table table-striped table-condensed acps-table">
        <thead><tr><th class="acps-status-col">Status</th><th class="acps-id-col">#</th><th>Name</th><th>Contest</th><th>Type</th><th class="acps-difficulty-col">Difficulty</th></tr></thead>
        <tbody>${pageRows.map(renderProblemRow).join("")}</tbody>
      </table>
      ${renderPagination(page, totalPages, rows.length)}
    </div>
  `;
}

export function renderFilterBox(filters: Filters): string {
  const typeCheckboxes = CONTEST_TYPES.map((type) => `
    <label class="checkbox-inline"><input type="checkbox" name="contestType" value="${type}" ${filters.contestTypes.includes(type) ? "checked" : ""}> ${type}</label>
  `).join("");
  return `
    <form class="acps-filter-box" data-acps-filter-form>
      <div class="acps-side-title">Filter Problems</div>
      <label>Search</label>
      <input class="form-control input-sm" name="query" value="${escapeAttribute(filters.query)}" placeholder="problem, contest">
      <label>Difficulty</label>
      <div class="acps-range">
        <input class="form-control input-sm" type="text" inputmode="numeric" pattern="[0-9]*" name="minDifficulty" value="${filters.minDifficulty}">
        <span>-</span>
        <input class="form-control input-sm" type="text" inputmode="numeric" pattern="[0-9]*" name="maxDifficulty" value="${filters.maxDifficulty}">
      </div>
      <label>Contest type</label>
      <div class="acps-checks">${typeCheckboxes}</div>
      <label>Solved status</label>
      <select class="form-control input-sm" name="solvedStatus">
        <option value="all" ${filters.solvedStatus === "all" ? "selected" : ""}>All</option>
        <option value="solved" ${filters.solvedStatus === "solved" ? "selected" : ""}>Solved</option>
        <option value="unsolved" ${filters.solvedStatus === "unsolved" ? "selected" : ""}>Unsolved</option>
      </select>
      <label>Sort</label>
      <select class="form-control input-sm" name="sortOrder">
        <option value="date_desc" ${filters.sortOrder === "date_desc" ? "selected" : ""}>Newest contest first</option>
        <option value="date_asc" ${filters.sortOrder === "date_asc" ? "selected" : ""}>Oldest contest first</option>
        <option value="difficulty_asc" ${filters.sortOrder === "difficulty_asc" ? "selected" : ""}>Difficulty low to high</option>
        <option value="difficulty_desc" ${filters.sortOrder === "difficulty_desc" ? "selected" : ""}>Difficulty high to low</option>
      </select>
      <div class="acps-actions">
        <button class="btn btn-primary btn-sm" type="submit">Apply</button>
        <button class="btn btn-default btn-sm" type="button" data-acps-reset>Reset</button>
      </div>
    </form>
  `;
}

export function getCurrentPageRows(rows: ProblemRow[], page: number): ProblemRow[] {
  const startIndex = (Math.max(page, 1) - 1) * PAGE_SIZE;
  return rows.slice(startIndex, startIndex + PAGE_SIZE);
}

export function getProblemUrl(row: ProblemRow): string {
  return `https://atcoder.jp/contests/${encodeURIComponent(row.problem.contest_id)}/tasks/${encodeURIComponent(row.problem.id)}`;
}

export function renderDifficulty(difficulty: number | null): string {
  if (difficulty === null) return `<span class="acps-diff acps-diff-unrated">Unrated</span>`;
  const color = getDifficultyColor(difficulty);
  return `<span class="acps-diff" style="--acps-diff-color: ${color}" title="Difficulty: ${difficulty} (${getDifficultyColorName(difficulty)})"><span class="acps-diff-dot" aria-hidden="true"></span><span>${difficulty}</span></span>`;
}

function renderPagination(page: number, totalPages: number, totalRows: number): string {
  if (totalRows === 0) return `<div class="acps-table-note">No problems match these filters.</div>`;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalRows);
  return `<div class="acps-pagination"><span>Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${totalRows.toLocaleString()}</span><div class="btn-group btn-group-sm">
    <button type="button" class="btn btn-default" data-acps-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button>
    ${getVisiblePages(page, totalPages).map((entry) => entry === "..." ? `<button type="button" class="btn btn-default" disabled>...</button>` : `<button type="button" class="btn ${entry === page ? "btn-primary" : "btn-default"}" data-acps-page="${entry}">${entry}</button>`).join("")}
    <button type="button" class="btn btn-default" data-acps-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Next</button>
  </div></div>`;
}

function getVisiblePages(page: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const sorted = [...new Set([1, totalPages, page, page - 1, page + 1])]
    .filter((candidate) => candidate >= 1 && candidate <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | "..."> = [];
  for (const candidate of sorted) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && candidate - previous > 1) result.push("...");
    result.push(candidate);
  }
  return result;
}

function renderProblemRow(row: ProblemRow): string {
  const url = getProblemUrl(row);
  return `<tr class="${row.solved ? "acps-solved-row" : ""}">
    <td class="acps-status-col">${row.solved ? '<span class="acps-ac">AC</span>' : ""}</td>
    <td class="acps-id-col"><a href="${url}">${escapeHtml(row.problem.id)}</a></td>
    <td><a href="${url}">${escapeHtml(row.problem.title)}</a></td>
    <td>${escapeHtml(row.contest?.title ?? row.problem.contest_id)}</td>
    <td>${row.contestType}</td><td class="acps-difficulty-col">${renderDifficulty(row.difficulty)}</td>
  </tr>`;
}
