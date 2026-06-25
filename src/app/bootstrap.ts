import {
  applyFilters,
  buildProblemRows,
  countUnratedInScope,
  DEFAULT_FILTERS,
  getCurrentPageRows,
  getProblemUrl,
  normalizeFilters,
  PAGE_SIZE,
  renderDifficulty,
} from "../features/problemset";
import { computeStats } from "../features/stats";
import {
  applyTrainingSubmissions,
  createTrainingSettings,
  generateTrainingSession,
  getSolvedPrefixLength,
  makeTrainingBackup,
  mergeSessions,
  normalizeTrainingBackup,
  roundTrainingTarget,
  TrainingRepository
} from "../features/training";
import { getDifficultyColor, getDifficultyColorName } from "../shared/difficulty";
import { escapeHtml } from "../shared/html";
import { formatClock } from "../shared/date-time";
import { AtCoderClient } from "../services/atcoder/client";
import { browserStorage } from "../platform/browser-storage";
import { runtimeMessenger } from "../platform/runtime-messaging";
import { desktopControl, type DesktopStatus } from "../platform/local-runtime";
import { EXTENSION_PATHS, getTabFromPath, type ActiveTab } from "./router";
import { createRoot, detectUsername, findMainContainer, injectNavItems, ROOT_ID } from "./shell";
import { createAppState } from "./state";
import { renderAppLayout } from "./render";
import { bindAppEvents } from "./events";
import {
  completeSessionRating,
  getPreviousModeRating,
  recalibrateTrainingSessions
} from "./training-workflow";
import {
  type AtCoderDataset,
  type Filters,
  type OfficialRatingPoint,
  type ProgressMode,
  type Submission,
  type TrainingMode,
  type TrainingSession,
} from "../types";

const STORAGE_FILTER_KEY = "atcoder-problemset:state.filters";
const AUTO_POLL_MS = 3 * 60 * 1000;
const MANUAL_REFRESH_MS = 60 * 1000;
const GRACE_POLL_MS = 2 * 60 * 1000;
const FREE_CANCEL_SECONDS = 10 * 60;
const atCoderClient = new AtCoderClient(runtimeMessenger);

const state = createAppState();
let chartZoom = 1;
let chartPan = 1;
let hostNodes: Node[] = [];
let pollTimer: number | undefined;
let tickTimer: number | undefined;
let desktopStatus: DesktopStatus | null = null;

const isStandalone = document.documentElement.hasAttribute("data-acps-standalone");

export async function bootstrap(): Promise<void> {
  if (isStandalone) {
    desktopStatus = await desktopControl.status();
    state.username = desktopStatus.username;
    document.documentElement.dataset.acpsUsername = state.username;
  } else {
    state.username = detectUsername();
  }
  state.filters = await loadFilters();
  injectShell();
  syncRouteToView();

  if (!state.username) {
    if (isStandalone) {
      state.activeTab = "settings";
      history.replaceState({ atcoderProblemsetTab: "settings" }, "", EXTENSION_PATHS.settings);
      syncRouteToView();
      renderApp();
    } else {
      renderLoginRequired();
    }
    return;
  }

  renderLoading();

  try {
    const dataset = await requestDataset(state.username);
    state.allRows = buildProblemRows(dataset);
    state.officialHistory = await requestRatingHistory(state.username);
    await loadTrainingState();
    await ensureTrainingSettings();
    await recalibrateCompletedSessions();
    recalculate();
    startSessionTimers();
    renderApp();
  } catch (error) {
    renderError(String(error));
  }
}

function injectShell(): void {
  if (document.getElementById(ROOT_ID)) return;

  const container = findMainContainer();
  hostNodes = Array.from(container.childNodes);

  const root = createRoot();

  container.append(root);
  injectNavItems();
  bindAppEvents(root, state, isStandalone, {
    syncRouteToView,
    renderApp,
    recalculate,
    saveFilters: () => void saveFilters(state.filters),
    saveTrainingState: () => void saveTrainingState(),
    pickRandomUnsolvedFromCurrentPage,
    startTraining: (mode) => void startTraining(mode),
    refreshTraining: (ignoreRateLimit) => void refreshTraining(ignoreRateLimit),
    finishTraining: () => void finishTraining(),
    cancelTrainingWithoutRating: () => void cancelTrainingWithoutRating(),
    exportTrainingJson,
    resetTrainingHistory: () => void resetTrainingHistory(),
    importTrainingJson: (file) => void importTrainingJson(file),
    updateManualUsername: (username) => void updateManualUsername(username),
    loginToAtCoder: () => void loginToAtCoder(),
    logoutFromAtCoder: () => void logoutFromAtCoder(),
    clearDesktopCache: () => void clearDesktopCache(),
    switchDesktopAccount: () => void switchDesktopAccount(),
    getChartViewport: () => ({ zoom: chartZoom, pan: chartPan }),
    setChartViewport: (viewport) => {
      chartZoom = viewport.zoom;
      chartPan = viewport.pan;
    }
  });
}

