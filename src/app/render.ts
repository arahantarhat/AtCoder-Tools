import { PAGE_SIZE, renderFilterBox as renderProblemsetFilterBox, renderProblemset as renderProblemsetView } from "../features/problemset";
import { renderStats as renderStatsView } from "../features/stats";
import { renderTrainingView } from "../features/training";
import { renderProgressView } from "../features/progress";
import { escapeAttribute, escapeHtml } from "../shared/html";
import type { DesktopStatus } from "../platform/local-runtime";
import type { AppState } from "./state";

export interface RenderContext {
  chartZoom: number;
  chartPan: number;
  desktopStatus: DesktopStatus | null;
  origin: string;
  now: number;
}

export function renderAppLayout(
  state: AppState,
  context: RenderContext,
  onFiltersNormalized: (page: number) => void
): string {
  return `
    <div class="acps-layout">
      <main class="acps-main">
        ${renderMainTab(state, context, onFiltersNormalized)}
      </main>
      <aside class="acps-sidebar">
        ${state.activeTab === "problemset" || state.activeTab === "stats" ? renderProblemsetFilterBox(state.filters) : ""}
        ${renderSummaryBox(state)}
      </aside>
    </div>
  `;
}

function renderMainTab(
  state: AppState,
  context: RenderContext,
  onFiltersNormalized: (page: number) => void
): string {
  if (state.activeTab === "settings") return renderSettings(state, context);
  if (state.activeTab === "stats") return renderStatsView(state.stats);
  if (state.activeTab === "training") {
    return renderTrainingView({
      settings: state.trainingSettings,
      sessions: state.trainingSessions,
      activeSession: state.activeSession,
      noticeMessage: state.noticeMessage,
      now: context.now
    });
  }
  if (state.activeTab === "progress") {
    return renderProgressView({
      officialHistory: state.officialHistory,
      sessions: state.trainingSessions,
      settings: state.trainingSettings,
      mode: state.progressMode,
      zoom: context.chartZoom,
      pan: context.chartPan,
      noticeMessage: state.noticeMessage,
      now: context.now
    });
  }
  const totalPages = Math.max(1, Math.ceil(state.filteredRows.length / PAGE_SIZE));
  const page = Math.min(Math.max(state.filters.page, 1), totalPages);
  if (page !== state.filters.page) onFiltersNormalized(page);
  return renderProblemsetView({
    rows: state.filteredRows,
    filters: state.filters,
    noticeMessage: state.noticeMessage
  });
}

function renderSummaryBox(state: AppState): string {
  return `
    <div class="acps-filter-box">
      <div class="acps-side-title">Current Stats</div>
      <p><b>User:</b> ${escapeHtml(state.username)}</p>
      <p><b>Solved:</b> ${state.stats.solved} / ${state.stats.total}</p>
      <p><b>Unsolved:</b> ${state.stats.unsolved}</p>
      <p><b>Unrated excluded:</b> ${state.stats.unrated}</p>
    </div>
  `;
}

function renderSettings(state: AppState, context: RenderContext): string {
  const status = context.desktopStatus;
  const authLabel = status?.authenticated ? "Logged in through AtCoder" : "Public API mode";
  return `
    <section class="acps-table-box acps-settings">
      <div class="acps-box-title">Settings</div>
      ${state.noticeMessage ? `<div class="alert alert-info acps-notice">${escapeHtml(state.noticeMessage)}</div>` : ""}
      <div class="acps-settings-section">
        <h4>AtCoder account</h4>
        <p><b>Active username:</b> ${escapeHtml(state.username || "Not configured")}</p>
        <p><b>Authentication:</b> ${escapeHtml(authLabel)}</p>
        <div class="btn-group">
          <button class="btn btn-primary btn-sm" type="button" data-acps-login>${status?.authenticated ? "Refresh login" : "Log in to AtCoder"}</button>
          ${status?.authenticated ? `<button class="btn btn-default btn-sm" type="button" data-acps-logout>Log out</button>` : ""}
          <button class="btn btn-default btn-sm" type="button" data-acps-switch-account>Switch account</button>
        </div>
        <form class="acps-inline-form" data-acps-manual-user>
          <label for="acps-manual-username">Public API username</label>
          <div class="input-group">
            <input id="acps-manual-username" class="form-control input-sm" name="username" value="${escapeAttribute(state.username)}" required pattern="[A-Za-z0-9_]{1,32}">
            <span class="input-group-btn"><button class="btn btn-default btn-sm" type="submit">Use username</button></span>
          </div>
        </form>
      </div>
      <div class="acps-settings-section">
        <h4>Data</h4>
        <div class="btn-group">
          <button class="btn btn-default btn-sm" type="button" data-acps-clear-cache>Clear API cache</button>
          <button class="btn btn-default btn-sm" type="button" data-acps-export-training ${state.trainingSettings ? "" : "disabled"}>Export training JSON</button>
          <button class="btn btn-default btn-sm" type="button" data-acps-import-trigger>Import training JSON</button>
          <button class="btn btn-danger btn-sm" type="button" data-acps-reset-training ${state.username ? "" : "disabled"}>Reset training</button>
        </div>
        <input type="file" accept="application/json,.json" data-acps-import-training hidden>
      </div>
      <div class="acps-settings-section">
        <h4>Application</h4>
        <p><b>Server:</b> ${escapeHtml(status?.serverUrl ?? context.origin)}</p>
        <p><b>Version:</b> ${escapeHtml(status?.version ?? "development")}</p>
        <p>The local server runs only while the macOS application is open.</p>
      </div>
    </section>
  `;
}
