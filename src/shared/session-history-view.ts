import { formatDate, formatDuration } from "./date-time";
import { TRAINING_MODES } from "./training-modes";
import type { TrainingSession } from "../features/training/types";

export interface SessionHistoryRenderOptions {
  getSolvedPrefixLength(session: TrainingSession): number;
}

export function renderSessionHistory(sessions: TrainingSession[], options: SessionHistoryRenderOptions): string {
  if (sessions.length === 0) return `<p class="acps-empty">No training sessions yet.</p>`;
  return `<table class="table table-condensed acps-session-table">
    <thead><tr><th>Date</th><th>Mode</th><th>Solved</th><th>Times</th><th>Perf</th><th>ELO</th></tr></thead>
    <tbody>${sessions.map((session) => `<tr>
      <td>${formatDate(session.startedAt)}</td><td>${TRAINING_MODES[session.mode].label}</td>
      <td>${options.getSolvedPrefixLength(session)}/${session.problems.length}</td><td>${renderSolveTimes(session)}</td>
      <td>${session.performance === undefined ? "-" : Math.round(session.performance)}</td>
      <td>${session.ratingAfter === undefined ? "-" : Math.round(session.ratingAfter)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function renderSolveTimes(session: TrainingSession): string {
  return `<div class="acps-session-times">${session.problems.map((problem) =>
    problem.solvedAt === undefined
      ? `<span class="is-unsolved">(-:--)</span>`
      : `<span>(${formatDuration(problem.solvedAt - session.startedAt)})</span>`
  ).join("")}</div>`;
}
