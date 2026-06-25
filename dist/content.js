"use strict";
(() => {
  // src/shared/contest-types.ts
  var CONTEST_TYPES = ["ABC", "ARC", "AGC", "AHC", "JOI", "Typical", "Other"];

  // src/features/problemset/filters.ts
  var DEFAULT_FILTERS = {
    minDifficulty: 800,
    maxDifficulty: 1600,
    contestTypes: [...CONTEST_TYPES],
    solvedStatus: "all",
    sortOrder: "date_desc",
    query: "",
    page: 1
  };
  function applyFilters(rows, filters) {
    const query = filters.query.trim().toLowerCase();
    const selectedTypes = new Set(filters.contestTypes);
    return rows.filter((row) => {
      if (!selectedTypes.has(row.contestType) || row.difficulty === null)
        return false;
      if (row.difficulty < filters.minDifficulty || row.difficulty > filters.maxDifficulty)
        return false;
      if (filters.solvedStatus === "solved" && !row.solved)
        return false;
      if (filters.solvedStatus === "unsolved" && row.solved)
        return false;
      if (!query)
        return true;
      return [row.problem.id, row.problem.title, row.problem.contest_id, row.contest?.title ?? ""].join(" ").toLowerCase().includes(query);
    }).sort((a, b) => compareRows(a, b, filters.sortOrder));
  }
  function countUnratedInScope(rows, filters) {
    const selectedTypes = new Set(filters.contestTypes);
    return rows.filter((row) => selectedTypes.has(row.contestType) && row.difficulty === null).length;
  }
  function normalizeFilters(value) {
    if (!value || typeof value !== "object")
      return { ...DEFAULT_FILTERS };
    const candidate = value;
    return {
      minDifficulty: typeof candidate.minDifficulty === "number" ? candidate.minDifficulty : DEFAULT_FILTERS.minDifficulty,
      maxDifficulty: typeof candidate.maxDifficulty === "number" ? candidate.maxDifficulty : DEFAULT_FILTERS.maxDifficulty,
      contestTypes: Array.isArray(candidate.contestTypes) && candidate.contestTypes.every(isContestType) ? candidate.contestTypes : [...CONTEST_TYPES],
      solvedStatus: candidate.solvedStatus === "solved" || candidate.solvedStatus === "unsolved" ? candidate.solvedStatus : "all",
      sortOrder: isSortOrder(candidate.sortOrder) ? candidate.sortOrder : DEFAULT_FILTERS.sortOrder,
      query: typeof candidate.query === "string" ? candidate.query : "",
      page: typeof candidate.page === "number" && candidate.page >= 1 ? candidate.page : 1
    };
  }
  function isContestType(value) {
    return typeof value === "string" && CONTEST_TYPES.includes(value);
  }
  function isSortOrder(value) {
    return value === "date_desc" || value === "date_asc" || value === "difficulty_asc" || value === "difficulty_desc";
  }
  function compareRows(a, b, sortOrder) {
    if (sortOrder === "date_asc" || sortOrder === "date_desc") {
      const direction = sortOrder === "date_desc" ? -1 : 1;
      const aDate = a.startEpochSecond ?? Number.NEGATIVE_INFINITY;
      const bDate = b.startEpochSecond ?? Number.NEGATIVE_INFINITY;
      if (aDate !== bDate)
        return (aDate - bDate) * direction;
    }
    if (sortOrder === "difficulty_asc" || sortOrder === "difficulty_desc") {
      const direction = sortOrder === "difficulty_desc" ? -1 : 1;
      const aDifficulty = a.difficulty ?? Number.POSITIVE_INFINITY;
      const bDifficulty = b.difficulty ?? Number.POSITIVE_INFINITY;
      if (aDifficulty !== bDifficulty)
        return (aDifficulty - bDifficulty) * direction;
    }
    if (b.problem.contest_id !== a.problem.contest_id) {
      return b.problem.contest_id.localeCompare(a.problem.contest_id, void 0, { numeric: true });
    }
    return a.problem.id.localeCompare(b.problem.id, void 0, { numeric: true });
  }

  // src/features/problemset/model.ts
  function classifyContestType(contestId, contestTitle = "") {
    const id = contestId.toLowerCase();
    const title = contestTitle.toLowerCase();
    if (/^abc\d+/.test(id))
      return "ABC";
    if (/^arc\d+/.test(id))
      return "ARC";
    if (/^agc\d+/.test(id))
      return "AGC";
    if (/^ahc\d+/.test(id))
      return "AHC";
    if (id.includes("joi") || title.includes("joi"))
      return "JOI";
    if (id.includes("typical") || title.includes("typical"))
      return "Typical";
    return "Other";
  }
  function buildProblemRows(dataset) {
    const contestById = new Map(dataset.contests.map((contest) => [contest.id, contest]));
    const solvedIds = new Set(
      dataset.submissions.filter((submission) => submission.result === "AC").map((submission) => submission.problem_id)
    );
    return dataset.problems.filter((problem) => dataset.models[problem.id]?.is_experimental !== true).map((problem) => {
      const contest = contestById.get(problem.contest_id);
      const model = dataset.models[problem.id];
      const rawDifficulty = model?.difficulty;
      const difficulty = typeof rawDifficulty === "number" && Number.isFinite(rawDifficulty) ? Math.round(rawDifficulty) : null;
      return {
        problem,
        contest,
        contestType: classifyContestType(problem.contest_id, contest?.title),
        difficulty,
        model,
        startEpochSecond: typeof contest?.start_epoch_second === "number" ? contest.start_epoch_second : null,
        solved: solvedIds.has(problem.id)
      };
    });
  }

  // src/shared/difficulty.ts
  function getDifficultyBand(difficulty) {
    const lower = Math.floor(difficulty / 100) * 100;
    return `${lower}-${lower + 99}`;
  }
  function getDifficultyColor(difficulty) {
    if (difficulty < 400)
      return "#808080";
    if (difficulty < 800)
      return "#804000";
    if (difficulty < 1200)
      return "#008000";
    if (difficulty < 1600)
      return "#00C0C0";
    if (difficulty < 2e3)
      return "#0000FF";
    if (difficulty < 2400)
      return "#C0C000";
    if (difficulty < 2800)
      return "#FF8000";
    if (difficulty < 3200)
      return "#FF0000";
    if (difficulty < 3600)
      return "#965C2C";
    if (difficulty < 4e3)
      return "#808080";
    return "#FFD700";
  }
  function getDifficultyColorName(difficulty) {
    if (difficulty < 400)
      return "Gray";
    if (difficulty < 800)
      return "Brown";
    if (difficulty < 1200)
      return "Green";
    if (difficulty < 1600)
      return "Cyan";
    if (difficulty < 2e3)
      return "Blue";
    if (difficulty < 2400)
      return "Yellow";
    if (difficulty < 2800)
      return "Orange";
    if (difficulty < 3200)
      return "Red";
    if (difficulty < 3600)
      return "Bronze";
    if (difficulty < 4e3)
      return "Silver";
    return "Gold";
  }

  // src/shared/html.ts
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return entities[char] ?? char;
    });
  }
  var escapeAttribute = escapeHtml;

  // src/features/problemset/view.ts
  var PAGE_SIZE = 100;
  function renderProblemset({ rows, filters, noticeMessage }) {
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
  function renderFilterBox(filters) {
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
  function getCurrentPageRows(rows, page) {
    const startIndex = (Math.max(page, 1) - 1) * PAGE_SIZE;
    return rows.slice(startIndex, startIndex + PAGE_SIZE);
  }
  function getProblemUrl(row) {
    return `https://atcoder.jp/contests/${encodeURIComponent(row.problem.contest_id)}/tasks/${encodeURIComponent(row.problem.id)}`;
  }
  function renderDifficulty(difficulty) {
    if (difficulty === null)
      return `<span class="acps-diff acps-diff-unrated">Unrated</span>`;
    const color = getDifficultyColor(difficulty);
    return `<span class="acps-diff" style="--acps-diff-color: ${color}" title="Difficulty: ${difficulty} (${getDifficultyColorName(difficulty)})"><span class="acps-diff-dot" aria-hidden="true"></span><span>${difficulty}</span></span>`;
  }
  function renderPagination(page, totalPages, totalRows) {
    if (totalRows === 0)
      return `<div class="acps-table-note">No problems match these filters.</div>`;
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, totalRows);
    return `<div class="acps-pagination"><span>Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${totalRows.toLocaleString()}</span><div class="btn-group btn-group-sm">
    <button type="button" class="btn btn-default" data-acps-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Previous</button>
    ${getVisiblePages(page, totalPages).map((entry) => entry === "..." ? `<button type="button" class="btn btn-default" disabled>...</button>` : `<button type="button" class="btn ${entry === page ? "btn-primary" : "btn-default"}" data-acps-page="${entry}">${entry}</button>`).join("")}
    <button type="button" class="btn btn-default" data-acps-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>Next</button>
  </div></div>`;
  }
  function getVisiblePages(page, totalPages) {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    const sorted = [.../* @__PURE__ */ new Set([1, totalPages, page, page - 1, page + 1])].filter((candidate) => candidate >= 1 && candidate <= totalPages).sort((a, b) => a - b);
    const result = [];
    for (const candidate of sorted) {
      const previous = result[result.length - 1];
      if (typeof previous === "number" && candidate - previous > 1)
        result.push("...");
      result.push(candidate);
    }
    return result;
  }
  function renderProblemRow(row) {
    const url = getProblemUrl(row);
    return `<tr class="${row.solved ? "acps-solved-row" : ""}">
    <td class="acps-status-col">${row.solved ? '<span class="acps-ac">AC</span>' : ""}</td>
    <td class="acps-id-col"><a href="${url}">${escapeHtml(row.problem.id)}</a></td>
    <td><a href="${url}">${escapeHtml(row.problem.title)}</a></td>
    <td>${escapeHtml(row.contest?.title ?? row.problem.contest_id)}</td>
    <td>${row.contestType}</td><td class="acps-difficulty-col">${renderDifficulty(row.difficulty)}</td>
  </tr>`;
  }

  // src/features/stats/stats.ts
  function computeStats(filteredRows, unrated) {
    const total = filteredRows.length;
    const solved = filteredRows.filter((row) => row.solved).length;
    const bands = /* @__PURE__ */ new Map();
    const types = /* @__PURE__ */ new Map();
    for (const row of filteredRows) {
      if (row.difficulty !== null) {
        const band = getDifficultyBand(row.difficulty);
        const stat = bands.get(band) ?? { total: 0, solved: 0 };
        stat.total += 1;
        if (row.solved)
          stat.solved += 1;
        bands.set(band, stat);
      }
      const typeStat = types.get(row.contestType) ?? { total: 0, solved: 0 };
      typeStat.total += 1;
      if (row.solved)
        typeStat.solved += 1;
      types.set(row.contestType, typeStat);
    }
    return {
      total,
      solved,
      unsolved: total - solved,
      unrated,
      completionRate: total === 0 ? 0 : solved / total,
      byBand: [...bands.entries()].sort(([a], [b]) => Number(a.split("-")[0]) - Number(b.split("-")[0])).map(([band, stat]) => ({ band, ...stat })),
      byType: CONTEST_TYPES.map((type) => ({ type, ...types.get(type) ?? { total: 0, solved: 0 } })).filter((stat) => stat.total > 0)
    };
  }

  // src/features/stats/view.ts
  function renderStats(currentStats) {
    return `<div class="acps-stats-grid">
    <section class="acps-table-box"><div class="acps-box-title">Filtered Progress</div>
      <div class="acps-metrics">
        <div><strong>${currentStats.solved}</strong><span>Solved</span></div>
        <div><strong>${currentStats.total}</strong><span>Total rated</span></div>
        <div><strong>${Math.round(currentStats.completionRate * 100)}%</strong><span>Complete</span></div>
        <div><strong>${currentStats.unrated}</strong><span>Unrated excluded</span></div>
      </div>
    </section>
    <section class="acps-table-box"><div class="acps-box-title">By Difficulty</div>${renderBandStats(currentStats)}</section>
    <section class="acps-table-box"><div class="acps-box-title">By Contest Type</div>${renderTypeStats(currentStats)}</section>
  </div>`;
  }
  function renderBandStats(stats) {
    if (stats.byBand.length === 0)
      return `<p class="acps-empty">No rated problems match these filters.</p>`;
    return stats.byBand.map((band) => renderStatRow(band.band, band.solved, band.total)).join("");
  }
  function renderTypeStats(stats) {
    if (stats.byType.length === 0)
      return `<p class="acps-empty">No contest types match these filters.</p>`;
    return stats.byType.map((type) => renderStatRow(type.type, type.solved, type.total)).join("");
  }
  function renderStatRow(label, solved, total) {
    const percent = total === 0 ? 0 : Math.round(solved / total * 100);
    return `<div class="acps-stat-row"><span>${label}</span><div class="acps-bar"><span style="width:${percent}%"></span></div><b>${solved}/${total}</b></div>`;
  }

  // src/features/training/backup.ts
  function makeTrainingBackup(username, settings, sessions, activeSession) {
    return {
      schemaVersion: 1,
      exportedAt: Math.floor(Date.now() / 1e3),
      user: { atcoderId: username },
      activeSession,
      sessions,
      settings
    };
  }
  function normalizeTrainingBackup(value) {
    if (!value || typeof value !== "object")
      return null;
    const backup = value;
    if (backup.schemaVersion !== 1)
      return null;
    if (!backup.user || typeof backup.user.atcoderId !== "string")
      return null;
    if (!backup.settings || backup.settings.schemaVersion !== 1)
      return null;
    if (!Array.isArray(backup.sessions))
      return null;
    return backup;
  }
  function mergeSessions(current, incoming) {
    const byId = new Map(current.map((session) => [session.id, session]));
    for (const session of incoming)
      byId.set(session.id, session);
    return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt);
  }

  // src/shared/training-modes.ts
  var TRAINING_MODES = {
    "ladder-2h": { durationSeconds: 2 * 60 * 60, offsets: [-400, -200, -100, 100], label: "2h Ladder", clamp: 150 },
    "consistency-1h": { durationSeconds: 60 * 60, offsets: [-100, 0, 100], label: "1h Consistency", clamp: 120 }
  };

  // src/features/training/session.ts
  var DIFFICULTY_WINDOW = 80;
  function roundTrainingTarget(rating) {
    return Math.max(400, Math.round(rating / 100) * 100);
  }
  function createTrainingSettings(username, officialRating, now) {
    const initial = typeof officialRating === "number" && Number.isFinite(officialRating) ? officialRating : 400;
    return {
      schemaVersion: 1,
      username,
      eloByMode: { "ladder-2h": initial, "consistency-1h": initial },
      contestTypes: ["ABC", "ARC", "AGC"],
      initializedFrom: { type: officialRating === null ? "default" : "atcoder-rating", value: initial, at: now }
    };
  }
  function generateTrainingSession(mode, username, targetRating, rows, usedProblemIds, now, contestTypes = ["ABC", "ARC", "AGC"]) {
    const config = TRAINING_MODES[mode];
    const selectedTypes = new Set(contestTypes.length > 0 ? contestTypes : ["ABC", "ARC", "AGC"]);
    const selected = [];
    const selectedIds = /* @__PURE__ */ new Set();
    for (let order = 0; order < config.offsets.length; order++) {
      const offset = config.offsets[order] ?? 0;
      const targetDifficulty = Math.max(0, targetRating + offset);
      const candidates = rows.filter((row) => row.difficulty !== null && selectedTypes.has(row.contestType) && !row.solved && !selectedIds.has(row.problem.id)).map((row) => ({
        row,
        score: Math.abs((row.difficulty ?? 0) - targetDifficulty) + (usedProblemIds.has(row.problem.id) ? 1e4 : 0)
      })).filter(({ row, score }) => score < 1e4 || Math.abs((row.difficulty ?? 0) - targetDifficulty) <= DIFFICULTY_WINDOW * 4).sort((a, b) => a.score - b.score || (b.row.startEpochSecond ?? 0) - (a.row.startEpochSecond ?? 0));
      const picked = candidates[0]?.row;
      if (!picked || picked.difficulty === null)
        throw new Error(`No available rated problem near ${targetDifficulty}`);
      selectedIds.add(picked.problem.id);
      selected.push({
        problemId: picked.problem.id,
        contestId: picked.problem.contest_id,
        title: picked.problem.title,
        difficulty: picked.difficulty,
        targetDifficulty,
        targetOffset: offset,
        point: typeof picked.problem.point === "number" ? picked.problem.point : 100,
        rawDifficulty: picked.model?.rawDifficulty,
        slope: picked.model?.slope,
        intercept: picked.model?.intercept,
        variance: picked.model?.variance,
        order,
        unlocked: order === 0,
        wrongAttempts: 0
      });
    }
    return {
      id: `${mode}:${username}:${now}`,
      mode,
      username,
      startedAt: now,
      durationSeconds: config.durationSeconds,
      targetRating,
      problems: selected,
      rawSubmissions: [],
      manualRefreshAvailableAt: now
    };
  }

  // src/features/training/rating.ts
  var WRONG_PENALTY_SECONDS = 300;
  function calcTrainingTotalResult(problems, start) {
    let point = 0;
    let penalties = 0;
    let lastUpdatedEpochSecond = start;
    for (const problem of problems) {
      if (problem.solvedAt === void 0)
        break;
      point += problem.point;
      penalties += problem.wrongAttempts;
      lastUpdatedEpochSecond = Math.max(lastUpdatedEpochSecond, problem.solvedAt);
    }
    return { point, penalties, lastUpdatedEpochSecond };
  }
  function compareTrainingResults(a, b) {
    if (a.point !== b.point)
      return b.point - a.point;
    const aPenalty = a.lastUpdatedEpochSecond + a.penalties * WRONG_PENALTY_SECONDS;
    const bPenalty = b.lastUpdatedEpochSecond + b.penalties * WRONG_PENALTY_SECONDS;
    if (aPenalty !== bPenalty)
      return aPenalty - bPenalty;
    return a.penalties - b.penalties;
  }
  function estimateTrainingPerformance(session) {
    const standings = [
      { rating: Number.NaN, result: calcTrainingTotalResult(session.problems, session.startedAt) },
      ...makeBotResults(session)
    ].sort((a, b) => compareTrainingResults(a.result, b.result));
    const userIndex = standings.findIndex((entry) => Number.isNaN(entry.rating));
    const performances = calculatePerformances(
      standings.filter((entry) => !Number.isNaN(entry.rating)).map((entry) => entry.rating)
    );
    const lower = performances[Math.max(0, userIndex - 1)];
    const upper = performances[Math.min(performances.length - 1, userIndex)];
    if (lower !== void 0 && upper !== void 0)
      return Math.round((lower + upper) / 2);
    return lower ?? upper ?? session.targetRating;
  }
  function calibrateTrainingPerformance(rawPerformance, session) {
    const factor = session.mode === "consistency-1h" ? 0.55 : 0.7;
    return Math.round(session.targetRating + (rawPerformance - session.targetRating) * factor);
  }
  function updateTrainingElo(current, performance, mode) {
    const blend = mode === "consistency-1h" ? 0.1 : 0.15;
    const unclampedDelta = Math.round((performance - current) * blend);
    const clamp = TRAINING_MODES[mode].clamp;
    return current + Math.max(-clamp, Math.min(clamp, unclampedDelta));
  }
  function makeBotResults(session) {
    const bots = [];
    for (let rating = -1e3; rating <= 4e3; rating += 25) {
      const rng = mulberry32(hashString(`${session.id}:${rating}`));
      let currentTime = session.startedAt;
      const botProblems = [];
      for (const problem of session.problems) {
        const probability = predictSolveProbability(problem.difficulty, rating);
        const meanSeconds = predictSolveSeconds(problem, rating, session.durationSeconds);
        if (rng() > probability) {
          botProblems.push({ ...problem, solvedAt: void 0, wrongAttempts: Math.floor(rng() * 3), unlocked: true });
          continue;
        }
        const solveSeconds = Math.max(30, logNormal(Math.log(meanSeconds), Math.sqrt(problem.variance ?? 0.2), rng));
        if (currentTime + solveSeconds > session.startedAt + session.durationSeconds) {
          botProblems.push({ ...problem, solvedAt: void 0, wrongAttempts: Math.floor(rng() * 3), unlocked: true });
          continue;
        }
        currentTime += solveSeconds;
        botProblems.push({
          ...problem,
          solvedAt: Math.round(currentTime),
          wrongAttempts: Math.floor(rng() * 2),
          unlocked: true
        });
      }
      bots.push({ rating, result: calcTrainingTotalResult(botProblems, session.startedAt) });
    }
    return bots;
  }
  function calculatePerformances(participantRawRatings) {
    const perfs = [];
    for (let position = 0; position < participantRawRatings.length; position++) {
      let ub = 1e4;
      let lb = -1e4;
      while (Math.round(lb) < Math.round(ub)) {
        const middle = (lb + ub) / 2;
        const predictedRank = participantRawRatings.reduce(
          (sum, rating) => sum + 1 / (1 + 6 ** ((middle - rating) / 400)),
          0
        );
        if (predictedRank < position + 0.5)
          ub = middle;
        else
          lb = middle;
      }
      perfs.push(Math.round(lb));
    }
    return perfs;
  }
  function predictSolveProbability(difficulty, rating) {
    return 1 / (1 + 6 ** ((difficulty - rating) / 400));
  }
  function predictSolveSeconds(problem, rating, durationSeconds) {
    if (typeof problem.slope === "number" && typeof problem.intercept === "number") {
      const seconds = Math.exp(problem.slope * rating + problem.intercept);
      if (Number.isFinite(seconds) && seconds > 0)
        return Math.min(durationSeconds * 0.7, Math.max(30, seconds));
    }
    const ratio = 1 / Math.max(0.08, predictSolveProbability(problem.difficulty, rating));
    return Math.min(durationSeconds * 0.7, Math.max(90, 280 * ratio));
  }
  function logNormal(mean, sigma, rng) {
    const u1 = Math.max(rng(), Number.EPSILON);
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
    return Math.exp(mean + sigma * normal);
  }
  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function mulberry32(seed) {
    return () => {
      let value = seed += 1831565813;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/features/training/repository.ts
  var STORAGE_TRAINING_PREFIX = "atcoder-problemset:training";
  var TrainingRepository = class {
    constructor(storage, username) {
      this.storage = storage;
      this.username = username;
    }
    async load() {
      const settingsKey = this.key("settings");
      const sessionsKey = this.key("sessions");
      const activeSessionKey = this.key("active-session");
      const keys = [settingsKey, sessionsKey, activeSessionKey];
      const stored = await this.storage.get(keys);
      return {
        settings: normalizeTrainingSettings(stored[settingsKey], this.username),
        sessions: Array.isArray(stored[sessionsKey]) ? stored[sessionsKey] : [],
        activeSession: normalizeActiveSession(stored[activeSessionKey], this.username)
      };
    }
    async save(state2) {
      await this.storage.set({
        [this.key("settings")]: state2.settings,
        [this.key("sessions")]: state2.sessions,
        [this.key("active-session")]: state2.activeSession
      });
    }
    async clear() {
      await this.storage.remove([this.key("settings"), this.key("sessions"), this.key("active-session")]);
    }
    key(suffix) {
      return `${STORAGE_TRAINING_PREFIX}:${this.username}:${suffix}`;
    }
  };
  function normalizeTrainingSettings(value, username) {
    if (!value || typeof value !== "object")
      return null;
    const candidate = value;
    if (candidate.schemaVersion !== 1 || candidate.username !== username)
      return null;
    if (typeof candidate.eloByMode?.["ladder-2h"] !== "number")
      return null;
    if (typeof candidate.eloByMode?.["consistency-1h"] !== "number")
      return null;
    const contestTypes = ["ABC", "ARC", "AGC", "AHC", "JOI", "Typical", "Other"];
    return {
      ...candidate,
      contestTypes: Array.isArray(candidate.contestTypes) && candidate.contestTypes.every((type) => contestTypes.includes(type)) ? candidate.contestTypes : ["ABC", "ARC", "AGC"]
    };
  }
  function normalizeActiveSession(value, username) {
    if (!value || typeof value !== "object")
      return void 0;
    const session = value;
    return session.username === username && !session.endedAt ? session : void 0;
  }

  // src/shared/date-time.ts
  function formatDuration(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor(safe % 3600 / 60);
    const secs = safe % 60;
    if (hours > 0)
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }
  function formatClock(epochSecond) {
    return new Date(epochSecond * 1e3).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function formatDate(epochSecond) {
    return new Date(epochSecond * 1e3).toLocaleDateString();
  }
  function formatShortDate(epochSecond) {
    return new Date(epochSecond * 1e3).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
  }
  function getDateTicks(minEpoch, maxEpoch, count) {
    if (minEpoch === maxEpoch)
      return [minEpoch];
    return Array.from({ length: count }, (_, index) => Math.round(minEpoch + (maxEpoch - minEpoch) * index / (count - 1)));
  }

  // src/shared/session-history-view.ts
  function renderSessionHistory(sessions, options) {
    if (sessions.length === 0)
      return `<p class="acps-empty">No training sessions yet.</p>`;
    return `<table class="table table-condensed acps-session-table">
    <thead><tr><th>Date</th><th>Mode</th><th>Solved</th><th>Times</th><th>Perf</th><th>ELO</th></tr></thead>
    <tbody>${sessions.map((session) => `<tr>
      <td>${formatDate(session.startedAt)}</td><td>${TRAINING_MODES[session.mode].label}</td>
      <td>${options.getSolvedPrefixLength(session)}/${session.problems.length}</td><td>${renderSolveTimes(session)}</td>
      <td>${session.performance === void 0 ? "-" : Math.round(session.performance)}</td>
      <td>${session.ratingAfter === void 0 ? "-" : Math.round(session.ratingAfter)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
  }
  function renderSolveTimes(session) {
    return `<div class="acps-session-times">${session.problems.map(
      (problem) => problem.solvedAt === void 0 ? `<span class="is-unsolved">(-:--)</span>` : `<span>(${formatDuration(problem.solvedAt - session.startedAt)})</span>`
    ).join("")}</div>`;
  }

  // src/features/training/submissions.ts
  function applyTrainingSubmissions(session, submissions) {
    const problemById = new Map(session.problems.map((problem) => [problem.problemId, problem]));
    const rawById = new Map(session.rawSubmissions.map((submission) => [submission.id, { ...submission, counted: false }]));
    for (const submission of submissions.sort((a, b) => a.id - b.id || a.epoch_second - b.epoch_second)) {
      const problem = problemById.get(submission.problem_id);
      if (!problem)
        continue;
      if (submission.epoch_second < session.startedAt || submission.epoch_second > session.startedAt + session.durationSeconds)
        continue;
      const existing = rawById.get(submission.id);
      if (existing && isTerminalResult(existing.result) && !isBetterResult(submission.result, existing.result))
        continue;
      rawById.set(submission.id, {
        id: submission.id,
        problemId: submission.problem_id,
        contestId: submission.contest_id,
        result: submission.result,
        epochSecond: submission.epoch_second,
        order: problem.order,
        counted: false
      });
    }
    const next = {
      ...session,
      rawSubmissions: [...rawById.values()].sort((a, b) => a.id - b.id || a.epochSecond - b.epochSecond),
      problems: session.problems.map((problem, index) => ({
        ...problem,
        unlocked: index === 0 || session.problems[index - 1]?.solvedAt !== void 0,
        solvedAt: void 0,
        wrongAttempts: 0
      }))
    };
    for (const problem of next.problems) {
      const previous = next.problems[problem.order - 1];
      const unlockedAt = problem.order === 0 ? next.startedAt : previous?.solvedAt;
      problem.unlocked = problem.order === 0 || unlockedAt !== void 0;
      if (unlockedAt === void 0)
        continue;
      const problemSubmissions = next.rawSubmissions.filter((submission) => submission.problemId === problem.problemId && submission.epochSecond >= unlockedAt).sort((a, b) => a.id - b.id || a.epochSecond - b.epochSecond);
      for (const submission of problemSubmissions) {
        if (submission.result === "AC") {
          problem.solvedAt = submission.epochSecond;
          submission.counted = true;
          break;
        }
        problem.wrongAttempts += 1;
        submission.counted = true;
      }
    }
    for (const problem of next.problems) {
      problem.unlocked = problem.order === 0 || next.problems[problem.order - 1]?.solvedAt !== void 0;
    }
    return next;
  }
  function getSolvedPrefixLength(session) {
    let solved = 0;
    for (const problem of session.problems) {
      if (problem.solvedAt === void 0)
        break;
      solved += 1;
    }
    return solved;
  }
  function isTerminalResult(result) {
    return result !== "WJ" && result !== "Judging";
  }
  function isBetterResult(next, current) {
    return next === "AC" && current !== "AC" || isTerminalResult(next) && !isTerminalResult(current);
  }

  // src/features/training/view.ts
  var FREE_CANCEL_SECONDS = 10 * 60;
  function renderTrainingView(model) {
    const ladderElo = model.settings?.eloByMode["ladder-2h"] ?? 400;
    const consistencyElo = model.settings?.eloByMode["consistency-1h"] ?? 400;
    if (!model.activeSession) {
      return `<div class="acps-stats-grid">
      <section class="acps-table-box"><div class="acps-box-title">Training</div>
        ${renderContestTypePicker(model.settings)}
        <div class="acps-training-actions">${renderStartCard("ladder-2h", ladderElo)}${renderStartCard("consistency-1h", consistencyElo)}</div>
      </section>
      <section class="acps-table-box"><div class="acps-box-title">Recent Sessions</div>${renderSessionHistory2(model.sessions.slice(-8).reverse())}</section>
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
  function renderSessionHistory2(sessions) {
    return renderSessionHistory(sessions, { getSolvedPrefixLength });
  }
  function renderContestTypePicker(settings) {
    const selected = new Set(settings?.contestTypes ?? ["ABC", "ARC", "AGC"]);
    return `<div class="acps-training-type-picker"><span>Problem sources</span>${CONTEST_TYPES.map((type) => `
    <label class="checkbox-inline"><input type="checkbox" value="${type}" data-acps-training-contest-type ${selected.has(type) ? "checked" : ""}> ${type}</label>
  `).join("")}</div>`;
  }
  function renderStartCard(mode, elo) {
    const config = TRAINING_MODES[mode];
    return `<div class="acps-training-card"><h3>${escapeHtml(config.label)}</h3>
    <p><b>Training ELO:</b> ${Math.round(elo)}</p><p><b>Next target:</b> ${roundTrainingTarget(elo)}</p>
    <p><b>Sheet:</b> ${config.offsets.map((offset) => offset >= 0 ? `+${offset}` : String(offset)).join(" / ")}</p>
    <button class="btn btn-primary btn-sm" type="button" data-acps-start-training="${mode}">Start</button>
  </div>`;
  }
  function renderProblem(session, problem) {
    const url = `https://atcoder.jp/contests/${encodeURIComponent(problem.contestId)}/tasks/${encodeURIComponent(problem.problemId)}`;
    const solveMinute = problem.solvedAt === void 0 ? "" : ` \xB7 ${Math.max(0, Math.floor((problem.solvedAt - session.startedAt) / 60))} min`;
    const status = problem.solvedAt !== void 0 ? "AC" : problem.unlocked ? "Open" : "Locked";
    const link = problem.unlocked ? `<a href="${url}">Problem ${problem.order + 1}</a>` : `<span>Problem ${problem.order + 1}</span>`;
    return `<div class="acps-training-problem ${problem.solvedAt !== void 0 ? "is-solved" : ""} ${problem.unlocked ? "" : "is-locked"}">
    <div class="acps-training-problem-top"><strong>${link}</strong><span>${status}${solveMinute}</span></div>
    <div>${escapeHtml(problem.title)}</div><div class="acps-training-meta">${renderDifficulty(problem.difficulty)}<span>Target ${problem.targetDifficulty}</span><span>WA ${problem.wrongAttempts}</span></div>
  </div>`;
  }

  // src/services/atcoder/client.ts
  var AtCoderClient = class {
    constructor(messenger) {
      this.messenger = messenger;
    }
    async getDataset(username) {
      const response = await this.messenger.send({ type: "ATCODER_PROBLEMSET_GET_DATA", username });
      if (!response.ok || !("dataset" in response))
        throw new Error(!response.ok ? response.error : "Unknown background response");
      return response.dataset;
    }
    async getRatingHistory(username) {
      const response = await this.messenger.send({ type: "ATCODER_PROBLEMSET_GET_RATING_HISTORY", username });
      return response.ok && "history" in response ? response.history : [];
    }
    async getRecentSubmissions(username, fromSecond, session) {
      const response = await this.messenger.send({
        type: "ATCODER_PROBLEMSET_GET_RECENT_SUBMISSIONS",
        username,
        fromSecond,
        problems: session.problems.map((problem) => ({ contestId: problem.contestId, problemId: problem.problemId }))
      });
      if (!response.ok || !("submissions" in response))
        throw new Error(!response.ok ? response.error : "Unknown background response");
      return response.submissions;
    }
  };

  // src/platform/local-runtime.ts
  function token() {
    const stored = sessionStorage.getItem("acps-token");
    if (stored)
      return stored;
    const value = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
    if (value) {
      sessionStorage.setItem("acps-token", value);
      history.replaceState(history.state, "", `${location.pathname}${location.search}`);
    }
    return value;
  }
  async function api(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("X-AtCoder-Dashboard-Token", token());
    if (init.body)
      headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error ?? `Request failed: ${response.status}`);
    return payload;
  }
  var localStorageAdapter = {
    async get(keys) {
      return api("/api/storage/get", { method: "POST", body: JSON.stringify({ keys }) });
    },
    async set(items) {
      await api("/api/storage/set", { method: "POST", body: JSON.stringify({ items }) });
    },
    async remove(keys) {
      await api("/api/storage/remove", { method: "POST", body: JSON.stringify({ keys }) });
    }
  };
  var localRuntimeMessenger = {
    async send(message) {
      return api("/api/message", { method: "POST", body: JSON.stringify(message) });
    }
  };
  var desktopControl = {
    status: () => api("/api/status"),
    login: () => api("/api/auth/login", { method: "POST" }),
    logout: () => api("/api/auth/logout", { method: "POST" }),
    setUsername: (username) => api("/api/settings/username", {
      method: "POST",
      body: JSON.stringify({ username })
    }),
    clearCache: () => api("/api/cache/clear", { method: "POST" }),
    resetAccount: () => api("/api/account/reset", { method: "POST" })
  };

  // src/platform/browser-storage.ts
  var chromeStorage = {
    async get(keys) {
      return chrome.storage.local.get(keys);
    },
    async set(items) {
      await chrome.storage.local.set(items);
    },
    async remove(keys) {
      await chrome.storage.local.remove(keys);
    }
  };
  var browserStorage = typeof globalThis.chrome !== "undefined" && Boolean(globalThis.chrome.runtime?.id) ? chromeStorage : localStorageAdapter;

  // src/platform/runtime-messaging.ts
  var chromeRuntimeMessenger = {
    async send(message) {
      return chrome.runtime.sendMessage(message);
    }
  };
  var runtimeMessenger = typeof globalThis.chrome !== "undefined" && Boolean(globalThis.chrome.runtime?.id) ? chromeRuntimeMessenger : localRuntimeMessenger;

  // src/app/router.ts
  var EXTENSION_PATHS = {
    problemset: "/problemset",
    stats: "/stats",
    training: "/training",
    progress: "/progress",
    settings: "/settings"
  };
  function getTabFromPath(pathname) {
    const entry = Object.entries(EXTENSION_PATHS).find(([, path]) => path === pathname);
    return entry?.[0] ?? null;
  }
  function isActiveTab(value) {
    return value === "problemset" || value === "stats" || value === "training" || value === "progress" || value === "settings";
  }

  // src/app/shell.ts
  var ROOT_ID = "atcoder-problemset-extension-root";
  function detectUsername(doc = document) {
    const configured = doc.documentElement.dataset.acpsUsername;
    if (configured)
      return configured;
    const nav = doc.querySelector("#navbar-collapse, .navbar, header") ?? doc;
    const href = nav.querySelector('a[href^="/users/"]')?.getAttribute("href") ?? "";
    return href.match(/^\/users\/([^/?#]+)/)?.[1] ?? "";
  }
  function findMainContainer(doc = document) {
    const standalone = doc.querySelector("[data-acps-standalone-main]");
    if (standalone)
      return standalone;
    const containers = Array.from(doc.querySelectorAll(".container, .container-fluid"));
    return containers.find((container) => !container.closest("nav, .navbar, header")) ?? doc.body;
  }
  function createRoot(doc = document) {
    const root = doc.createElement("section");
    root.id = ROOT_ID;
    root.className = "acps-root";
    root.hidden = !doc.documentElement.hasAttribute("data-acps-standalone");
    root.innerHTML = `<div class="acps-panel" data-acps-content></div>`;
    return root;
  }
  function injectNavItems(doc = document) {
    const navList = doc.querySelector("#navbar-collapse .navbar-nav:first-child, .navbar .navbar-nav:first-child");
    if (!navList || doc.querySelector("[data-acps-tab]"))
      return;
    const labels = {
      problemset: "Problemset",
      stats: "Stats",
      training: "Training",
      progress: "Progress",
      settings: "Settings"
    };
    const tabs = Object.keys(EXTENSION_PATHS).filter((tab) => tab !== "settings" || doc.documentElement.hasAttribute("data-acps-standalone"));
    for (const tab of tabs) {
      const item = doc.createElement("li");
      item.innerHTML = `<a href="${EXTENSION_PATHS[tab]}" data-acps-tab="${tab}">${labels[tab]}</a>`;
      navList.append(item);
    }
  }

  // src/app/state.ts
  function createAppState() {
    return {
      allRows: [],
      filteredRows: [],
      filters: { ...DEFAULT_FILTERS },
      stats: computeStats([], 0),
      activeTab: "problemset",
      progressMode: "all",
      username: "",
      noticeMessage: "",
      officialHistory: [],
      trainingSettings: null,
      trainingSessions: [],
      activeSession: void 0
    };
  }

  // src/features/progress/timeline.ts
  function buildProgressTimeline(official, sessions, mode) {
    const bestTrainingByDay = /* @__PURE__ */ new Map();
    sessions.filter((session) => session.ratingAfter !== void 0 && (mode === "all" || session.mode === mode)).forEach((session) => {
      const epochSecond = session.endedAt ?? session.startedAt + session.durationSeconds;
      const key = getUtcDayKey(epochSecond);
      const point = {
        epochSecond,
        trainingRating: session.ratingAfter,
        label: TRAINING_MODES[session.mode].label,
        mode: session.mode
      };
      const current = bestTrainingByDay.get(key);
      if (!current || (point.trainingRating ?? 0) > (current.trainingRating ?? 0))
        bestTrainingByDay.set(key, point);
    });
    const trainingEvents = [...bestTrainingByDay.values()].map((point) => ({
      ...point,
      epochSecond: getUtcNoon(point.epochSecond)
    }));
    const officialEvents = official.map((point) => ({
      epochSecond: point.epochSecond,
      officialRating: point.rating,
      label: point.contestName ?? point.contestScreenName ?? "Official contest",
      mode: "official"
    }));
    return [...officialEvents, ...trainingEvents].sort((a, b) => a.epochSecond - b.epochSecond);
  }
  function getUtcDayKey(epochSecond) {
    return new Date(epochSecond * 1e3).toISOString().slice(0, 10);
  }
  function getUtcNoon(epochSecond) {
    return Math.floor((/* @__PURE__ */ new Date(`${getUtcDayKey(epochSecond)}T12:00:00.000Z`)).getTime() / 1e3);
  }

  // src/features/progress/chart.ts
  function makePath(points) {
    if (points.length === 0)
      return "";
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  }

  // src/features/progress/view.ts
  function renderProgressView(model) {
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
  function ensureSeedPoint(points, model) {
    if (!model.settings || points.some((point) => point.trainingRating !== void 0))
      return points;
    const rating = model.mode === "ladder-2h" ? model.settings.eloByMode["ladder-2h"] : model.mode === "consistency-1h" ? model.settings.eloByMode["consistency-1h"] : Math.round((model.settings.eloByMode["ladder-2h"] + model.settings.eloByMode["consistency-1h"]) / 2);
    return [...points, {
      epochSecond: model.settings.initializedFrom?.at ?? model.now,
      trainingRating: rating,
      label: model.settings.initializedFrom?.type === "atcoder-rating" ? "Current AtCoder rating" : "Initial training ELO",
      mode: model.mode === "all" ? void 0 : model.mode
    }].sort((a, b) => a.epochSecond - b.epochSecond);
  }
  function modeButton(active, mode, label) {
    return `<button class="btn ${active === mode ? "btn-primary" : "btn-default"}" type="button" data-acps-progress-mode="${mode}">${label}</button>`;
  }
  function renderRatingChart(points, zoom, pan) {
    if (points.length === 0)
      return `<p class="acps-empty">No rating or training history yet.</p>`;
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
    const ratings = points.flatMap((point) => [point.officialRating, point.trainingRating]).filter((value) => typeof value === "number");
    const minRating = Math.max(0, Math.min(...ratings) - 100);
    const maxRating = Math.max(...ratings) + 100;
    const x = (epoch) => pad + (epoch - minTime) / Math.max(1, maxTime - minTime) * (width - pad * 2);
    const y = (rating) => height - bottomPad - (rating - minRating) / Math.max(1, maxRating - minRating) * (height - pad - bottomPad);
    const officialPath = makePath(visiblePoints.filter((point) => point.officialRating !== void 0).map((point) => [x(point.epochSecond), y(point.officialRating)]));
    const trainingPath = makePath(visiblePoints.filter((point) => point.trainingRating !== void 0).map((point) => [x(point.epochSecond), y(point.trainingRating)]));
    return `<div class="acps-chart-wrap"><svg class="acps-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Official and simulated training rating chart" data-acps-rating-chart>
    <line x1="${pad}" y1="${height - bottomPad}" x2="${width - pad}" y2="${height - bottomPad}" class="acps-axis"></line>
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - bottomPad}" class="acps-axis"></line>
    <text x="${pad}" y="20">${Math.round(maxRating)}</text><text x="${pad}" y="${height - 8}">${Math.round(minRating)}</text>
    ${getDateTicks(minTime, maxTime, 4).map((tick) => `<line x1="${x(tick)}" y1="${height - bottomPad}" x2="${x(tick)}" y2="${height - bottomPad + 5}" class="acps-axis"></line><text x="${x(tick)}" y="${height - 28}" text-anchor="middle">${formatShortDate(tick)}</text>`).join("")}
    ${officialPath ? `<path d="${officialPath}" class="acps-line acps-line-official"></path>` : ""}${trainingPath ? `<path d="${trainingPath}" class="acps-line acps-line-training"></path>` : ""}
    ${visiblePoints.map((point) => point.officialRating === void 0 ? "" : `<circle class="acps-point-official" cx="${x(point.epochSecond)}" cy="${y(point.officialRating)}" r="3"><title>${escapeHtml(point.label)} \xB7 ${formatDate(point.epochSecond)} \xB7 ${Math.round(point.officialRating)}</title></circle>`).join("")}
    ${visiblePoints.map((point) => point.trainingRating === void 0 ? "" : `<circle class="acps-point-training" cx="${x(point.epochSecond)}" cy="${y(point.trainingRating)}" r="3"><title>${escapeHtml(point.label)} \xB7 ${formatDate(point.epochSecond)} \xB7 ${Math.round(point.trainingRating)}</title></circle>`).join("")}
  </svg><div class="acps-chart-legend"><span class="official">Official rating</span><span class="training">Simulated training ELO</span></div></div>`;
  }

  // src/app/render.ts
  function renderAppLayout(state2, context, onFiltersNormalized) {
    return `
    <div class="acps-layout">
      <main class="acps-main">
        ${renderMainTab(state2, context, onFiltersNormalized)}
      </main>
      <aside class="acps-sidebar">
        ${state2.activeTab === "problemset" || state2.activeTab === "stats" ? renderFilterBox(state2.filters) : ""}
        ${renderSummaryBox(state2)}
      </aside>
    </div>
  `;
  }
  function renderMainTab(state2, context, onFiltersNormalized) {
    if (state2.activeTab === "settings")
      return renderSettings(state2, context);
    if (state2.activeTab === "stats")
      return renderStats(state2.stats);
    if (state2.activeTab === "training") {
      return renderTrainingView({
        settings: state2.trainingSettings,
        sessions: state2.trainingSessions,
        activeSession: state2.activeSession,
        noticeMessage: state2.noticeMessage,
        now: context.now
      });
    }
    if (state2.activeTab === "progress") {
      return renderProgressView({
        officialHistory: state2.officialHistory,
        sessions: state2.trainingSessions,
        settings: state2.trainingSettings,
        mode: state2.progressMode,
        zoom: context.chartZoom,
        pan: context.chartPan,
        noticeMessage: state2.noticeMessage,
        now: context.now
      });
    }
    const totalPages = Math.max(1, Math.ceil(state2.filteredRows.length / PAGE_SIZE));
    const page = Math.min(Math.max(state2.filters.page, 1), totalPages);
    if (page !== state2.filters.page)
      onFiltersNormalized(page);
    return renderProblemset({
      rows: state2.filteredRows,
      filters: state2.filters,
      noticeMessage: state2.noticeMessage
    });
  }
  function renderSummaryBox(state2) {
    return `
    <div class="acps-filter-box">
      <div class="acps-side-title">Current Stats</div>
      <p><b>User:</b> ${escapeHtml(state2.username)}</p>
      <p><b>Solved:</b> ${state2.stats.solved} / ${state2.stats.total}</p>
      <p><b>Unsolved:</b> ${state2.stats.unsolved}</p>
      <p><b>Unrated excluded:</b> ${state2.stats.unrated}</p>
    </div>
  `;
  }
  function renderSettings(state2, context) {
    const status = context.desktopStatus;
    const authLabel = status?.authenticated ? "Logged in through AtCoder" : "Public API mode";
    return `
    <section class="acps-table-box acps-settings">
      <div class="acps-box-title">Settings</div>
      ${state2.noticeMessage ? `<div class="alert alert-info acps-notice">${escapeHtml(state2.noticeMessage)}</div>` : ""}
      <div class="acps-settings-section">
        <h4>AtCoder account</h4>
        <p><b>Active username:</b> ${escapeHtml(state2.username || "Not configured")}</p>
        <p><b>Authentication:</b> ${escapeHtml(authLabel)}</p>
        <div class="btn-group">
          <button class="btn btn-primary btn-sm" type="button" data-acps-login>${status?.authenticated ? "Refresh login" : "Log in to AtCoder"}</button>
          ${status?.authenticated ? `<button class="btn btn-default btn-sm" type="button" data-acps-logout>Log out</button>` : ""}
          <button class="btn btn-default btn-sm" type="button" data-acps-switch-account>Switch account</button>
        </div>
        <form class="acps-inline-form" data-acps-manual-user>
          <label for="acps-manual-username">Public API username</label>
          <div class="input-group">
            <input id="acps-manual-username" class="form-control input-sm" name="username" value="${escapeAttribute(state2.username)}" required pattern="[A-Za-z0-9_]{1,32}">
            <span class="input-group-btn"><button class="btn btn-default btn-sm" type="submit">Use username</button></span>
          </div>
        </form>
      </div>
      <div class="acps-settings-section">
        <h4>Data</h4>
        <div class="btn-group">
          <button class="btn btn-default btn-sm" type="button" data-acps-clear-cache>Clear API cache</button>
          <button class="btn btn-default btn-sm" type="button" data-acps-export-training ${state2.trainingSettings ? "" : "disabled"}>Export training JSON</button>
          <button class="btn btn-default btn-sm" type="button" data-acps-import-trigger>Import training JSON</button>
          <button class="btn btn-danger btn-sm" type="button" data-acps-reset-training ${state2.username ? "" : "disabled"}>Reset training</button>
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

  // src/app/forms.ts
  function readFiltersFromForm(form, currentPage) {
    const formData = new FormData(form);
    const minDifficulty = Number(formData.get("minDifficulty"));
    const maxDifficulty = Number(formData.get("maxDifficulty"));
    const contestTypes = formData.getAll("contestType").filter(isContestType2);
    const solvedStatus = String(formData.get("solvedStatus"));
    const sortOrder = String(formData.get("sortOrder"));
    return {
      minDifficulty: Number.isFinite(minDifficulty) ? minDifficulty : DEFAULT_FILTERS.minDifficulty,
      maxDifficulty: Number.isFinite(maxDifficulty) ? maxDifficulty : DEFAULT_FILTERS.maxDifficulty,
      contestTypes: contestTypes.length > 0 ? contestTypes : [...CONTEST_TYPES],
      solvedStatus: solvedStatus === "solved" || solvedStatus === "unsolved" ? solvedStatus : "all",
      sortOrder: isSortOrder2(sortOrder) ? sortOrder : DEFAULT_FILTERS.sortOrder,
      query: String(formData.get("query") ?? ""),
      page: currentPage
    };
  }
  function isContestType2(value) {
    return isContestTypeString(value);
  }
  function isContestTypeString(value) {
    return typeof value === "string" && CONTEST_TYPES.includes(value);
  }
  function isSortOrder2(value) {
    return value === "date_desc" || value === "date_asc" || value === "difficulty_asc" || value === "difficulty_desc";
  }

  // src/app/chart-viewport.ts
  function updateChartZoom(viewport, direction) {
    if (direction === "in")
      return { zoom: Math.min(8, viewport.zoom * 2), pan: clampPan(viewport.pan) };
    if (direction === "out")
      return { zoom: Math.max(1, viewport.zoom / 2), pan: clampPan(viewport.pan) };
    if (direction === "reset")
      return { zoom: 1, pan: 1 };
    return { zoom: viewport.zoom, pan: clampPan(viewport.pan) };
  }
  function updateChartPan(viewport, drag, currentX, chartWidth) {
    const width = chartWidth || 1;
    const visibleFraction = 1 / viewport.zoom;
    const deltaFraction = (currentX - drag.startX) / width;
    const nextPan = drag.startPan - deltaFraction / Math.max(0.01, 1 - visibleFraction);
    return { zoom: viewport.zoom, pan: clampPan(nextPan) };
  }
  function clampPan(value) {
    return Math.min(1, Math.max(0, value));
  }

  // src/app/events.ts
  function bindAppEvents(root, state2, isStandalone2, handlers) {
    let chartDrag = null;
    document.addEventListener("click", (event) => {
      const target = event.target;
      const tab = target.closest("[data-acps-tab]");
      if (!tab)
        return;
      event.preventDefault();
      state2.activeTab = isActiveTab(tab.dataset.acpsTab) ? tab.dataset.acpsTab : "problemset";
      history.pushState({ atcoderProblemsetTab: state2.activeTab }, "", EXTENSION_PATHS[state2.activeTab]);
      handlers.syncRouteToView();
      handlers.renderApp();
    });
    window.addEventListener("popstate", () => {
      handlers.syncRouteToView();
      handlers.renderApp();
    });
    root.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-acps-filter-form]");
      if (!form)
        return;
      event.preventDefault();
      state2.filters = { ...readFiltersFromForm(form, state2.filters.page), page: 1 };
      state2.noticeMessage = "";
      handlers.saveFilters();
      handlers.recalculate();
      handlers.renderApp();
    });
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!target.closest("[data-acps-reset]"))
        return;
      state2.filters = { ...DEFAULT_FILTERS };
      state2.noticeMessage = "";
      handlers.saveFilters();
      handlers.recalculate();
      handlers.renderApp();
    });
    root.addEventListener("click", (event) => {
      const target = event.target;
      const pageButton = target.closest("[data-acps-page]");
      if (!pageButton)
        return;
      const nextPage = Number(pageButton.dataset.acpsPage);
      if (!Number.isFinite(nextPage))
        return;
      state2.filters = { ...state2.filters, page: nextPage };
      state2.noticeMessage = "";
      handlers.saveFilters();
      handlers.renderApp();
    });
    root.addEventListener("click", (event) => {
      if (!event.target.closest("[data-acps-random]"))
        return;
      handlers.pickRandomUnsolvedFromCurrentPage();
    });
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-acps-start-training]");
      if (!button)
        return;
      const mode = button.dataset.acpsStartTraining;
      if (mode !== "ladder-2h" && mode !== "consistency-1h")
        return;
      handlers.startTraining(mode);
    });
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-acps-refresh-training]");
      if (!button)
        return;
      handlers.refreshTraining(false);
    });
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-acps-end-training]");
      if (!button)
        return;
      handlers.finishTraining();
    });
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-acps-cancel-training]");
      if (!button)
        return;
      handlers.cancelTrainingWithoutRating();
    });
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-acps-progress-mode]");
      if (!button)
        return;
      const mode = button.dataset.acpsProgressMode;
      if (mode !== "all" && mode !== "ladder-2h" && mode !== "consistency-1h")
        return;
      state2.progressMode = mode;
      handlers.renderApp();
    });
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-acps-chart-zoom]");
      if (!button)
        return;
      handlers.setChartViewport(updateChartZoom(handlers.getChartViewport(), button.dataset.acpsChartZoom));
      handlers.renderApp();
    });
    root.addEventListener("pointerdown", (event) => {
      const chart = event.target.closest("[data-acps-rating-chart]");
      if (!chart || handlers.getChartViewport().zoom <= 1)
        return;
      chartDrag = { startX: event.clientX, startPan: handlers.getChartViewport().pan };
      chart.setPointerCapture(event.pointerId);
      chart.classList.add("is-dragging");
    });
    root.addEventListener("pointermove", (event) => {
      const viewport = handlers.getChartViewport();
      if (!chartDrag || viewport.zoom <= 1)
        return;
      const chart = event.target.closest("[data-acps-rating-chart]");
      handlers.setChartViewport(updateChartPan(viewport, chartDrag, event.clientX, chart?.clientWidth || 1));
      handlers.renderApp();
    });
    root.addEventListener("pointerup", (event) => {
      const chart = event.target.closest("[data-acps-rating-chart]");
      chart?.classList.remove("is-dragging");
      chartDrag = null;
    });
    root.addEventListener("click", (event) => {
      if (!event.target.closest("[data-acps-export-training]"))
        return;
      handlers.exportTrainingJson();
    });
    root.addEventListener("change", (event) => {
      const input = event.target.closest("[data-acps-training-contest-type]");
      if (!input || !state2.trainingSettings)
        return;
      const checked = Array.from(root.querySelectorAll("[data-acps-training-contest-type]:checked")).map((checkbox) => checkbox.value).filter(isContestTypeString);
      state2.trainingSettings = {
        ...state2.trainingSettings,
        contestTypes: checked.length > 0 ? checked : ["ABC", "ARC", "AGC"]
      };
      handlers.saveTrainingState();
      handlers.renderApp();
    });
    root.addEventListener("click", (event) => {
      if (!event.target.closest("[data-acps-import-trigger]"))
        return;
      root.querySelector("[data-acps-import-training]")?.click();
    });
    root.addEventListener("click", (event) => {
      if (!event.target.closest("[data-acps-reset-training]"))
        return;
      handlers.resetTrainingHistory();
    });
    root.addEventListener("change", (event) => {
      const input = event.target.closest("[data-acps-import-training]");
      if (!input?.files?.[0])
        return;
      handlers.importTrainingJson(input.files[0]);
      input.value = "";
    });
    root.addEventListener("submit", (event) => {
      const form = event.target.closest("[data-acps-manual-user]");
      if (!form)
        return;
      event.preventDefault();
      handlers.updateManualUsername(String(new FormData(form).get("username") ?? "").trim());
    });
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (target.closest("[data-acps-login]"))
        handlers.loginToAtCoder();
      if (target.closest("[data-acps-logout]"))
        handlers.logoutFromAtCoder();
      if (target.closest("[data-acps-clear-cache]"))
        handlers.clearDesktopCache();
      if (target.closest("[data-acps-switch-account]"))
        handlers.switchDesktopAccount();
    });
    if (isStandalone2) {
      root.addEventListener("click", (event) => {
        const link = event.target.closest('a[href^="https://atcoder.jp/"]');
        if (!link)
          return;
        event.preventDefault();
        window.open(link.href, "_blank", "noopener");
      });
    }
  }

  // src/app/training-workflow.ts
  function completeSessionRating(session, ratingBefore) {
    const performance = calibrateTrainingPerformance(estimateTrainingPerformance(session), session);
    const ratingAfter = updateTrainingElo(ratingBefore, performance, session.mode);
    return {
      ...session,
      performance,
      ratingBefore,
      ratingAfter
    };
  }
  function getOfficialRatingAtOrBefore(history2, epochSecond) {
    const before = history2.filter((point) => point.epochSecond <= epochSecond).sort((a, b) => b.epochSecond - a.epochSecond)[0];
    return before?.rating ?? history2[history2.length - 1]?.rating;
  }
  function getPreviousModeRating(sessions, settings, mode) {
    const previous = sessions.filter((session) => session.mode === mode && session.ratingAfter !== void 0).sort((a, b) => b.startedAt - a.startedAt)[0];
    return previous?.ratingAfter ?? settings?.eloByMode[mode] ?? 400;
  }
  function recalibrateTrainingSessions(sessions, settings, officialHistory) {
    if (!settings || sessions.length === 0)
      return { sessions, settings, changed: false };
    const firstSessionTime = Math.min(...sessions.map((session) => session.startedAt));
    const baseRating = getOfficialRatingAtOrBefore(officialHistory, firstSessionTime) ?? settings.initializedFrom?.value ?? 400;
    const nextEloByMode = {
      "ladder-2h": baseRating,
      "consistency-1h": baseRating
    };
    let changed = false;
    const recalibrated = sessions.slice().sort((a, b) => a.startedAt - b.startedAt).map((session) => {
      const before = nextEloByMode[session.mode];
      const updated = completeSessionRating(session, before);
      nextEloByMode[session.mode] = updated.ratingAfter ?? before;
      if (updated.performance !== session.performance || updated.ratingAfter !== session.ratingAfter || updated.ratingBefore !== session.ratingBefore) {
        changed = true;
      }
      return updated;
    });
    if (!changed)
      return { sessions, settings, changed: false };
    return {
      sessions: recalibrated,
      settings: {
        ...settings,
        eloByMode: nextEloByMode
      },
      changed: true
    };
  }

  // src/app/bootstrap.ts
  var STORAGE_FILTER_KEY = "atcoder-problemset:state.filters";
  var AUTO_POLL_MS = 3 * 60 * 1e3;
  var MANUAL_REFRESH_MS = 60 * 1e3;
  var GRACE_POLL_MS = 2 * 60 * 1e3;
  var FREE_CANCEL_SECONDS2 = 10 * 60;
  var atCoderClient = new AtCoderClient(runtimeMessenger);
  var state = createAppState();
  var chartZoom = 1;
  var chartPan = 1;
  var hostNodes = [];
  var pollTimer;
  var tickTimer;
  var desktopStatus = null;
  var isStandalone = document.documentElement.hasAttribute("data-acps-standalone");
  async function bootstrap() {
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
  function injectShell() {
    if (document.getElementById(ROOT_ID))
      return;
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
  function syncRouteToView() {
    const routeTab = getTabFromPath(location.pathname);
    const root = document.getElementById(ROOT_ID);
    if (!routeTab) {
      setHostContentVisible(true);
      if (root)
        root.hidden = true;
      updateNavActiveState();
      return;
    }
    state.activeTab = routeTab;
    setHostContentVisible(false);
    if (root)
      root.hidden = false;
    updateNavActiveState();
  }
  function setHostContentVisible(visible) {
    for (const node of hostNodes) {
      if (!(node instanceof HTMLElement))
        continue;
      if (node.id === ROOT_ID)
        continue;
      node.hidden = !visible;
    }
  }
  function recalculate() {
    state.filteredRows = applyFilters(state.allRows, state.filters);
    state.stats = computeStats(state.filteredRows, countUnratedInScope(state.allRows, state.filters));
  }
  function renderApp() {
    const root = document.getElementById(ROOT_ID);
    if (!root)
      return;
    updateNavActiveState();
    const content = root.querySelector("[data-acps-content]");
    if (!content)
      return;
    content.innerHTML = renderAppLayout(state, {
      chartZoom,
      chartPan,
      desktopStatus,
      origin: location.origin,
      now: Math.floor(Date.now() / 1e3)
    }, (page) => {
      state.filters = { ...state.filters, page };
      void saveFilters(state.filters);
    });
  }
  function updateNavActiveState() {
    const routeTab = getTabFromPath(location.pathname);
    if (routeTab) {
      document.querySelectorAll("#navbar-collapse .navbar-nav:first-child > li, .navbar .navbar-nav:first-child > li").forEach((item) => {
        item.classList.remove("active");
      });
    }
    document.querySelectorAll("[data-acps-tab]").forEach((tab) => {
      const isActive = routeTab !== null && tab.dataset.acpsTab === routeTab;
      tab.parentElement?.classList.toggle("active", isActive);
    });
  }
  function pickRandomUnsolvedFromCurrentPage() {
    const totalPages = Math.max(1, Math.ceil(state.filteredRows.length / PAGE_SIZE));
    const currentPage = Math.min(Math.max(state.filters.page, 1), totalPages);
    const unsolvedRows = getCurrentPageRows(state.filteredRows, currentPage).filter((row) => !row.solved);
    if (unsolvedRows.length === 0) {
      state.noticeMessage = "All problems on this page have been completed. Move to another page to pick a random unsolved problem.";
      renderApp();
      return;
    }
    const selected = unsolvedRows[Math.floor(Math.random() * unsolvedRows.length)];
    if (!selected)
      return;
    state.noticeMessage = "";
    if (isStandalone)
      window.open(getProblemUrl(selected), "_blank", "noopener");
    else
      window.location.href = getProblemUrl(selected);
  }
  function renderLoginRequired() {
    setContent(`
    <div class="alert alert-warning acps-message">
      Log in to AtCoder to use the injected Problemset and Stats tabs.
    </div>
  `);
  }
  async function loginToAtCoder() {
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
  async function logoutFromAtCoder() {
    desktopStatus = await desktopControl.logout();
    state.noticeMessage = "Logged out. Public API mode remains available.";
    renderApp();
  }
  async function updateManualUsername(username) {
    try {
      desktopStatus = await desktopControl.setUsername(username);
      await applyDesktopIdentity(`Using public data for ${username}.`);
    } catch (error) {
      state.noticeMessage = String(error);
      renderApp();
    }
  }
  async function switchDesktopAccount() {
    if ((state.trainingSessions.length > 0 || state.activeSession) && !window.confirm("Switching accounts requires deleting the current local training history. Export it first if needed. Continue and reset it now?")) {
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
  async function clearDesktopCache() {
    await desktopControl.clearCache();
    state.noticeMessage = "API cache cleared. Reloading data...";
    renderApp();
    if (state.username)
      await reloadDesktopData();
  }
  async function applyDesktopIdentity(message) {
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
  async function reloadDesktopData() {
    renderLoading();
    const dataset = await requestDataset(state.username);
    state.allRows = buildProblemRows(dataset);
    state.officialHistory = await requestRatingHistory(state.username);
    await loadTrainingState();
    await ensureTrainingSettings();
    recalculate();
    renderApp();
  }
  function renderLoading() {
    setContent(`<div class="alert alert-info acps-message">Loading Kenkoooo problem and submission data for ${escapeHtml(state.username)}...</div>`);
  }
  function renderError(error) {
    setContent(`<div class="alert alert-danger acps-message">Failed to load AtCoder problemset data: ${escapeHtml(error)}</div>`);
  }
  function setContent(html) {
    const content = document.querySelector(`#${ROOT_ID} [data-acps-content]`);
    if (content)
      content.innerHTML = html;
  }
  async function startTraining(mode) {
    if (!state.trainingSettings)
      await ensureTrainingSettings();
    if (!state.trainingSettings || state.activeSession)
      return;
    try {
      const used = new Set(state.trainingSessions.flatMap((session) => session.problems.map((problem) => problem.problemId)));
      const target = roundTrainingTarget(state.trainingSettings.eloByMode[mode]);
      state.activeSession = generateTrainingSession(mode, state.username, target, state.allRows, used, Math.floor(Date.now() / 1e3), state.trainingSettings.contestTypes);
      state.noticeMessage = "";
      await saveTrainingState();
      startSessionTimers();
      renderApp();
    } catch (error) {
      state.noticeMessage = String(error);
      renderApp();
    }
  }
  async function refreshTraining(ignoreRateLimit) {
    if (!state.activeSession)
      return;
    const now = Math.floor(Date.now() / 1e3);
    if (!ignoreRateLimit && now < (state.activeSession.manualRefreshAvailableAt ?? 0))
      return;
    const submissions = await requestRecentSubmissions(state.username, state.activeSession.startedAt - 60, state.activeSession);
    state.activeSession = applyTrainingSubmissions(state.activeSession, submissions);
    state.activeSession.lastPolledAt = now;
    state.activeSession.manualRefreshAvailableAt = now + MANUAL_REFRESH_MS / 1e3;
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
  async function finishTraining() {
    if (!state.activeSession || !state.trainingSettings)
      return;
    await refreshTraining(true);
    if (!state.activeSession || !state.trainingSettings)
      return;
    state.activeSession.endedAt = Math.floor(Date.now() / 1e3);
    await finalizeActiveSession();
    renderApp();
    window.setTimeout(() => {
      void runGracePoll();
    }, GRACE_POLL_MS);
  }
  async function cancelTrainingWithoutRating() {
    if (!state.activeSession)
      return;
    const now = Math.floor(Date.now() / 1e3);
    if (now - state.activeSession.startedAt > FREE_CANCEL_SECONDS2) {
      state.noticeMessage = "The no-rating cancel window has expired.";
      renderApp();
      return;
    }
    if (!window.confirm("Cancel this training round without saving it or changing ELO?"))
      return;
    state.activeSession = void 0;
    state.noticeMessage = "Training round canceled without rating impact.";
    stopSessionTimers();
    await saveTrainingState();
    renderApp();
  }
  async function runGracePoll() {
    const last = state.trainingSessions[state.trainingSessions.length - 1];
    if (!last || last.gracePolledAt !== void 0)
      return;
    const submissions = await requestRecentSubmissions(state.username, last.startedAt - 60, last);
    const updated = applyTrainingSubmissions(last, submissions);
    updated.gracePolledAt = Math.floor(Date.now() / 1e3);
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
  async function finalizeActiveSession() {
    if (!state.activeSession || !state.trainingSettings)
      return;
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
    state.activeSession = void 0;
    state.noticeMessage = "Training session saved.";
    await saveTrainingState();
    stopSessionTimers();
  }
  async function recalibrateCompletedSessions() {
    const recalibrated = recalibrateTrainingSessions(state.trainingSessions, state.trainingSettings, state.officialHistory);
    if (!recalibrated.changed)
      return;
    state.trainingSessions = recalibrated.sessions;
    state.trainingSettings = recalibrated.settings;
    await saveTrainingState();
  }
  function startSessionTimers() {
    stopSessionTimers();
    if (!state.activeSession)
      return;
    tickTimer = window.setInterval(() => {
      if (state.activeTab === "training")
        renderApp();
      if (state.activeSession && Date.now() / 1e3 >= state.activeSession.startedAt + state.activeSession.durationSeconds) {
        void finishTraining();
      }
    }, 1e3);
    pollTimer = window.setInterval(() => {
      void refreshTraining(true);
    }, AUTO_POLL_MS);
  }
  function stopSessionTimers() {
    if (tickTimer !== void 0)
      window.clearInterval(tickTimer);
    if (pollTimer !== void 0)
      window.clearInterval(pollTimer);
    tickTimer = void 0;
    pollTimer = void 0;
  }
  async function requestDataset(user) {
    return atCoderClient.getDataset(user);
  }
  async function requestRatingHistory(user) {
    return atCoderClient.getRatingHistory(user);
  }
  async function requestRecentSubmissions(user, fromSecond, session) {
    return atCoderClient.getRecentSubmissions(user, fromSecond, session);
  }
  async function loadFilters() {
    const stored = await browserStorage.get(STORAGE_FILTER_KEY);
    return normalizeFilters(stored[STORAGE_FILTER_KEY]);
  }
  async function saveFilters(nextFilters) {
    await browserStorage.set({ [STORAGE_FILTER_KEY]: nextFilters });
  }
  async function loadTrainingState() {
    const stored = await trainingRepository().load();
    state.trainingSettings = stored.settings;
    state.trainingSessions = stored.sessions;
    state.activeSession = stored.activeSession;
  }
  async function ensureTrainingSettings() {
    const latest = state.officialHistory[state.officialHistory.length - 1];
    if (!state.trainingSettings || state.trainingSettings.username !== state.username) {
      state.trainingSettings = createTrainingSettings(state.username, latest?.rating ?? null, Math.floor(Date.now() / 1e3));
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
  async function saveTrainingState() {
    await trainingRepository().save({
      settings: state.trainingSettings,
      sessions: state.trainingSessions,
      activeSession: state.activeSession
    });
  }
  function exportTrainingJson() {
    if (!state.trainingSettings)
      return;
    const backup = makeTrainingBackup(state.username, state.trainingSettings, state.trainingSessions, state.activeSession);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `atcoder-training-${state.username}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importTrainingJson(file) {
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
  async function resetTrainingHistory() {
    if (!window.confirm("Reset all training history and active training state? This cannot be undone unless you exported a backup."))
      return;
    stopSessionTimers();
    state.trainingSessions = [];
    state.activeSession = void 0;
    state.trainingSettings = null;
    await trainingRepository().clear();
    await ensureTrainingSettings();
    state.noticeMessage = "Training history reset.";
    renderApp();
  }
  function trainingRepository() {
    return new TrainingRepository(browserStorage, state.username);
  }

  // src/entrypoints/content.ts
  void bootstrap();
})();
//# sourceMappingURL=content.js.map
