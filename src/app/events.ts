import { DEFAULT_FILTERS } from "../features/problemset";
import type { TrainingMode } from "../types";
import { EXTENSION_PATHS, isActiveTab } from "./router";
import type { AppState } from "./state";
import { isContestTypeString, readFiltersFromForm } from "./forms";
import { updateChartPan, updateChartZoom, type ChartDragState, type ChartViewport } from "./chart-viewport";

export interface AppEventHandlers {
  syncRouteToView(): void;
  renderApp(): void;
  recalculate(): void;
  saveFilters(): void;
  saveTrainingState(): void;
  pickRandomUnsolvedFromCurrentPage(): void;
  startTraining(mode: TrainingMode): void;
  refreshTraining(ignoreRateLimit: boolean): void;
  finishTraining(): void;
  cancelTrainingWithoutRating(): void;
  exportTrainingJson(): void;
  resetTrainingHistory(): void;
  importTrainingJson(file: File): void;
  updateManualUsername(username: string): void;
  loginToAtCoder(): void;
  logoutFromAtCoder(): void;
  clearDesktopCache(): void;
  switchDesktopAccount(): void;
  getChartViewport(): ChartViewport;
  setChartViewport(viewport: ChartViewport): void;
}

export function bindAppEvents(
  root: HTMLElement,
  state: AppState,
  isStandalone: boolean,
  handlers: AppEventHandlers
): void {
  let chartDrag: ChartDragState | null = null;

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLAnchorElement>("[data-acps-tab]");
    if (!tab) return;

    event.preventDefault();
    state.activeTab = isActiveTab(tab.dataset.acpsTab) ? tab.dataset.acpsTab : "problemset";
    history.pushState({ atcoderProblemsetTab: state.activeTab }, "", EXTENSION_PATHS[state.activeTab]);
    handlers.syncRouteToView();
    handlers.renderApp();
  });

  window.addEventListener("popstate", () => {
    handlers.syncRouteToView();
    handlers.renderApp();
  });

  root.addEventListener("submit", (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>("[data-acps-filter-form]");
    if (!form) return;

    event.preventDefault();
    state.filters = { ...readFiltersFromForm(form, state.filters.page), page: 1 };
    state.noticeMessage = "";
    handlers.saveFilters();
    handlers.recalculate();
    handlers.renderApp();
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest("[data-acps-reset]")) return;

    state.filters = { ...DEFAULT_FILTERS };
    state.noticeMessage = "";
    handlers.saveFilters();
    handlers.recalculate();
    handlers.renderApp();
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const pageButton = target.closest<HTMLButtonElement>("[data-acps-page]");
    if (!pageButton) return;

    const nextPage = Number(pageButton.dataset.acpsPage);
    if (!Number.isFinite(nextPage)) return;

    state.filters = { ...state.filters, page: nextPage };
    state.noticeMessage = "";
    handlers.saveFilters();
    handlers.renderApp();
  });

  root.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("[data-acps-random]")) return;
    handlers.pickRandomUnsolvedFromCurrentPage();
  });

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-acps-start-training]");
    if (!button) return;
    const mode = button.dataset.acpsStartTraining;
    if (mode !== "ladder-2h" && mode !== "consistency-1h") return;
    handlers.startTraining(mode);
  });

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-acps-refresh-training]");
    if (!button) return;
    handlers.refreshTraining(false);
  });

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-acps-end-training]");
    if (!button) return;
    handlers.finishTraining();
  });

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-acps-cancel-training]");
    if (!button) return;
    handlers.cancelTrainingWithoutRating();
  });

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-acps-progress-mode]");
    if (!button) return;
    const mode = button.dataset.acpsProgressMode;
    if (mode !== "all" && mode !== "ladder-2h" && mode !== "consistency-1h") return;
    state.progressMode = mode;
    handlers.renderApp();
  });

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-acps-chart-zoom]");
    if (!button) return;
    handlers.setChartViewport(updateChartZoom(handlers.getChartViewport(), button.dataset.acpsChartZoom));
    handlers.renderApp();
  });

  root.addEventListener("pointerdown", (event) => {
    const chart = (event.target as HTMLElement).closest<SVGSVGElement>("[data-acps-rating-chart]");
    if (!chart || handlers.getChartViewport().zoom <= 1) return;
    chartDrag = { startX: event.clientX, startPan: handlers.getChartViewport().pan };
    chart.setPointerCapture(event.pointerId);
    chart.classList.add("is-dragging");
  });

  root.addEventListener("pointermove", (event) => {
    const viewport = handlers.getChartViewport();
    if (!chartDrag || viewport.zoom <= 1) return;
    const chart = (event.target as HTMLElement).closest<SVGSVGElement>("[data-acps-rating-chart]");
    handlers.setChartViewport(updateChartPan(viewport, chartDrag, event.clientX, chart?.clientWidth || 1));
    handlers.renderApp();
  });

  root.addEventListener("pointerup", (event) => {
    const chart = (event.target as HTMLElement).closest<SVGSVGElement>("[data-acps-rating-chart]");
    chart?.classList.remove("is-dragging");
    chartDrag = null;
  });

  root.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("[data-acps-export-training]")) return;
    handlers.exportTrainingJson();
  });

  root.addEventListener("change", (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-acps-training-contest-type]");
    if (!input || !state.trainingSettings) return;
    const checked = Array.from(root.querySelectorAll<HTMLInputElement>("[data-acps-training-contest-type]:checked"))
      .map((checkbox) => checkbox.value)
      .filter(isContestTypeString);
    state.trainingSettings = {
      ...state.trainingSettings,
      contestTypes: checked.length > 0 ? checked : ["ABC", "ARC", "AGC"]
    };
    handlers.saveTrainingState();
    handlers.renderApp();
  });

  root.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("[data-acps-import-trigger]")) return;
    root.querySelector<HTMLInputElement>("[data-acps-import-training]")?.click();
  });

  root.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement).closest("[data-acps-reset-training]")) return;
    handlers.resetTrainingHistory();
  });

  root.addEventListener("change", (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-acps-import-training]");
    if (!input?.files?.[0]) return;
    handlers.importTrainingJson(input.files[0]);
    input.value = "";
  });

  root.addEventListener("submit", (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>("[data-acps-manual-user]");
    if (!form) return;
    event.preventDefault();
    handlers.updateManualUsername(String(new FormData(form).get("username") ?? "").trim());
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-acps-login]")) handlers.loginToAtCoder();
    if (target.closest("[data-acps-logout]")) handlers.logoutFromAtCoder();
    if (target.closest("[data-acps-clear-cache]")) handlers.clearDesktopCache();
    if (target.closest("[data-acps-switch-account]")) handlers.switchDesktopAccount();
  });

  if (isStandalone) {
    root.addEventListener("click", (event) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="https://atcoder.jp/"]');
      if (!link) return;
      event.preventDefault();
      window.open(link.href, "_blank", "noopener");
    });
  }
}
