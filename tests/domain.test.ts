import { describe, expect, it } from "vitest";
import {
  applyFilters,
  buildProblemRows,
  classifyContestType,
  countUnratedInScope
} from "../src/features/problemset";
import {
  applyTrainingSubmissions,
  calibrateTrainingPerformance,
  createTrainingSettings,
  estimateTrainingPerformance,
  generateTrainingSession,
  getSolvedPrefixLength,
  makeTrainingBackup,
  normalizeTrainingBackup,
  updateTrainingElo
} from "../src/features/training";
import { buildProgressTimeline } from "../src/features/progress";
import { computeStats } from "../src/features/stats";
import {
  getDifficultyBand,
  getDifficultyColor,
  getDifficultyColorName
} from "../src/shared/difficulty";
import type { AtCoderDataset, Filters, Submission, TrainingSession } from "../src/types";

const filters: Filters = {
  minDifficulty: 800,
  maxDifficulty: 1599,
  contestTypes: ["ABC", "ARC", "AGC", "AHC", "JOI", "Typical", "Other"],
  solvedStatus: "all",
  sortOrder: "date_desc",
  query: "",
  page: 1
};

const dataset: AtCoderDataset = {
  contests: [
    { id: "abc100", title: "AtCoder Beginner Contest 100", start_epoch_second: 1000 },
    { id: "arc100", title: "AtCoder Regular Contest 100", start_epoch_second: 2000 },
    { id: "typical90", title: "Typical 90", start_epoch_second: 3000 },
    { id: "misc2024", title: "Misc Contest", start_epoch_second: 4000 }
  ],
  problems: [
    { id: "abc100_a", contest_id: "abc100", title: "Happy Birthday" },
    { id: "abc100_b", contest_id: "abc100", title: "Ringo" },
    { id: "arc100_a", contest_id: "arc100", title: "Linear Approximation" },
    { id: "typical90_a", contest_id: "typical90", title: "Yokan Party" },
    { id: "misc2024_a", contest_id: "misc2024", title: "Unrated" }
  ],
  models: {
    abc100_a: { difficulty: 799 },
    abc100_b: { difficulty: 800 },
    arc100_a: { difficulty: 1599 },
    typical90_a: { difficulty: 1600 }
  },
  submissions: [
    { id: 1, epoch_second: 10, problem_id: "abc100_b", contest_id: "abc100", user_id: "tourist", result: "WA" },
    { id: 2, epoch_second: 20, problem_id: "abc100_b", contest_id: "abc100", user_id: "tourist", result: "AC" },
    { id: 3, epoch_second: 30, problem_id: "arc100_a", contest_id: "arc100", user_id: "tourist", result: "AC" }
  ]
};

describe("contest classification", () => {
  it("classifies common AtCoder contest families", () => {
    expect(classifyContestType("abc001")).toBe("ABC");
    expect(classifyContestType("arc001")).toBe("ARC");
    expect(classifyContestType("agc001")).toBe("AGC");
    expect(classifyContestType("ahc001")).toBe("AHC");
    expect(classifyContestType("joi2011yo")).toBe("JOI");
    expect(classifyContestType("typical90")).toBe("Typical");
    expect(classifyContestType("past202004-open")).toBe("Other");
  });
});

