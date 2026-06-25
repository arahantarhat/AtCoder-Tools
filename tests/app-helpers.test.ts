// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFiltersFromForm } from "../src/app/forms";
import { updateChartPan, updateChartZoom } from "../src/app/chart-viewport";
import { completeSessionRating, getPreviousModeRating } from "../src/app/training-workflow";
import { buildProblemRows } from "../src/features/problemset";
import { generateTrainingSession } from "../src/features/training";
import type { AtCoderDataset } from "../src/types";

describe("app form helpers", () => {
  it("parses filters from form data without reading global app state", () => {
    document.body.innerHTML = `<form>
      <input name="minDifficulty" value="800">
      <input name="maxDifficulty" value="bad">
      <input name="contestType" value="ABC" checked>
      <select name="solvedStatus"><option value="solved" selected>Solved</option></select>
      <select name="sortOrder"><option value="difficulty_desc" selected>Difficulty</option></select>
      <input name="query" value="dp">
    </form>`;
    const form = document.querySelector("form")!;

    expect(readFiltersFromForm(form, 3)).toMatchObject({
      minDifficulty: 800,
      maxDifficulty: 1600,
      contestTypes: ["ABC"],
      solvedStatus: "solved",
      sortOrder: "difficulty_desc",
      query: "dp",
      page: 3
    });
  });
});

describe("chart viewport helpers", () => {
  it("updates zoom and pan as pure viewport transforms", () => {
    expect(updateChartZoom({ zoom: 1, pan: 0.4 }, "in")).toEqual({ zoom: 2, pan: 0.4 });
    expect(updateChartZoom({ zoom: 2, pan: 0.4 }, "reset")).toEqual({ zoom: 1, pan: 1 });
    expect(updateChartPan({ zoom: 2, pan: 0.5 }, { startX: 100, startPan: 0.5 }, 150, 200).pan).toBeCloseTo(0);
  });
});

describe("training workflow helpers", () => {
  const dataset: AtCoderDataset = {
    contests: [
      { id: "abc200", title: "ABC 200", start_epoch_second: 1000 },
      { id: "abc201", title: "ABC 201", start_epoch_second: 2000 },
      { id: "abc202", title: "ABC 202", start_epoch_second: 3000 },
      { id: "abc203", title: "ABC 203", start_epoch_second: 4000 }
    ],
    problems: [
      { id: "abc200_a", contest_id: "abc200", title: "A", point: 100 },
      { id: "abc201_a", contest_id: "abc201", title: "B", point: 100 },
      { id: "abc202_a", contest_id: "abc202", title: "C", point: 100 },
      { id: "abc203_a", contest_id: "abc203", title: "D", point: 100 }
    ],
    models: {
      abc200_a: { difficulty: 800 },
      abc201_a: { difficulty: 1000 },
      abc202_a: { difficulty: 1100 },
      abc203_a: { difficulty: 1300 }
    },
    submissions: []
  };

  it("rates completed sessions without mutating app state", () => {
    const session = generateTrainingSession("consistency-1h", "tourist", 1000, buildProblemRows(dataset), new Set(), 100);
    const completed = completeSessionRating({ ...session, endedAt: 200 }, 1000);
    expect(completed.ratingBefore).toBe(1000);
    expect(completed.ratingAfter).toBeTypeOf("number");
  });

  it("derives previous mode rating from sessions before falling back to settings", () => {
    const session = {
      ...generateTrainingSession("ladder-2h", "tourist", 1000, buildProblemRows(dataset), new Set(), 100),
      ratingAfter: 1234
    };
    expect(getPreviousModeRating([session], null, "ladder-2h")).toBe(1234);
    expect(getPreviousModeRating([], null, "consistency-1h")).toBe(400);
  });
});
