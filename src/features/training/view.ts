import { CONTEST_TYPES, type TrainingMode, type TrainingSession, type TrainingSettings } from "../../types";
import { formatClock, formatDuration } from "../../shared/date-time";
import { escapeHtml } from "../../shared/html";
import { renderSessionHistory as renderSharedSessionHistory } from "../../shared/session-history-view";
import { renderDifficulty } from "../problemset";
import { getSolvedPrefixLength } from "./submissions";
import { roundTrainingTarget, TRAINING_MODES } from "./session";

const FREE_CANCEL_SECONDS = 10 * 60;

export interface TrainingViewModel {
  settings: TrainingSettings | null;
  sessions: TrainingSession[];
  activeSession: TrainingSession | undefined;
  noticeMessage: string;
  now: number;
}

export function renderTrainingView(model: TrainingViewModel): string {
  const ladderElo = model.settings?.eloByMode["ladder-2h"] ?? 400;
  const consistencyElo = model.settings?.eloByMode["consistency-1h"] ?? 400;
  if (!model.activeSession) {
    return `<div class="acps-stats-grid">
      <section class="acps-table-box"><div class="acps-box-title">Training</div>
        ${renderContestTypePicker(model.settings)}
        <div class="acps-training-actions">${renderStartCard("ladder-2h", ladderElo)}${renderStartCard("consistency-1h", consistencyElo)}</div>
      </section>
      <section class="acps-table-box"><div class="acps-box-title">Recent Sessions</div>${renderSessionHistory(model.sessions.slice(-8).reverse())}</section>
    </div>`;
  }
  const session = model.activeSession;
  const remaining = Math.max(0, session.startedAt + session.durationSeconds - model.now);
  const elapsed = Math.max(0, model.now - session.startedAt);
  const canRefresh = model.now >= (session.manualRefreshAvailableAt ?? 0);
  const canCancel = elapsed <= FREE_CANCEL_SECONDS;
  return `<div class="acps-stats-grid"><section class="acps-table-box">
    <div class="acps-box-title">Active ${TRAINING_MODES[session.mode].label}<span>${getSolvedPrefixLength(session)}/${session.problems.length} solved</span></div>
    <div class="acps-training-header">
      <div><strong>${formatDuration(remaining)}</strong><span>Remaining</span></div>
      <div><strong>${session.targetRating}</strong><span>Target</span></div>
      <div><strong>${formatClock(session.startedAt)}</strong><span>Started</span></div>
    </div>
    <div class="acps-training-toolbar">
      <button class="btn btn-default btn-sm" type="button" data-acps-refresh-training ${canRefresh ? "" : "disabled"}>Refresh submissions</button>
      <button class="btn btn-default btn-sm" type="button" data-acps-cancel-training ${canCancel ? "" : "disabled"}>Cancel no rating</button>
      <button class="btn btn-warning btn-sm" type="button" data-acps-end-training>End session</button>
    </div>
    ${canCancel ? `<div class="acps-training-help">Free cancel available for ${formatDuration(FREE_CANCEL_SECONDS - elapsed)}.</div>` : ""}
    ${model.noticeMessage ? `<div class="alert alert-info acps-notice">${escapeHtml(model.noticeMessage)}</div>` : ""}
    <div class="acps-training-problems">${session.problems.map((problem) => renderProblem(session, problem)).join("")}</div>
  </section></div>`;
}

export function renderSessionHistory(sessions: TrainingSession[]): string {
  return renderSharedSessionHistory(sessions, { getSolvedPrefixLength });
}

function renderContestTypePicker(settings: TrainingSettings | null): string {
  const selected = new Set(settings?.contestTypes ?? ["ABC", "ARC", "AGC"]);
  return `<div class="acps-training-type-picker"><span>Problem sources</span>${CONTEST_TYPES.map((type) => `
    <label class="checkbox-inline"><input type="checkbox" value="${type}" data-acps-training-contest-type ${selected.has(type) ? "checked" : ""}> ${type}</label>
  `).join("")}</div>`;
}

function renderStartCard(mode: TrainingMode, elo: number): string {
  const config = TRAINING_MODES[mode];
  return `<div class="acps-training-card"><h3>${escapeHtml(config.label)}</h3>
    <p><b>Training ELO:</b> ${Math.round(elo)}</p><p><b>Next target:</b> ${roundTrainingTarget(elo)}</p>
    <p><b>Sheet:</b> ${config.offsets.map((offset) => offset >= 0 ? `+${offset}` : String(offset)).join(" / ")}</p>
    <button class="btn btn-primary btn-sm" type="button" data-acps-start-training="${mode}">Start</button>
  </div>`;
}

function renderProblem(session: TrainingSession, problem: TrainingSession["problems"][number]): string {
  const url = `https://atcoder.jp/contests/${encodeURIComponent(problem.contestId)}/tasks/${encodeURIComponent(problem.problemId)}`;
  const solveMinute = problem.solvedAt === undefined ? "" : ` · ${Math.max(0, Math.floor((problem.solvedAt - session.startedAt) / 60))} min`;
  const status = problem.solvedAt !== undefined ? "AC" : problem.unlocked ? "Open" : "Locked";
  const link = problem.unlocked ? `<a href="${url}">Problem ${problem.order + 1}</a>` : `<span>Problem ${problem.order + 1}</span>`;
  return `<div class="acps-training-problem ${problem.solvedAt !== undefined ? "is-solved" : ""} ${problem.unlocked ? "" : "is-locked"}">
    <div class="acps-training-problem-top"><strong>${link}</strong><span>${status}${solveMinute}</span></div>
    <div>${escapeHtml(problem.title)}</div><div class="acps-training-meta">${renderDifficulty(problem.difficulty)}<span>Target ${problem.targetDifficulty}</span><span>WA ${problem.wrongAttempts}</span></div>
  </div>`;
}
