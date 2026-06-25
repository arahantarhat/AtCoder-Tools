import type { OfficialRatingPoint, ProgressMode, TrainingSession, TrainingSettings } from "../../types";
import { formatDate, formatShortDate, getDateTicks } from "../../shared/date-time";
import { escapeHtml } from "../../shared/html";
import { renderSessionHistory } from "../../shared/session-history-view";
import { getSolvedPrefixLength } from "../training";
import { makePath } from "./chart";
import { buildProgressTimeline } from "./timeline";
import type { TimelinePoint } from "./types";

export interface ProgressViewModel {
  officialHistory: OfficialRatingPoint[];
  sessions: TrainingSession[];
  settings: TrainingSettings | null;
  mode: ProgressMode;
  zoom: number;
  pan: number;
  noticeMessage: string;
  now: number;
}

export function renderProgressView(model: ProgressViewModel): string {
  const timeline = ensureSeedPoint(buildProgressTimeline(model.officialHistory, model.sessions, model.mode), model);
  return `<div class="acps-stats-grid">
    <section class="acps-table-box"><div class="acps-box-title">Progress</div>
      <div class="acps-progress-toolbar"><div class="btn-group btn-group-sm">
        ${modeButton(model.mode, "all", "All")}${modeButton(model.mode, "ladder-2h", "2h")}${modeButton(model.mode, "consistency-1h", "1h")}
      </div><div>
        <button class="btn btn-default btn-sm" type="button" data-acps-export-training>Export JSON</button>
        <button class="btn btn-default btn-sm" type="button" data-acps-import-trigger>Import JSON</button>
        <button class="btn btn-danger btn-sm" type="button" data-acps-reset-training>Reset training</button>
        <input type="file" accept="application/json,.json" data-acps-import-training hidden>
      </div></div>
      ${model.noticeMessage ? `<div class="alert alert-info acps-notice">${escapeHtml(model.noticeMessage)}</div>` : ""}
      <div class="acps-chart-toolbar"><span>Zoom ${model.zoom}x</span><div class="btn-group btn-group-sm">
        <button class="btn btn-default" type="button" data-acps-chart-zoom="out" ${model.zoom <= 1 ? "disabled" : ""}>-</button>
        <button class="btn btn-default" type="button" data-acps-chart-zoom="reset" ${model.zoom === 1 ? "disabled" : ""}>Reset</button>
        <button class="btn btn-default" type="button" data-acps-chart-zoom="in" ${model.zoom >= 8 ? "disabled" : ""}>+</button>
      </div></div>${renderRatingChart(timeline, model.zoom, model.pan)}
    </section>
    <section class="acps-table-box"><div class="acps-box-title">Training Sessions</div>${renderSessionHistory(model.sessions.slice().reverse(), { getSolvedPrefixLength })}</section>
  </div>`;
}

function ensureSeedPoint(points: TimelinePoint[], model: ProgressViewModel): TimelinePoint[] {
  if (!model.settings || points.some((point) => point.trainingRating !== undefined)) return points;
  const rating = model.mode === "ladder-2h"
    ? model.settings.eloByMode["ladder-2h"]
    : model.mode === "consistency-1h"
      ? model.settings.eloByMode["consistency-1h"]
      : Math.round((model.settings.eloByMode["ladder-2h"] + model.settings.eloByMode["consistency-1h"]) / 2);
  return [...points, {
    epochSecond: model.settings.initializedFrom?.at ?? model.now,
    trainingRating: rating,
    label: model.settings.initializedFrom?.type === "atcoder-rating" ? "Current AtCoder rating" : "Initial training ELO",
    mode: model.mode === "all" ? undefined : model.mode
  }].sort((a, b) => a.epochSecond - b.epochSecond);
}

function modeButton(active: ProgressMode, mode: ProgressMode, label: string): string {
  return `<button class="btn ${active === mode ? "btn-primary" : "btn-default"}" type="button" data-acps-progress-mode="${mode}">${label}</button>`;
}

function renderRatingChart(points: TimelinePoint[], zoom: number, pan: number): string {
  if (points.length === 0) return `<p class="acps-empty">No rating or training history yet.</p>`;
  const width = 760;
  const height = 300;
  const pad = 38;
  const bottomPad = 52;
  const fullMinTime = Math.min(...points.map((point) => point.epochSecond));
  const fullMaxTime = Math.max(...points.map((point) => point.epochSecond));
  const visibleSpan = Math.max(1, (fullMaxTime - fullMinTime) / zoom);
  const minTime = fullMinTime + Math.max(0, fullMaxTime - fullMinTime - visibleSpan) * pan;
  const maxTime = minTime + visibleSpan;
  const visiblePoints = points.filter((point) => point.epochSecond >= minTime && point.epochSecond <= maxTime);
  const ratings = points.flatMap((point) => [point.officialRating, point.trainingRating]).filter((value): value is number => typeof value === "number");
  const minRating = Math.max(0, Math.min(...ratings) - 100);
  const maxRating = Math.max(...ratings) + 100;
  const x = (epoch: number) => pad + ((epoch - minTime) / Math.max(1, maxTime - minTime)) * (width - pad * 2);
  const y = (rating: number) => height - bottomPad - ((rating - minRating) / Math.max(1, maxRating - minRating)) * (height - pad - bottomPad);
  const officialPath = makePath(visiblePoints.filter((point) => point.officialRating !== undefined).map((point) => [x(point.epochSecond), y(point.officialRating!)]));
  const trainingPath = makePath(visiblePoints.filter((point) => point.trainingRating !== undefined).map((point) => [x(point.epochSecond), y(point.trainingRating!)]));
  return `<div class="acps-chart-wrap"><svg class="acps-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Official and simulated training rating chart" data-acps-rating-chart>
    <line x1="${pad}" y1="${height - bottomPad}" x2="${width - pad}" y2="${height - bottomPad}" class="acps-axis"></line>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - bottomPad}" class="acps-axis"></line>
    <text x="${pad}" y="20">${Math.round(maxRating)}</text><text x="${pad}" y="${height - 8}">${Math.round(minRating)}</text>
    ${getDateTicks(minTime, maxTime, 4).map((tick) => `<line x1="${x(tick)}" y1="${height - bottomPad}" x2="${x(tick)}" y2="${height - bottomPad + 5}" class="acps-axis"></line><text x="${x(tick)}" y="${height - 28}" text-anchor="middle">${formatShortDate(tick)}</text>`).join("")}
    ${officialPath ? `<path d="${officialPath}" class="acps-line acps-line-official"></path>` : ""}${trainingPath ? `<path d="${trainingPath}" class="acps-line acps-line-training"></path>` : ""}
    ${visiblePoints.map((point) => point.officialRating === undefined ? "" : `<circle class="acps-point-official" cx="${x(point.epochSecond)}" cy="${y(point.officialRating)}" r="3"><title>${escapeHtml(point.label)} · ${formatDate(point.epochSecond)} · ${Math.round(point.officialRating)}</title></circle>`).join("")}
    ${visiblePoints.map((point) => point.trainingRating === undefined ? "" : `<circle class="acps-point-training" cx="${x(point.epochSecond)}" cy="${y(point.trainingRating)}" r="3"><title>${escapeHtml(point.label)} · ${formatDate(point.epochSecond)} · ${Math.round(point.trainingRating)}</title></circle>`).join("")}
  </svg><div class="acps-chart-legend"><span class="official">Official rating</span><span class="training">Simulated training ELO</span></div></div>`;
}