function syncRouteToView(): void {
  const routeTab = getTabFromPath(location.pathname);
  const root = document.getElementById(ROOT_ID);

  if (!routeTab) {
    setHostContentVisible(true);
    if (root) root.hidden = true;
    updateNavActiveState();
    return;
  }

  state.activeTab = routeTab;
  setHostContentVisible(false);
  if (root) root.hidden = false;
  updateNavActiveState();
}

function setHostContentVisible(visible: boolean): void {
  for (const node of hostNodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.id === ROOT_ID) continue;
    node.hidden = !visible;
  }
}

function recalculate(): void {
  state.filteredRows = applyFilters(state.allRows, state.filters);
  state.stats = computeStats(state.filteredRows, countUnratedInScope(state.allRows, state.filters));
}

function renderApp(): void {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  updateNavActiveState();

  const content = root.querySelector<HTMLElement>("[data-acps-content]");
  if (!content) return;

  content.innerHTML = renderAppLayout(state, {
    chartZoom,
    chartPan,
    desktopStatus,
    origin: location.origin,
    now: Math.floor(Date.now() / 1000)
  }, (page) => {
    state.filters = { ...state.filters, page };
    void saveFilters(state.filters);
  });
}

function updateNavActiveState(): void {
  const routeTab = getTabFromPath(location.pathname);
  if (routeTab) {
    document.querySelectorAll("#navbar-collapse .navbar-nav:first-child > li, .navbar .navbar-nav:first-child > li").forEach((item) => {
      item.classList.remove("active");
    });
  }

  document.querySelectorAll("[data-acps-tab]").forEach((tab) => {
    const isActive = routeTab !== null && (tab as HTMLElement).dataset.acpsTab === routeTab;
    tab.parentElement?.classList.toggle("active", isActive);
  });
}