describe("training sessions", () => {
  const trainingDataset: AtCoderDataset = {
    contests: [
      { id: "abc200", title: "ABC 200", start_epoch_second: 1000 },
      { id: "abc201", title: "ABC 201", start_epoch_second: 2000 },
      { id: "abc202", title: "ABC 202", start_epoch_second: 3000 },
      { id: "abc203", title: "ABC 203", start_epoch_second: 4000 },
      { id: "abc204", title: "ABC 204", start_epoch_second: 5000 }
    ],
    problems: [
      { id: "abc200_a", contest_id: "abc200", title: "A", point: 100 },
      { id: "abc201_a", contest_id: "abc201", title: "B", point: 100 },
      { id: "abc202_a", contest_id: "abc202", title: "C", point: 100 },
      { id: "abc203_a", contest_id: "abc203", title: "D", point: 100 },
      { id: "abc204_a", contest_id: "abc204", title: "E", point: 100 }
    ],
    models: {
      abc200_a: { difficulty: 800 },
      abc201_a: { difficulty: 1000 },
      abc202_a: { difficulty: 1100 },
      abc203_a: { difficulty: 1300 },
      abc204_a: { difficulty: 1400 }
    },
    submissions: []
  };

  it("generates ordered 2h slots around the target rating", () => {
    const rows = buildProblemRows(trainingDataset);
    const session = generateTrainingSession("ladder-2h", "tourist", 1200, rows, new Set(), 100);

    expect(session.problems.map((problem) => problem.targetOffset)).toEqual([-400, -200, -100, 100]);
    expect(session.problems).toHaveLength(4);
    expect(session.problems[0]?.unlocked).toBe(true);
    expect(session.problems.slice(1).every((problem) => !problem.unlocked)).toBe(true);
  });

  it("filters generated training problems by contest type", () => {
    const rows = buildProblemRows({
      ...trainingDataset,
      contests: [
        ...trainingDataset.contests,
        { id: "arc300", title: "ARC 300", start_epoch_second: 6000 },
        { id: "arc301", title: "ARC 301", start_epoch_second: 7000 },
        { id: "arc302", title: "ARC 302", start_epoch_second: 8000 }
      ],
      problems: [
        ...trainingDataset.problems,
        { id: "arc300_a", contest_id: "arc300", title: "ARC A", point: 100 },
        { id: "arc301_a", contest_id: "arc301", title: "ARC B", point: 100 },
        { id: "arc302_a", contest_id: "arc302", title: "ARC C", point: 100 }
      ],
      models: {
        ...trainingDataset.models,
        arc300_a: { difficulty: 1100 },
        arc301_a: { difficulty: 1200 },
        arc302_a: { difficulty: 1300 }
      }
    });
    const session = generateTrainingSession("consistency-1h", "tourist", 1200, rows, new Set(), 100, ["ARC"]);

    expect(session.problems.every((problem) => problem.contestId.startsWith("arc"))).toBe(true);
  });

  it("never counts an out-of-order AC submitted before the problem unlocks", () => {
    const rows = buildProblemRows(trainingDataset);
    let session = generateTrainingSession("consistency-1h", "tourist", 1200, rows, new Set(), 1000);
    const second = session.problems[1]!;
    const first = session.problems[0]!;
    const submissions: Submission[] = [
      makeSubmission(1, second, 1100, "AC"),
      makeSubmission(2, first, 1200, "WA"),
      makeSubmission(3, first, 1300, "AC")
    ];

    session = applyTrainingSubmissions(session, submissions);

    expect(session.problems[0]?.solvedAt).toBe(1300);
    expect(session.problems[0]?.wrongAttempts).toBe(1);
    expect(session.problems[1]?.solvedAt).toBeUndefined();
    expect(getSolvedPrefixLength(session)).toBe(1);
  });

  it("updates an existing raw submission when a later poll sees it as AC", () => {
    const rows = buildProblemRows(trainingDataset);
    let session = generateTrainingSession("consistency-1h", "tourist", 1200, rows, new Set(), 1000);
    const first = session.problems[0]!;

    session = applyTrainingSubmissions(session, [makeSubmission(1, first, 1200, "WJ")]);
    expect(session.problems[0]?.solvedAt).toBeUndefined();

    session = applyTrainingSubmissions(session, [makeSubmission(1, first, 1200, "AC")]);
    expect(session.problems[0]?.solvedAt).toBe(1200);
    expect(session.problems[0]?.wrongAttempts).toBe(0);
  });

  it("estimates higher performance for faster identical solves", () => {
    const rows = buildProblemRows(trainingDataset);
    const fast = solveWholeSession(generateTrainingSession("ladder-2h", "tourist", 1200, rows, new Set(), 1000), 300);
    const slow = solveWholeSession(generateTrainingSession("ladder-2h", "tourist", 1200, rows, new Set(), 1000), 1500);

    expect(estimateTrainingPerformance(fast)).toBeGreaterThan(estimateTrainingPerformance(slow));
  });

  it("calibrates 1h raw performance toward the session target", () => {
    const rows = buildProblemRows(trainingDataset);
    const session = generateTrainingSession("consistency-1h", "tourist", 900, rows, new Set(), 1000);

    expect(calibrateTrainingPerformance(1437, session)).toBe(1195);
  });

  it("clamps one-session rating changes by mode", () => {
    expect(updateTrainingElo(1000, 3000, "consistency-1h")).toBe(1120);
    expect(updateTrainingElo(1000, -1000, "ladder-2h")).toBe(850);
  });

  it("uses a modest 1h ELO delta from calibrated performance", () => {
    expect(updateTrainingElo(802, 1151, "consistency-1h")).toBe(837);
  });

  it("builds a combined official and training timeline", () => {
    const session = {
      ...generateTrainingSession("consistency-1h", "tourist", 1200, buildProblemRows(trainingDataset), new Set(), 200),
      endedAt: 300,
      ratingAfter: 1230
    };

    const timeline = buildProgressTimeline(
      [{ epochSecond: 100, rating: 1200, contestName: "ABC" }],
      [session],
      "all"
    );

    expect(timeline.map((point) => point.epochSecond)).toEqual([100, 43200]);
    expect(timeline[0]?.trainingRating).toBeUndefined();
    expect(timeline[1]?.trainingRating).toBe(1230);
  });

  it("keeps only the highest training ELO per day in the progress timeline", () => {
    const rows = buildProblemRows(trainingDataset);
    const first = {
      ...generateTrainingSession("consistency-1h", "tourist", 1200, rows, new Set(), 1000),
      endedAt: 1_700_000_000,
      ratingAfter: 900
    };
    const second = {
      ...generateTrainingSession("ladder-2h", "tourist", 1200, rows, new Set(), 2000),
      endedAt: 1_700_001_000,
      ratingAfter: 950
    };

    const timeline = buildProgressTimeline([], [first, second], "all");

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.trainingRating).toBe(950);
  });

  it("validates JSON backups", () => {
    const rows = buildProblemRows(trainingDataset);
    const settings = createTrainingSettings("tourist", 1200, 100);
    const session = generateTrainingSession("consistency-1h", "tourist", 1200, rows, new Set(), 200);
    const backup = makeTrainingBackup("tourist", settings, [session]);

    expect(normalizeTrainingBackup(backup)?.sessions).toHaveLength(1);
    expect(normalizeTrainingBackup({ schemaVersion: 2 })).toBeNull();
    expect(settings.contestTypes).toEqual(["ABC", "ARC", "AGC"]);
  });
});

