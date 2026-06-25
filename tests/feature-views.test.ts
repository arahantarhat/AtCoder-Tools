// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderProblemset } from "../src/features/problemset";
import { renderProgressView } from "../src/features/progress";
import { createTrainingSettings, generateTrainingSession, renderTrainingView } from "../src/features/training";
import type { Filters, ProblemRow } from "../src/types";

const filters: Filters = {
  minDifficulty: 800,
  maxDifficulty: 1600,
  contestTypes: ["ABC"],
  solvedStatus: "all",
  sortOrder: "date_desc",
  query: "",
  page: 1
};

const row: ProblemRow = {
  problem: { id: "abc100_a", contest_id: "abc100", title: "Example" },
  contest: { id: "abc100", title: "ABC 100", start_epoch_second: 100 },
  contestType: "ABC",
  difficulty: 800,
  model: { difficulty: 800 },
  startEpochSecond: 100,
  solved: false
};

describe("feature views", () => {
  it("renders problemset controls and pagination hooks", () => {
    document.body.innerHTML = renderProblemset({ rows: [row], filters, noticeMessage: "" });
    expect(document.querySelector("[data-acps-random]")).not.toBeNull();
    expect(document.querySelector("[data-acps-page]")).not.toBeNull();
    expect(document.body.textContent).toContain("abc100_a");
  });

  it("renders active training actions", () => {
    const settings = createTrainingSettings("tourist", 800, 100);
    const session = generateTrainingSession(
      "consistency-1h",
      "tourist",
      800,
      [
        row,
        { ...row, problem: { ...row.problem, id: "abc100_b" }, difficulty: 900 },
        { ...row, problem: { ...row.problem, id: "abc100_c" }, difficulty: 1000 }
      ],
      new Set(),
      100
    );
    document.body.innerHTML = renderTrainingView({
      settings,
      sessions: [],
      activeSession: session,
      noticeMessage: "",
      now: 120
    });
    expect(document.querySelector("[data-acps-refresh-training]")).not.toBeNull();
    expect(document.querySelector("[data-acps-end-training]")).not.toBeNull();
  });

  it("renders progress mode, zoom, import, and reset controls", () => {
    document.body.innerHTML = renderProgressView({
      officialHistory: [{ epochSecond: 100, rating: 800 }],
      sessions: [],
      settings: createTrainingSettings("tourist", 800, 100),
      mode: "all",
      zoom: 1,
      pan: 1,
      noticeMessage: "",
      now: 100
    });
    expect(document.querySelectorAll("[data-acps-progress-mode]")).toHaveLength(3);
    expect(document.querySelector("[data-acps-chart-zoom='in']")).not.toBeNull();
    expect(document.querySelector("[data-acps-import-trigger]")).not.toBeNull();
    expect(document.querySelector("[data-acps-reset-training]")).not.toBeNull();
  });
});