function pickRandomUnsolvedFromCurrentPage(): void {
  const totalPages = Math.max(1, Math.ceil(state.filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(state.filters.page, 1), totalPages);
  const unsolvedRows = getCurrentPageRows(state.filteredRows, currentPage).filter((row) => !row.solved);
  if (unsolvedRows.length === 0) {
    state.noticeMessage = "All problems on this page have been completed. Move to another page to pick a random unsolved problem.";
    renderApp();
    return;
  }
  const selected = unsolvedRows[Math.floor(Math.random() * unsolvedRows.length)];
  if (!selected) return;
  state.noticeMessage = "";
  if (isStandalone) window.open(getProblemUrl(selected), "_blank", "noopener");
  else window.location.href = getProblemUrl(selected);
}

function renderLoginRequired(): void {
  setContent(`
    <div class="alert alert-warning acps-message">
      Log in to AtCoder to use the injected Problemset and Stats tabs.
    </div>
  `);
}

async function loginToAtCoder(): Promise<void> {
  state.noticeMessage = "Waiting for AtCoder login...";
  renderApp();
  try {
    desktopStatus = await desktopControl.login();
    await applyDesktopIdentity("AtCoder login updated.");
  } catch (error) {
    state.noticeMessage = String(error);
    renderApp();
  }
}

async function logoutFromAtCoder(): Promise<void> {
  desktopStatus = await desktopControl.logout();
  state.noticeMessage = "Logged out. Public API mode remains available.";
  renderApp();
}

async function updateManualUsername(username: string): Promise<void> {
  try {
    desktopStatus = await desktopControl.setUsername(username);
    await applyDesktopIdentity(`Using public data for ${username}.`);
  } catch (error) {
    state.noticeMessage = String(error);
    renderApp();
  }
}

async function switchDesktopAccount(): Promise<void> {
  if ((state.trainingSessions.length > 0 || state.activeSession) &&
      !window.confirm("Switching accounts requires deleting the current local training history. Export it first if needed. Continue and reset it now?")) {
    return;
  }
  if (state.username) {
    await resetTrainingHistory();
  }
  desktopStatus = await desktopControl.resetAccount();
  state.username = "";
  document.documentElement.dataset.acpsUsername = "";
  await loginToAtCoder();
}

async function clearDesktopCache(): Promise<void> {
  await desktopControl.clearCache();
  state.noticeMessage = "API cache cleared. Reloading data...";
  renderApp();
  if (state.username) await reloadDesktopData();
}

async function applyDesktopIdentity(message: string): Promise<void> {
  const username = desktopStatus?.username ?? "";
  if (!username) {
    state.noticeMessage = "No AtCoder username was detected.";
    renderApp();
    return;
  }
  state.username = username;
  document.documentElement.dataset.acpsUsername = username;
  state.noticeMessage = message;
  await reloadDesktopData();
}

async function reloadDesktopData(): Promise<void> {
  renderLoading();
  const dataset = await requestDataset(state.username);
  state.allRows = buildProblemRows(dataset);
  state.officialHistory = await requestRatingHistory(state.username);
  await loadTrainingState();
  await ensureTrainingSettings();
  recalculate();
  renderApp();
}

function renderLoading(): void {
  setContent(`<div class="alert alert-info acps-message">Loading Kenkoooo problem and submission data for ${escapeHtml(state.username)}...</div>`);
}

function renderError(error: string): void {
  setContent(`<div class="alert alert-danger acps-message">Failed to load AtCoder problemset data: ${escapeHtml(error)}</div>`);
}

function setContent(html: string): void {
  const content = document.querySelector<HTMLElement>(`#${ROOT_ID} [data-acps-content]`);
  if (content) content.innerHTML = html;
}

async function startTraining(mode: TrainingMode): Promise<void> {
  if (!state.trainingSettings) await ensureTrainingSettings();
  if (!state.trainingSettings || state.activeSession) return;

  try {
    const used = new Set(state.trainingSessions.flatMap((session) => session.problems.map((problem) => problem.problemId)));
    const target = roundTrainingTarget(state.trainingSettings.eloByMode[mode]);
    state.activeSession = generateTrainingSession(mode, state.username, target, state.allRows, used, Math.floor(Date.now() / 1000), state.trainingSettings.contestTypes);
    state.noticeMessage = "";
    await saveTrainingState();
    startSessionTimers();
    renderApp();
  } catch (error) {
    state.noticeMessage = String(error);
    renderApp();
  }
}

async function refreshTraining(ignoreRateLimit: boolean): Promise<void> {
  if (!state.activeSession) return;
  const now = Math.floor(Date.now() / 1000);
  if (!ignoreRateLimit && now < (state.activeSession.manualRefreshAvailableAt ?? 0)) return;

  const submissions = await requestRecentSubmissions(state.username, state.activeSession.startedAt - 60, state.activeSession);
  state.activeSession = applyTrainingSubmissions(state.activeSession, submissions);
  state.activeSession.lastPolledAt = now;
  state.activeSession.manualRefreshAvailableAt = now + MANUAL_REFRESH_MS / 1000;
  state.noticeMessage = `Submissions refreshed at ${formatClock(now)}.`;
  if (getSolvedPrefixLength(state.activeSession) === state.activeSession.problems.length) {
    state.activeSession.endedAt = now;
    state.noticeMessage = "All problems solved. Training session completed.";
    await finalizeActiveSession();
    renderApp();
    return;
  }
  await saveTrainingState();
  renderApp();
}

async function finishTraining(): Promise<void> {
  if (!state.activeSession || !state.trainingSettings) return;
  await refreshTraining(true);
  if (!state.activeSession || !state.trainingSettings) return;

  state.activeSession.endedAt = Math.floor(Date.now() / 1000);
  await finalizeActiveSession();
  renderApp();

  window.setTimeout(() => {
    void runGracePoll();
  }, GRACE_POLL_MS);
}

async function cancelTrainingWithoutRating(): Promise<void> {
  if (!state.activeSession) return;
  const now = Math.floor(Date.now() / 1000);
  if (now - state.activeSession.startedAt > FREE_CANCEL_SECONDS) {
    state.noticeMessage = "The no-rating cancel window has expired.";
    renderApp();
    return;
  }
  if (!window.confirm("Cancel this training round without saving it or changing ELO?")) return;
  state.activeSession = undefined;
  state.noticeMessage = "Training round canceled without rating impact.";
  stopSessionTimers();
  await saveTrainingState();
  renderApp();
}

async function runGracePoll(): Promise<void> {
  const last = state.trainingSessions[state.trainingSessions.length - 1];
  if (!last || last.gracePolledAt !== undefined) return;
  const submissions = await requestRecentSubmissions(state.username, last.startedAt - 60, last);
  const updated = applyTrainingSubmissions(last, submissions);
  updated.gracePolledAt = Math.floor(Date.now() / 1000);
  const index = state.trainingSessions.findIndex((session) => session.id === last.id);
  if (index >= 0) {
    state.trainingSessions[index] = completeSessionRating(
      updated,
      updated.ratingBefore ?? getPreviousModeRating(state.trainingSessions, state.trainingSettings, updated.mode)
    );
    await saveTrainingState();
    renderApp();
  }
}

async function finalizeActiveSession(): Promise<void> {
  if (!state.activeSession || !state.trainingSettings) return;
  const before = state.trainingSettings.eloByMode[state.activeSession.mode];
  const completed = completeSessionRating(state.activeSession, before);
  state.trainingSettings = {
    ...state.trainingSettings,
    eloByMode: {
      ...state.trainingSettings.eloByMode,
      [completed.mode]: completed.ratingAfter ?? before
    }
  };
  state.trainingSessions = [...state.trainingSessions.filter((session) => session.id !== completed.id), completed].sort((a, b) => a.startedAt - b.startedAt);
  state.activeSession = undefined;
  state.noticeMessage = "Training session saved.";
  await saveTrainingState();
  stopSessionTimers();
}

async function recalibrateCompletedSessions(): Promise<void> {
  const recalibrated = recalibrateTrainingSessions(state.trainingSessions, state.trainingSettings, state.officialHistory);
  if (!recalibrated.changed) return;
  state.trainingSessions = recalibrated.sessions;
  state.trainingSettings = recalibrated.settings;
  await saveTrainingState();
}

function startSessionTimers(): void {
  stopSessionTimers();
  if (!state.activeSession) return;
  tickTimer = window.setInterval(() => {
    if (state.activeTab === "training") renderApp();
    if (state.activeSession && Date.now() / 1000 >= state.activeSession.startedAt + state.activeSession.durationSeconds) {
      void finishTraining();
    }
  }, 1000);
  pollTimer = window.setInterval(() => {
    void refreshTraining(true);
  }, AUTO_POLL_MS);
}

function stopSessionTimers(): void {
  if (tickTimer !== undefined) window.clearInterval(tickTimer);
  if (pollTimer !== undefined) window.clearInterval(pollTimer);
  tickTimer = undefined;
  pollTimer = undefined;
}

async function requestDataset(user: string): Promise<AtCoderDataset> {
  return atCoderClient.getDataset(user);
}

async function requestRatingHistory(user: string): Promise<OfficialRatingPoint[]> {
  return atCoderClient.getRatingHistory(user);
}

async function requestRecentSubmissions(user: string, fromSecond: number, session: TrainingSession): Promise<Submission[]> {
  return atCoderClient.getRecentSubmissions(user, fromSecond, session);
}

async function loadFilters(): Promise<Filters> {
  const stored = await browserStorage.get(STORAGE_FILTER_KEY);
  return normalizeFilters(stored[STORAGE_FILTER_KEY]);
}

async function saveFilters(nextFilters: Filters): Promise<void> {
  await browserStorage.set({ [STORAGE_FILTER_KEY]: nextFilters });
}

async function loadTrainingState(): Promise<void> {
  const stored = await trainingRepository().load();
  state.trainingSettings = stored.settings;
  state.trainingSessions = stored.sessions;
  state.activeSession = stored.activeSession;
}

async function ensureTrainingSettings(): Promise<void> {
  const latest = state.officialHistory[state.officialHistory.length - 1];
  if (!state.trainingSettings || state.trainingSettings.username !== state.username) {
    state.trainingSettings = createTrainingSettings(state.username, latest?.rating ?? null, Math.floor(Date.now() / 1000));
    await saveTrainingState();
    return;
  }

  const latestTrainingTime = Math.max(0, ...state.trainingSessions.map((session) => session.endedAt ?? session.startedAt));
  if (latest && latest.epochSecond > latestTrainingTime) {
    state.trainingSettings = {
      ...state.trainingSettings,
      eloByMode: {
        "ladder-2h": latest.rating,
        "consistency-1h": latest.rating
      }
    };
  }
  await saveTrainingState();
}

async function saveTrainingState(): Promise<void> {
  await trainingRepository().save({
    settings: state.trainingSettings,
    sessions: state.trainingSessions,
    activeSession: state.activeSession
  });
}

function exportTrainingJson(): void {
  if (!state.trainingSettings) return;
  const backup = makeTrainingBackup(state.username, state.trainingSettings, state.trainingSessions, state.activeSession);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `atcoder-training-${state.username}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importTrainingJson(file: File): Promise<void> {
  const backup = normalizeTrainingBackup(JSON.parse(await file.text()));
  if (!backup) {
    state.noticeMessage = "Import failed: invalid training backup.";
    renderApp();
    return;
  }
  state.trainingSettings = backup.settings;
  state.trainingSessions = mergeSessions(state.trainingSessions, backup.sessions);
  state.activeSession = state.activeSession ?? backup.activeSession;
  state.noticeMessage = `Imported ${backup.sessions.length} sessions from JSON.`;
  await saveTrainingState();
  renderApp();
}

async function resetTrainingHistory(): Promise<void> {
  if (!window.confirm("Reset all training history and active training state? This cannot be undone unless you exported a backup.")) return;
  stopSessionTimers();
  state.trainingSessions = [];
  state.activeSession = undefined;
  state.trainingSettings = null;
  await trainingRepository().clear();
  await ensureTrainingSettings();
  state.noticeMessage = "Training history reset.";
  renderApp();
}

function trainingRepository(): TrainingRepository {
  return new TrainingRepository(browserStorage, state.username);
}