function makeSubmission(id: number, problem: TrainingSession["problems"][number], epochSecond: number, result: string): Submission {
  return {
    id,
    epoch_second: epochSecond,
    problem_id: problem.problemId,
    contest_id: problem.contestId,
    user_id: "tourist",
    result
  };
}

function solveWholeSession(session: TrainingSession, spacingSeconds: number): TrainingSession {
  const submissions = session.problems.map((problem, index) => makeSubmission(index + 1, problem, session.startedAt + spacingSeconds * (index + 1), "AC"));
  return applyTrainingSubmissions(session, submissions);
}

describe("difficulty filtering and stats", () => {
  it("uses inclusive min/max boundaries and excludes unrated problems", () => {
    const rows = buildProblemRows(dataset);
    const filtered = applyFilters(rows, filters);

    expect(filtered.map((row) => row.problem.id).sort()).toEqual(["abc100_b", "arc100_a"]);
    expect(countUnratedInScope(rows, filters)).toBe(1);
  });

  it("excludes experimental difficulty problems from rows", () => {
    const rows = buildProblemRows({
      ...dataset,
      problems: [...dataset.problems, { id: "abc999_x", contest_id: "abc100", title: "Experimental" }],
      models: { ...dataset.models, abc999_x: { difficulty: 1000, is_experimental: true } }
    });

    expect(rows.some((row) => row.problem.id === "abc999_x")).toBe(false);
  });

  it("filters by solved and unsolved status", () => {
    const rows = buildProblemRows(dataset);

    expect(applyFilters(rows, { ...filters, solvedStatus: "solved" }).map((row) => row.problem.id).sort()).toEqual([
      "abc100_b",
      "arc100_a"
    ]);
    expect(applyFilters(rows, { ...filters, solvedStatus: "unsolved" })).toEqual([]);
  });

  it("groups rated problems into 100-point Kenkoooo difficulty bands", () => {
    expect(getDifficultyBand(800)).toBe("800-899");
    expect(getDifficultyBand(1599)).toBe("1500-1599");

    const rows = buildProblemRows(dataset);
    const filtered = applyFilters(rows, filters);
    const stats = computeStats(filtered, countUnratedInScope(rows, filters));

    expect(stats.solved).toBe(2);
    expect(stats.total).toBe(2);
    expect(stats.byBand).toEqual([
      { band: "800-899", total: 1, solved: 1 },
      { band: "1500-1599", total: 1, solved: 1 }
    ]);
  });

  it("filters by contest family", () => {
    const rows = buildProblemRows(dataset);
    const filtered = applyFilters(rows, { ...filters, contestTypes: ["ARC"] });

    expect(filtered.map((row) => row.problem.id)).toEqual(["arc100_a"]);
  });

  it("sorts by contest date in both directions", () => {
    const rows = buildProblemRows(dataset);

    expect(applyFilters(rows, { ...filters, sortOrder: "date_desc" }).map((row) => row.problem.id)).toEqual([
      "arc100_a",
      "abc100_b"
    ]);
    expect(applyFilters(rows, { ...filters, sortOrder: "date_asc" }).map((row) => row.problem.id)).toEqual([
      "abc100_b",
      "arc100_a"
    ]);
  });

  it("maps difficulty values to AtCoder Problems rating colors", () => {
    expect(getDifficultyColorName(399)).toBe("Gray");
    expect(getDifficultyColorName(400)).toBe("Brown");
    expect(getDifficultyColorName(800)).toBe("Green");
    expect(getDifficultyColorName(1200)).toBe("Cyan");
    expect(getDifficultyColorName(1600)).toBe("Blue");
    expect(getDifficultyColorName(2000)).toBe("Yellow");
    expect(getDifficultyColorName(2400)).toBe("Orange");
    expect(getDifficultyColorName(2800)).toBe("Red");
    expect(getDifficultyColorName(3200)).toBe("Bronze");
    expect(getDifficultyColorName(3600)).toBe("Silver");
    expect(getDifficultyColorName(4000)).toBe("Gold");
    expect(getDifficultyColor(800)).toBe("#008000");
  });
});
