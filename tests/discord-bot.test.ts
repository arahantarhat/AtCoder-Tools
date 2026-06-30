import { describe, expect, it } from "vitest";
import { renderLineChart, renderStackedBarChart } from "../src/discord/charts";
import { buildDiscordCommands, handleInteraction, parseDifficultyRange, shouldReplyEphemerally, trainingResolutionMessage } from "../src/discord/commands";
import { graphReply } from "../src/discord/graphs";
import { graphsHelpMessage, leaderboardMessage, trainingHelpMessage } from "../src/discord/messages";
import { selectRandomDuelProblem, selectRandomProblem, selectTrainingProblem } from "../src/discord/problem-selection";
import { pointsForDelta, reviewDelaySeconds, updateTrainingRating } from "../src/discord/scoring";
import { DiscordTrainingBotService } from "../src/discord/service";
import { DiscordBotStore } from "../src/discord/storage";
import { getUtcMonthKey } from "../src/discord/time";
import { calculateDuelElo, calculateHandicapCoefficient, compareDuelSolves } from "../src/discord/duels";
import { profileAffiliationHasVerificationCode, type DiscordAtCoderService } from "../src/discord/atcoder";
import type { AtCoderDataset, OfficialRatingPoint, Submission } from "../src/types";

const dataset: AtCoderDataset = {
  contests: [
    { id: "abc100", title: "ABC 100", start_epoch_second: 1_600_000_000 },
    { id: "abc250", title: "ABC 250", start_epoch_second: 1_650_000_000 },
    { id: "adt_all_20231220", title: "AtCoder Daily Training ALL 2023/12/20", start_epoch_second: 1_655_000_000 },
    { id: "arc120", title: "ARC 120", start_epoch_second: 1_660_000_000 },
    { id: "agc050", title: "AGC 050", start_epoch_second: 1_670_000_000 }
  ],
  problems: [
    { id: "abc100_a", contest_id: "abc100", title: "Gray" },
    { id: "abc250_c", contest_id: "abc250", title: "Green" },
    { id: "adt_all_20231220_c", contest_id: "adt_all_20231220", title: "ADT Green" },
    { id: "arc120_b", contest_id: "arc120", title: "Cyan" },
    { id: "agc050_a", contest_id: "agc050", title: "Blue" }
  ],
  models: {
    abc100_a: { difficulty: 300 },
    abc250_c: { difficulty: 900 },
    adt_all_20231220_c: { difficulty: 850 },
    arc120_b: { difficulty: 1300 },
    agc050_a: { difficulty: 1700 }
  },
  submissions: [
    { id: 1, epoch_second: 1_700_000_000, problem_id: "abc100_a", contest_id: "abc100", user_id: "tourist", result: "AC" }
  ]
};

describe("Discord bot domain", () => {
  it("matches TLE gitgud point mapping", () => {
    expect([-300, -200, -100, 0, 100, 200, 300].map(pointsForDelta)).toEqual([2, 3, 5, 8, 12, 17, 23]);
  });

  it("moves training rating by outcome", () => {
    expect(updateTrainingRating(1000, "completed", 0)).toBeGreaterThan(1000);
    expect(updateTrainingRating(1000, "assisted", 0)).toBeLessThan(1000);
    expect(updateTrainingRating(1000, "skipped", 0)).toBeLessThan(updateTrainingRating(1000, "assisted", 0));
  });

  it("uses UTC month keys", () => {
    expect(getUtcMonthKey(Date.parse("2026-07-01T00:30:00Z") / 1000)).toBe("2026-07");
  });

  it("filters random problems by color, category, contest number, and date", () => {
    const row = selectRandomProblem(dataset, {
      color: "green",
      categories: ["ABC"],
      contestNumberMin: 200,
      afterEpochSecond: 1_640_000_000,
      unsolvedOnly: true
    }, 0);
    expect(row?.problem.id).toBe("abc250_c");
  });

  it("parses open-ended and bounded difficulty ranges", () => {
    expect(parseDifficultyRange("1400-")).toEqual({ minDifficulty: 1400, maxDifficulty: undefined });
    expect(parseDifficultyRange("-1400")).toEqual({ minDifficulty: undefined, maxDifficulty: 1400 });
    expect(parseDifficultyRange(" 1400 - 1600 ")).toEqual({ minDifficulty: 1400, maxDifficulty: 1600 });
    expect(() => parseDifficultyRange("1600-1400")).toThrow(/minimum/);
    expect(() => parseDifficultyRange("1400")).toThrow(/Difficulty range/);
  });

  it("filters Discord categories with ABC absorbing ADT", () => {
    expect(selectRandomProblem(dataset, { category: "ABC", minDifficulty: 800, maxDifficulty: 899 }, 0)?.problem.id)
      .toBe("adt_all_20231220_c");
    expect(selectRandomProblem(dataset, { category: "ARC" }, 0)?.problem.id).toBe("arc120_b");
    expect(selectRandomProblem(dataset, { category: "AGC" }, 0)?.problem.id).toBe("agc050_a");
  });

  it("defaults random problem filters to unsolved and can allow solved problems", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);

    await expect(service.gimme("guild", "1", {
      category: "ABC",
      maxDifficulty: 399,
      unsolvedOnly: true
    }, 1_700_000_100)).rejects.toThrow(/No problem matched/);

    const solved = await service.gimme("guild", "1", {
      category: "ABC",
      maxDifficulty: 399,
      unsolvedOnly: false
    }, 1_700_000_100);

    expect(solved.problemId).toBe("abc100_a");
    store.close();
  });

  it("excludes problems solved by either duelist by default", () => {
    const targetDataset: AtCoderDataset = {
      ...dataset,
      submissions: [
        { id: 2, epoch_second: 1_700_000_001, problem_id: "abc250_c", contest_id: "abc250", user_id: "benq", result: "AC" }
      ]
    };

    expect(selectRandomDuelProblem(dataset, targetDataset, {
      category: "ABC",
      minDifficulty: 900,
      maxDifficulty: 900,
      unsolvedOnly: true
    }, 0)).toBeNull();
    expect(selectRandomDuelProblem(dataset, targetDataset, {
      category: "ABC",
      minDifficulty: 900,
      maxDifficulty: 900,
      unsolvedOnly: false
    }, 0)?.problem.id).toBe("abc250_c");
  });

  it("selects adaptive training problems near the requested delta", () => {
    const selected = selectTrainingProblem(dataset, 1200, 100, new Set(), 0);
    expect(selected?.row.problem.id).toBe("arc120_b");
    expect(selected?.points).toBe(12);
  });

  it("sets longer review delays for skipped problems", () => {
    expect(reviewDelaySeconds("skipped")).toBeGreaterThan(reviewDelaySeconds("assisted"));
  });

  it("calculates duel Elo with K=60", () => {
    expect(calculateDuelElo(1200, 1200, 1)).toMatchObject({ deltaA: 30, deltaB: -30, ratingAAfter: 1230, ratingBAfter: 1170 });
    expect(calculateDuelElo(1000, 1600, 1).deltaA).toBeGreaterThan(55);
    expect(calculateDuelElo(1600, 1000, 1).deltaA).toBeLessThan(5);
    expect(calculateDuelElo(1200, 1200, 0.5)).toMatchObject({ deltaA: 0, deltaB: 0 });
  });

  it("calculates duel handicap coefficients", () => {
    expect(calculateHandicapCoefficient(1200, 1200, 1200)).toBe(1);
    expect(calculateHandicapCoefficient(1200, 800, 1600)).toBeGreaterThan(1);
    expect(calculateHandicapCoefficient(4000, 0, 4000)).toBe(3);
    expect(calculateHandicapCoefficient(4000, 4000, 0)).toBe(1 / 3);
  });
});

describe("Discord bot storage", () => {
  it("initializes schema idempotently and stores linked users per guild", () => {
    const store = new DiscordBotStore(":memory:");
    const first = store.linkUser("guild-a", "1", "tourist", 1500, 10);
    const second = store.linkUser("guild-a", "1", "tourist2", 1700, 20);
    const otherGuild = store.linkUser("guild-b", "1", "tourist", 900, 10);

    expect(first.trainingRating).toBe(1500);
    expect(second.trainingRating).toBe(1500);
    expect(second.atcoderUsername).toBe("tourist2");
    expect(otherGuild.trainingRating).toBe(900);
    store.close();
  });

  it("prevents duplicate active assignments and computes leaderboards from events", () => {
    const store = new DiscordBotStore(":memory:");
    store.linkUser("guild", "1", "tourist", 1200, 1);
    const assignment = store.createAssignment({
      guildId: "guild",
      discordUserId: "1",
      atcoderUsername: "tourist",
      mode: "train",
      problemId: "abc250_c",
      contestId: "abc250",
      title: "Green",
      difficulty: 900,
      targetDelta: 0,
      points: 8,
      assignedAt: 100
    });

    expect(() => store.createAssignment({
      guildId: "guild",
      discordUserId: "1",
      atcoderUsername: "tourist",
      mode: "train",
      problemId: "arc120_b",
      contestId: "arc120",
      title: "Cyan",
      difficulty: 1300,
      targetDelta: 100,
      points: 12,
      assignedAt: 101
    })).toThrow(/active assignment/);

    store.addScoreEvent({
      guildId: "guild",
      discordUserId: "1",
      assignmentId: assignment.id,
      points: 8,
      reason: "completed",
      occurredAt: 100,
      monthKey: "2026-06"
    });

    expect(store.getPoints("guild", "1", "2026-06")).toBe(8);
    expect(store.getLeaderboard("guild", "2026-06")).toEqual([{ discordUserId: "1", atcoderUsername: "tourist", points: 8 }]);
    store.close();
  });

  it("aggregates graph data from assignments and score events", () => {
    const store = new DiscordBotStore(":memory:");
    store.linkUser("guild", "1", "tourist", 1200, 1);
    store.linkUser("guild", "2", "benq", 1800, 1);
    const first = store.createAssignment({
      guildId: "guild",
      discordUserId: "1",
      atcoderUsername: "tourist",
      mode: "train",
      problemId: "abc250_c",
      contestId: "abc250",
      title: "Green",
      difficulty: 900,
      targetDelta: 0,
      points: 8,
      assignedAt: 1_780_000_000
    });
    store.resolveAssignment(first, "completed", 1_780_000_100);
    store.addScoreEvent({
      guildId: "guild",
      discordUserId: "1",
      assignmentId: first.id,
      points: 8,
      reason: "completed",
      occurredAt: 1_780_000_100,
      monthKey: "2026-05"
    });
    store.addScoreEvent({
      guildId: "guild",
      discordUserId: "2",
      assignmentId: first.id,
      points: 20,
      reason: "completed",
      occurredAt: 1_780_000_200,
      monthKey: "2026-05"
    });

    expect(store.listAssignmentsForGraph("guild", "1", 1_779_999_999)).toHaveLength(1);
    expect(store.getMonthlyPointsSince("guild", "1", 1_779_999_999)).toEqual([{ monthKey: "2026-05", points: 8 }]);
    expect(store.getTopLeaderboardUsersSince("guild", 1_779_999_999, 1)).toEqual([{ discordUserId: "2", atcoderUsername: "benq", points: 20 }]);
    expect(store.getLeaderboardTrendSince("guild", ["1", "2"], 1_779_999_999)).toEqual([
      { discordUserId: "1", atcoderUsername: "tourist", monthKey: "2026-05", points: 8 },
      { discordUserId: "2", atcoderUsername: "benq", monthKey: "2026-05", points: 20 }
    ]);
    store.close();
  });

  it("keeps the last training rating event per UTC day", () => {
    const store = new DiscordBotStore(":memory:");
    store.linkUser("guild", "1", "tourist", 1200, 1);
    store.recordTrainingRating("guild", "1", 1300, Math.floor(Date.parse("2026-06-25T10:00:00Z") / 1000));
    store.recordTrainingRating("guild", "1", 1250, Math.floor(Date.parse("2026-06-25T09:00:00Z") / 1000));
    store.recordTrainingRating("guild", "1", 1400, Math.floor(Date.parse("2026-06-25T23:00:00Z") / 1000));
    store.recordTrainingRating("guild", "1", 1425, Math.floor(Date.parse("2026-06-26T01:00:00Z") / 1000));

    expect(store.getTrainingRatingHistorySince("guild", "1", Math.floor(Date.parse("2026-06-25T00:00:00Z") / 1000))).toEqual([
      { dayKey: "2026-06-25", epochSecond: Math.floor(Date.parse("2026-06-25T23:00:00Z") / 1000), rating: 1400 },
      { dayKey: "2026-06-26", epochSecond: Math.floor(Date.parse("2026-06-26T01:00:00Z") / 1000), rating: 1425 }
    ]);
    store.close();
  });
});

describe("Discord duel verification rules", () => {
  const baseDuel = {
    id: 1,
    guildId: "guild",
    challengerUserId: "1",
    targetUserId: "2",
    status: "active" as const,
    challengedAt: 90,
    acceptedAt: 100,
    expiresAt: 100 + 24 * 60 * 60,
    handicapCoefficient: 2,
    lowerRatedUserId: "1",
    higherRatedUserId: "2"
  };

  it("keeps duels active when nobody solved", () => {
    expect(compareDuelSolves({ duel: baseDuel, hasPendingJudgement: false, now: 150 })).toMatchObject({
      status: "active",
      reason: "nobody_solved"
    });
  });

  it("lets lower-rated solve immediately", () => {
    expect(compareDuelSolves({ duel: baseDuel, challengerSolvedAt: 180, hasPendingJudgement: false, now: 181 })).toMatchObject({
      status: "completed",
      result: "challenger_win",
      winnerUserId: "1"
    });
  });

  it("keeps higher-rated solve open until the lower handicap window closes", () => {
    expect(compareDuelSolves({ duel: baseDuel, targetSolvedAt: 200, hasPendingJudgement: false, now: 250 })).toMatchObject({
      status: "active",
      reason: "higher_window_open",
      remainingSeconds: 50
    });
    expect(compareDuelSolves({ duel: baseDuel, targetSolvedAt: 200, hasPendingJudgement: false, now: 300 })).toMatchObject({
      status: "completed",
      result: "target_win",
      winnerUserId: "2"
    });
  });

  it("compares both solves by adjusted duration and detects exact draws", () => {
    expect(compareDuelSolves({ duel: baseDuel, challengerSolvedAt: 250, targetSolvedAt: 200, hasPendingJudgement: false, now: 260 })).toMatchObject({
      status: "completed",
      result: "challenger_win"
    });
    expect(compareDuelSolves({ duel: baseDuel, challengerSolvedAt: 300, targetSolvedAt: 200, hasPendingJudgement: false, now: 310 })).toMatchObject({
      status: "completed",
      result: "draw"
    });
  });

  it("asks users to retry while submissions are pending or judging", () => {
    expect(compareDuelSolves({ duel: baseDuel, hasPendingJudgement: true, now: 150 })).toMatchObject({
      status: "pending_judgement"
    });
  });
});

describe("Discord graph rendering", () => {
  it("renders PNG line and stacked bar charts", async () => {
    const line = await renderLineChart("A <chart>", [
      { label: "Rating", color: "#2563eb", points: [{ x: 1, y: 1200, label: "A&B" }, { x: 2, y: 1300 }] }
    ], ["one", "two"]);
    const bars = await renderStackedBarChart("Bars", ["<gray>"], [
      { label: "Completed", color: "#16a34a", values: [2] }
    ]);

    expect([...line.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([...bars.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(line.length).toBeGreaterThan(1000);
    expect(bars.length).toBeGreaterThan(1000);
  });
});

describe("Discord AtCoder adapter", () => {
  it("finds a profile verification code in the Affiliation row", () => {
    expect(profileAffiliationHasVerificationCode(`
      <table class="dl-table">
        <tr><th class="no-break">Affiliation</th><td class="break-all">Team ACD-k7F3Q9Zp</td></tr>
      </table>
    `, "ACD-k7F3Q9Zp")).toBe(true);
  });

  it("does not match a profile verification code outside Affiliation", () => {
    expect(profileAffiliationHasVerificationCode(`
      <table class="dl-table">
        <tr><th class="no-break">X(Twitter) ID</th><td>ACD-k7F3Q9Zp</td></tr>
        <tr><th class="no-break">Affiliation</th><td class="break-all">ITMO University</td></tr>
      </table>
    `, "ACD-k7F3Q9Zp")).toBe(false);
  });
});

describe("Discord bot service", () => {
  it("requires a fresh profile code before linking an AtCoder handle", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true, [], false));
    const pending = await service.linkUser("guild", "1", "tourist", 1_700_000_000);

    expect(pending.status).toBe("pending");
    expect(store.getLinkedUser("guild", "1")).toBeNull();
    const challenge = store.getPendingLinkChallenge("guild", "1");
    expect(challenge?.atcoderUsername).toBe("tourist");
    expect(challenge?.verificationType).toBe("profile_code");
    expect(challenge?.verificationCode).toMatch(/^ACD-/);

    const stillPending = await service.linkUser("guild", "1", "tourist", 1_700_000_060);

    expect(stillPending.status).toBe("pending");
    expect(store.getLinkedUser("guild", "1")).toBeNull();
    store.close();
  });

  it("links the handle after the requested profile code is visible", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));

    const user = await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);

    expect(user.atcoderUsername).toBe("tourist");
    expect(store.getPendingLinkChallenge("guild", "1")).toBeNull();
    store.close();
  });

  it("does not start a new link challenge for an already linked user", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);

    const result = await service.linkUser("guild", "1", "benq", 1_700_000_120);

    expect(result.status).toBe("already_linked");
    expect(result.status === "already_linked" ? result.user.atcoderUsername : null).toBe("tourist");
    expect(store.getPendingLinkChallenge("guild", "1")).toBeNull();
    expect(store.getLinkedUserOrThrow("guild", "1").atcoderUsername).toBe("tourist");
    store.close();
  });

  it("awards points after verified AC and queues assisted reviews", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await service.startTraining("guild", "1", 0, 1_700_000_100);
    const result = await service.resolveTraining("guild", "1", "assisted", 1_700_000_200);

    expect(result.points).toBe(8);
    expect(store.getPoints("guild", "1", "2023-11")).toBe(8);
    expect(store.listReviewQueue("guild", "1")).toHaveLength(1);
    store.close();
  });

  it("does not let /gimme block a later training assignment", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await service.gimme("guild", "1", { color: "green" }, 1_700_000_050);
    const assignment = await service.startTraining("guild", "1", 0, 1_700_000_100);

    expect(assignment.mode).toBe("train");
    store.close();
  });

  it("releases the active assignment while completion waits for verification", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(false));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await service.startTraining("guild", "1", 0, 1_700_000_100);

    const result = await service.resolveTraining("guild", "1", "completed", 1_700_000_200);

    expect(result.verification).toBe("pending");
    expect(result.points).toBe(0);
    expect(result.rating).toBeNull();
    expect(store.getActiveAssignment("guild", "1")).toBeNull();
    expect(store.listPendingVerificationForUser("guild", "1")).toHaveLength(1);
    expect(store.getPoints("guild", "1", "2023-11")).toBe(0);
    await expect(service.startTraining("guild", "1", 0, 1_700_000_300)).resolves.toMatchObject({ mode: "train" });
    store.close();
  });

  it("explains pending verification after an unverified completion claim", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(false));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await service.startTraining("guild", "1", 0, 1_700_000_100);

    const result = await service.resolveTraining("guild", "1", "completed", 1_700_000_200);
    const message = trainingResolutionMessage(result);

    expect(message).toContain("pending verification");
    expect(message).toContain("/train verify");
    expect(message).toContain("/train status");
    store.close();
  });

  it("reports an already recorded completion claim when /train completed is repeated", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(false));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await service.startTraining("guild", "1", 0, 1_700_000_100);
    await service.resolveTraining("guild", "1", "completed", 1_700_000_200);

    await expect(service.resolveTraining("guild", "1", "completed", 1_700_000_240))
      .rejects.toThrow(/completed claim already recorded and pending verification/);
    store.close();
  });

  it("reports an already recorded completion claim when the Completed button is pressed again", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(false));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    const assignment = await service.startTraining("guild", "1", 0, 1_700_000_100);
    await service.resolveTraining("guild", "1", "completed", 1_700_000_200, assignment.id);

    await expect(service.resolveTraining("guild", "1", "completed", 1_700_000_240, assignment.id))
      .rejects.toThrow(/completed claim already recorded and pending verification/);
    store.close();
  });

  it("rejects stale training button assignment ids", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(false));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    const first = await service.startTraining("guild", "1", 0, 1_700_000_100);
    await service.resolveTraining("guild", "1", "completed", 1_700_000_200, first.id);
    const second = await service.startTraining("guild", "1", 300, 1_700_000_300);

    await expect(service.resolveTraining("guild", "1", "completed", 1_700_000_400, first.id))
      .rejects.toThrow(/older assignment/);
    expect(store.getActiveAssignment("guild", "1")?.id).toBe(second.id);
    store.close();
  });

  it("awards pending completion points after later public verification", async () => {
    let solved = false;
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(() => solved));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    const assignment = await service.startTraining("guild", "1", 0, 1_700_000_100);

    await service.resolveTraining("guild", "1", "completed", 1_700_000_200);
    expect(store.getPoints("guild", "1", "2023-11")).toBe(0);

    solved = true;
    const result = await service.verifyPendingAssignmentsForUser("guild", "1", 1_700_000_300);

    expect(result).toEqual({ checked: 1, verified: 1, remaining: 0 });
    expect(store.getAssignment(assignment.id)?.status).toBe("completed");
    expect(store.getPoints("guild", "1", "2023-11")).toBe(8);
    expect(store.getLinkedUserOrThrow("guild", "1").trainingRating).toBeGreaterThan(1200);
    store.close();
  });

  it("creates, accepts, denies, and rejects invalid duel challenges", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeDuelAtCoder({}));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await linkForTest(service, "guild", "2", "benq", 1_700_000_000);

    await expect(service.challengeDuel("guild", "1", "1", 1_700_000_100)).rejects.toThrow(/yourself/);
    await expect(service.challengeDuel("guild", "1", "3", 1_700_000_100)).rejects.toThrow(/not linked/);

    const challenge = await service.challengeDuel("guild", "1", "2", 1_700_000_100);
    expect(challenge.duel.status).toBe("pending");
    await expect(service.challengeDuel("guild", "2", "1", 1_700_000_110)).rejects.toThrow(/already a pending/);

    const accepted = await service.acceptDuel("guild", "2", "1", 1_700_000_120);
    expect(accepted.duel.status).toBe("active");
    expect(accepted.duel.challengerHandle).toBe("tourist");
    expect(accepted.duel.targetHandle).toBe("benq");
    expect(accepted.duel.problemId).toBeTruthy();
    expect(accepted.duel.difficulty).toEqual(expect.any(Number));
    expect(store.getDuelProfile("guild", "1")?.duelRating).toBe(1200);

    await expect(service.challengeDuel("guild", "1", "2", 1_700_000_130)).rejects.toThrow(/active duel/);
    store.close();
  });

  it("denies the selected received duel and expires stale pending challenges", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeDuelAtCoder({}));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await linkForTest(service, "guild", "2", "benq", 1_700_000_000);
    await linkForTest(service, "guild", "3", "rng58", 1_700_000_000);

    await service.challengeDuel("guild", "1", "2", 1_700_000_100);
    await expect(service.acceptDuel("guild", "2", "1", 1_700_001_001)).rejects.toThrow(/no longer pending/);

    const first = await service.challengeDuel("guild", "1", "2", 1_700_001_100);
    await service.challengeDuel("guild", "3", "2", 1_700_001_110);
    const denied = await service.denyDuel("guild", "2", "1", 1_700_001_120);
    expect(denied.duel.id).toBe(first.duel.id);
    expect(denied.duel.status).toBe("declined");
    store.close();
  });

  it("accepts only the selected challenger for slash-command duel invites", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeDuelAtCoder({}));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await linkForTest(service, "guild", "2", "benq", 1_700_000_000);
    await linkForTest(service, "guild", "3", "rng58", 1_700_000_000);

    const challenge = await service.challengeDuel("guild", "1", "2", 1_700_000_100);
    await expect(service.acceptDuel("guild", "2", "3", 1_700_000_120)).rejects.toThrow(/no longer pending/);
    await expect(service.acceptDuel("guild", "1", "2", 1_700_000_120)).rejects.toThrow(/challenged user/);

    const accepted = await service.acceptDuel("guild", "2", "1", 1_700_000_120);
    expect(accepted.duel.id).toBe(challenge.duel.id);
    expect(accepted.duel.status).toBe("active");
    store.close();
  });

  it("persists duel challenge filters and requires unsolved problems for both users by default", async () => {
    const store = new DiscordBotStore(":memory:");
    const targetDataset: AtCoderDataset = {
      ...dataset,
      submissions: [
        { id: 2, epoch_second: 1_700_000_001, problem_id: "abc250_c", contest_id: "abc250", user_id: "benq", result: "AC" }
      ]
    };
    const service = new DiscordTrainingBotService(store, fakeDuelAtCoder({}, {}, { tourist: dataset, benq: targetDataset }));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await linkForTest(service, "guild", "2", "benq", 1_700_000_000);

    const blocked = await service.challengeDuel("guild", "1", "2", {
      category: "ABC",
      minDifficulty: 900,
      maxDifficulty: 900,
      unsolvedOnly: true
    }, 1_700_000_100);

    expect(blocked.duel.filterCategory).toBe("ABC");
    expect(blocked.duel.filterMinDifficulty).toBe(900);
    expect(blocked.duel.filterMaxDifficulty).toBe(900);
    expect(blocked.duel.filterAllowSolved).toBe(false);
    await expect(service.acceptDuel("guild", "2", "1", 1_700_000_120)).rejects.toThrow(/No duel problem/);
    await service.denyDuel("guild", "2", "1", 1_700_000_130);

    await service.challengeDuel("guild", "1", "2", {
      category: "ABC",
      minDifficulty: 900,
      maxDifficulty: 900,
      unsolvedOnly: false
    }, 1_700_000_140);
    const accepted = await service.acceptDuel("guild", "2", "1", 1_700_000_160);

    expect(accepted.duel.problemId).toBe("abc250_c");
    expect(accepted.duel.filterAllowSolved).toBe(true);
    store.close();
  });

  it("verifies duel outcomes and keeps repeated verification idempotent", async () => {
    const store = new DiscordBotStore(":memory:");
    const submissions: Record<string, Submission[]> = {
      tourist: [],
      benq: []
    };
    const service = new DiscordTrainingBotService(store, fakeDuelAtCoder(submissions));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await linkForTest(service, "guild", "2", "benq", 1_700_000_000);
    const challenge = await service.challengeDuel("guild", "1", "2", 1_700_000_100);
    const accepted = await service.acceptDuel("guild", "2", "1", 1_700_000_200);

    await expect(service.verifyDuel("guild", "1", 1_700_000_250)).resolves.toMatchObject({
      status: "active",
      comparison: { status: "active", reason: "nobody_solved" }
    });

    submissions.tourist = [submission("tourist", accepted.duel, "AC", 1_700_000_300)];
    const completed = await service.verifyDuel("guild", "1", 1_700_000_320);

    expect(completed).toMatchObject({ status: "completed", alreadyCompleted: false });
    expect(completed.status === "completed" ? completed.duel.status : null).toBe("completed");
    expect(store.getDuelProfile("guild", "1")?.duelRating).toBeGreaterThan(1200);
    const afterFirst = store.getDuelProfile("guild", "1")?.duelRating;

    const repeated = await service.verifyDuel("guild", "1", 1_700_000_400);

    expect(repeated).toMatchObject({ status: "completed", alreadyCompleted: true });
    expect(store.getDuelProfile("guild", "1")?.duelRating).toBe(afterFirst);
    store.close();
  });

  it("reports pending judgement and higher-rated handicap windows for duel verification", async () => {
    const store = new DiscordBotStore(":memory:");
    const submissions: Record<string, Submission[]> = {
      tourist: [],
      benq: []
    };
    const service = new DiscordTrainingBotService(store, fakeDuelAtCoder(submissions, { tourist: 1000, benq: 1600 }));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await linkForTest(service, "guild", "2", "benq", 1_700_000_000);
    const challenge = await service.challengeDuel("guild", "1", "2", 1_700_000_100);
    const accepted = await service.acceptDuel("guild", "2", "1", 1_700_000_200);

    submissions.benq = [submission("benq", accepted.duel, "Judging", 1_700_000_240)];
    await expect(service.verifyDuel("guild", "1", 1_700_000_250)).resolves.toMatchObject({ status: "pending_judgement" });

    submissions.benq = [submission("benq", accepted.duel, "AC", 1_700_000_240)];
    await expect(service.verifyDuel("guild", "1", 1_700_000_250)).resolves.toMatchObject({
      status: "active",
      comparison: { status: "active", reason: "higher_window_open" }
    });
    store.close();
  });

  it("exposes the V1 slash commands including help", () => {
    const commands = buildDiscordCommands();
    expect(commands.map((command) => command.name)).toEqual(["help", "link", "gimme", "train", "duel", "graphs"]);
    const gimme = commands.find((command) => command.name === "gimme");
    expect(gimme?.options?.map((option) => option.name)).toEqual(["category", "range", "color", "allow_solved"]);
    const gimmeCategory = gimme?.options?.find((option) => option.name === "category");
    expect(gimmeCategory && "choices" in gimmeCategory ? gimmeCategory.choices?.map((choice) => choice.value) : undefined)
      .toEqual(["ABC", "ARC", "AGC"]);
    const train = commands.find((command) => command.name === "train");
    expect(train?.options?.map((option) => option.name)).toEqual([
      "help",
      "start",
      "current",
      "completed",
      "assisted",
      "skip",
      "verify",
      "status",
      "queue",
      "review",
      "leaderboard"
    ]);
    const status = train?.options?.find((option) => option.name === "status");
    const statusOptions = status && "options" in status ? status.options : undefined;
    expect(statusOptions?.map((option) => option.name)).toEqual(["user"]);
    const leaderboard = train?.options?.find((option) => option.name === "leaderboard");
    const leaderboardOptions = leaderboard && "options" in leaderboard ? leaderboard.options : undefined;
    expect(leaderboardOptions?.map((option) => option.name)).toEqual(["month", "period"]);
    const graphs = commands.find((command) => command.name === "graphs");
    const duel = commands.find((command) => command.name === "duel");
    expect(duel?.options?.map((option) => option.name)).toEqual(["challenge", "accept", "deny", "status", "verify", "history"]);
    const duelChallenge = duel?.options?.find((option) => option.name === "challenge");
    const duelChallengeOptions = duelChallenge && "options" in duelChallenge ? duelChallenge.options : undefined;
    expect(duelChallengeOptions?.map((option) => option.name)).toEqual(["user", "category", "range", "color", "allow_solved"]);
    const duelCategory = duelChallengeOptions?.find((option) => option.name === "category");
    expect(duelCategory && "choices" in duelCategory ? duelCategory.choices?.map((choice) => choice.value) : undefined)
      .toEqual(["ABC", "ARC", "AGC"]);
    const duelAccept = duel?.options?.find((option) => option.name === "accept");
    const duelAcceptOptions = duelAccept && "options" in duelAccept ? duelAccept.options : undefined;
    expect(duelAcceptOptions?.map((option) => option.name)).toEqual(["user"]);
    const duelDeny = duel?.options?.find((option) => option.name === "deny");
    const duelDenyOptions = duelDeny && "options" in duelDeny ? duelDeny.options : undefined;
    expect(duelDenyOptions?.map((option) => option.name)).toEqual(["user"]);
    expect(graphs?.options?.map((option) => option.name)).toEqual(["help", "official", "training", "points", "solved"]);
    for (const subcommand of graphs?.options ?? []) {
      if (subcommand.name === "help" || subcommand.name === "solved") continue;
      const options = "options" in subcommand ? subcommand.options : undefined;
      const range = options?.find((option) => option.name === "range");
      expect(range && "choices" in range ? range.choices?.map((choice) => choice.value) : undefined).toEqual(["30d", "90d", "6m", "1y", "full"]);
    }
  });

  it("keeps private Discord surfaces ephemeral while normal activity remains public", () => {
    expect(shouldReplyEphemerally("help")).toBe(true);
    expect(shouldReplyEphemerally("link")).toBe(true);
    expect(shouldReplyEphemerally("train", "help")).toBe(true);
    expect(shouldReplyEphemerally("train", "queue")).toBe(true);
    expect(shouldReplyEphemerally("graphs", "help")).toBe(true);

    expect(shouldReplyEphemerally("gimme")).toBe(false);
    expect(shouldReplyEphemerally("train", "start")).toBe(false);
    expect(shouldReplyEphemerally("train", "current")).toBe(false);
    expect(shouldReplyEphemerally("train", "completed")).toBe(false);
    expect(shouldReplyEphemerally("train", "assisted")).toBe(false);
    expect(shouldReplyEphemerally("train", "skip")).toBe(false);
    expect(shouldReplyEphemerally("train", "verify")).toBe(false);
    expect(shouldReplyEphemerally("train", "review")).toBe(false);
    expect(shouldReplyEphemerally("train", "status")).toBe(false);
    expect(shouldReplyEphemerally("train", "leaderboard")).toBe(false);
    expect(shouldReplyEphemerally("duel", "challenge")).toBe(false);
    expect(shouldReplyEphemerally("duel", "accept")).toBe(false);
    expect(shouldReplyEphemerally("duel", "deny")).toBe(false);
    expect(shouldReplyEphemerally("duel", "status")).toBe(false);
    expect(shouldReplyEphemerally("duel", "verify")).toBe(false);
    expect(shouldReplyEphemerally("duel", "history")).toBe(false);
    expect(shouldReplyEphemerally("graphs", "training")).toBe(false);
  });

  it("defers slow slash commands before running service work", async () => {
    const events: string[] = [];
    const service = {
      gimme: async () => {
        events.push("service");
        return {
          id: 0,
          guildId: "guild",
          discordUserId: "1",
          atcoderUsername: "tourist",
          mode: "gimme",
          problemId: "abc250_c",
          contestId: "abc250",
          title: "Green",
          difficulty: 900,
          targetDelta: 0,
          points: 0,
          status: "active",
          assignedAt: 1
        };
      }
    } as unknown as DiscordTrainingBotService;
    const interaction = fakeChatInputInteraction("gimme", null, events);

    await handleInteraction(interaction, service, {} as DiscordBotStore);

    expect(events).toEqual(["defer:false", "service", "edit"]);
  });

  it("defers duel slash commands and routes challenge work", async () => {
    const events: string[] = [];
    const service = {
      challengeDuel: async () => {
        events.push("service");
        return {
          duel: {
            id: 1,
            guildId: "guild",
            challengerUserId: "1",
            targetUserId: "2",
            status: "pending",
            challengedAt: 1,
            expiresAt: 901
          },
          challenger: { atcoderUsername: "tourist" },
          target: { atcoderUsername: "benq" }
        };
      }
    } as unknown as DiscordTrainingBotService;
    const interaction = fakeChatInputInteraction("duel", "challenge", events, fakeUser("2"));

    await handleInteraction(interaction, service, {} as DiscordBotStore);

    expect(events).toEqual(["defer:false", "service", "edit"]);
  });

  it("accepts selected duel invites through public slash commands", async () => {
    const events: string[] = [];
    const service = {
      acceptDuel: async (guildId: string, discordUserId: string, challengerUserId: string) => {
        events.push(`${guildId}:${discordUserId}:${challengerUserId}`);
        return {
          duel: {
            id: 1,
            guildId,
            challengerUserId,
            targetUserId: discordUserId,
            status: "active",
            challengedAt: 1,
            acceptedAt: 2,
            expiresAt: 3,
            contestId: "abc250",
            problemId: "abc250_c",
            title: "Green",
            difficulty: 900
          }
        };
      }
    } as unknown as DiscordTrainingBotService;
    const interaction = fakeChatInputInteraction("duel", "accept", events, fakeUser("2"));

    await handleInteraction(interaction, service, {} as DiscordBotStore);

    expect(events).toEqual(["defer:false", "guild:1:2", "edit"]);
  });

  it("denies selected duel invites through public slash commands", async () => {
    const events: string[] = [];
    const service = {
      denyDuel: async (guildId: string, discordUserId: string, otherUserId: string) => {
        events.push(`${guildId}:${discordUserId}:${otherUserId}`);
        return {
          duel: {
            id: 1,
            guildId,
            challengerUserId: otherUserId,
            targetUserId: discordUserId,
            status: "declined",
            challengedAt: 1,
            declinedAt: 2
          }
        };
      }
    } as unknown as DiscordTrainingBotService;
    const interaction = fakeChatInputInteraction("duel", "deny", events, fakeUser("2"));

    await handleInteraction(interaction, service, {} as DiscordBotStore);

    expect(events).toEqual(["defer:false", "guild:1:2", "edit"]);
  });

  it("keeps duel slash command errors public", async () => {
    const events: string[] = [];
    const service = {
      getDuelStatus: () => {
        events.push("service");
        throw new Error("No duel here.");
      }
    } as unknown as DiscordTrainingBotService;
    const interaction = fakeChatInputInteraction("duel", "status", events);

    await handleInteraction(interaction, service, {} as DiscordBotStore);

    expect(events).toEqual(["service", "reply:false"]);
  });

  it("defers training buttons before resolving assignments", async () => {
    const events: string[] = [];
    const service = {
      resolveTraining: async () => {
        events.push("service");
        return {
          assignment: {
            id: 1,
            guildId: "guild",
            discordUserId: "1",
            atcoderUsername: "tourist",
            mode: "train",
            problemId: "abc250_c",
            contestId: "abc250",
            title: "Green",
            difficulty: 900,
            targetDelta: 0,
            points: 8,
            status: "active",
            assignedAt: 1
          },
          outcome: "completed",
          verification: "verified",
          points: 8,
          rating: 1220
        };
      }
    } as unknown as DiscordTrainingBotService;
    const interaction = fakeButtonInteraction("train:completed:1", events);

    await handleInteraction(interaction, service, {} as DiscordBotStore);

    expect(events).toEqual(["defer:true", "service", "edit"]);
  });

  it("disables legacy duel buttons with public slash-command guidance", async () => {
    const events: string[] = [];
    const service = {
      acceptDuel: async () => {
        events.push("service");
      }
    } as unknown as DiscordTrainingBotService;
    const interaction = fakeButtonInteraction("duel:accept:1", events);

    await handleInteraction(interaction, service, {} as DiscordBotStore);

    expect(events).toEqual(["reply:false"]);
  });

  it("renders the server leaderboard as a ranked table", () => {
    const message = leaderboardMessage([
      { discordUserId: "1", atcoderUsername: "tourist", points: 1939 },
      { discordUserId: "2", atcoderUsername: "benq", points: 978 }
    ], "2026-06");

    expect(message).toContain("**Training leaderboard - 2026-06**");
    expect(message).toContain("#  Name  Handle   Points");
    expect(message).toContain("1  <@1>  tourist    1939");
    expect(message).toContain("2  <@2>  benq        978");
  });

  it("explains training and graph modules in detailed help messages", () => {
    const trainingHelp = trainingHelpMessage();
    const graphHelp = graphsHelpMessage();

    expect(trainingHelp).toContain("`/train start [delta]`");
    expect(trainingHelp).toContain("Completed");
    expect(trainingHelp).toContain("AC");
    expect(trainingHelp).toContain("`/train leaderboard [period] [month]`");
    expect(graphHelp).toContain("`/graphs official [user] [range]`");
    expect(graphHelp).toContain("daily training ELO");
    expect(graphHelp).toContain("verified points");
    expect(graphHelp).not.toContain("`/graph ...` still works");
  });

  it("builds official graph replies and empty graph responses", async () => {
    const now = Math.floor(Date.parse("2026-06-25T00:00:00Z") / 1000);
    const history: OfficialRatingPoint[] = [
      { epochSecond: now - 10 * 24 * 60 * 60, rating: 1400, performance: 1500, contestName: "ABC 400" },
      { epochSecond: now - 2 * 24 * 60 * 60, rating: 1450, contestName: "ABC 401" }
    ];
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true, history));
    await linkForTest(service, "guild", "1", "tourist", now);

    const reply = await graphReply("official", fakeUser("1"), null, "guild", service, store, now);
    expect(reply.content).toContain("official rating vs performance");
    expect(reply.files).toHaveLength(1);
    expect((reply.files?.[0] as { name?: string } | undefined)?.name).toBe("official-rating.png");

    const empty = await graphReply("points", fakeUser("1"), null, "guild", service, store, now);
    expect(empty.content).toMatch(/No verified points/);
    store.close();
  });

  it("defaults graphs to 90 days and allows full history", async () => {
    const now = Math.floor(Date.parse("2026-06-25T00:00:00Z") / 1000);
    const history: OfficialRatingPoint[] = [
      { epochSecond: now - 200 * 24 * 60 * 60, rating: 1300, performance: 1350, contestName: "ABC 350" }
    ];
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true, history));
    await linkForTest(service, "guild", "1", "tourist", now);

    const defaultReply = await graphReply("official", fakeUser("1"), null, "guild", service, store, now);
    expect(defaultReply.content).toMatch(/last 90 days/);

    const fullReply = await graphReply("official", fakeUser("1"), null, "guild", service, store, now, "full");
    expect(fullReply.content).toContain("official rating vs performance");
    expect(fullReply.files).toHaveLength(1);
    store.close();
  });

  it("records and graphs daily training ELO", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));
    await linkForTest(service, "guild", "1", "tourist", 1_700_000_000);
    await service.startTraining("guild", "1", 0, Math.floor(Date.parse("2026-06-25T10:00:00Z") / 1000));
    await service.resolveTraining("guild", "1", "completed", Math.floor(Date.parse("2026-06-25T11:00:00Z") / 1000));

    const reply = await graphReply("training", fakeUser("1"), null, "guild", service, store, Math.floor(Date.parse("2026-06-26T00:00:00Z") / 1000));
    expect(reply.content).toContain("daily training ELO");
    expect(reply.files).toHaveLength(1);
    expect((reply.files?.[0] as { name?: string } | undefined)?.name).toBe("training-elo.png");
    store.close();
  });

  it("builds solved difficulty histogram replies", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));
    await linkForTest(service, "guild", "1", "tourist", 1_780_000_000);

    const reply = await graphReply("solved", fakeUser("1"), null, "guild", service, store, 1_780_000_000);
    expect(reply.content).toContain("solved problems by 100-point difficulty band");
    expect(reply.files).toHaveLength(1);
    expect((reply.files?.[0] as { name?: string } | undefined)?.name).toBe("solved-difficulty-histogram.png");
    store.close();
  });

  it("requires linked users for personal graph commands", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));

    await expect(graphReply("official", fakeUser("missing"), null, "guild", service, store, 1_780_000_000))
      .rejects.toThrow(/not linked/);
    store.close();
  });
});

async function linkForTest(
  service: DiscordTrainingBotService,
  guildId: string,
  discordUserId: string,
  username: string,
  now: number
) {
  const pending = await service.linkUser(guildId, discordUserId, username, now);
  expect(pending.status).toBe("pending");
  const linked = await service.linkUser(guildId, discordUserId, username, now + 60);
  expect(linked.status).toBe("linked");
  if (linked.status !== "linked") throw new Error("Link did not complete.");
  return linked.user;
}

function fakeAtCoder(solved: boolean | (() => boolean), history: OfficialRatingPoint[] = [], linkChallengeVerified = true): DiscordAtCoderService {
  const isSolved = () => typeof solved === "function" ? solved() : solved;
  return {
    getInitialRating: async () => 1200,
    getInitialDuelRating: async () => 1200,
    getRatingHistory: async () => history,
    getDataset: async () => dataset,
    hasProfileVerificationCode: async () => linkChallengeVerified,
    hasAcceptedSubmission: async () => isSolved(),
    hasSubmissionResult: async (_username: string, _contestId: string, _problemId: string, result: string) => result === "CE" ? linkChallengeVerified : isSolved(),
    getProblemSubmissions: async () => []
  } as unknown as DiscordAtCoderService;
}

function fakeDuelAtCoder(
  submissions: Record<string, Submission[]>,
  ratings: Record<string, number> = {},
  datasets: Record<string, AtCoderDataset> = {}
): DiscordAtCoderService {
  return {
    getInitialRating: async (username: string) => ratings[username] ?? 1200,
    getInitialDuelRating: async (username: string) => ratings[username] ?? 1200,
    getRatingHistory: async (username: string) => [{ epochSecond: 1, rating: ratings[username] ?? 1200, contestName: "ABC" }],
    getDataset: async (username: string) => datasets[username] ?? dataset,
    hasProfileVerificationCode: async () => true,
    hasAcceptedSubmission: async () => false,
    hasSubmissionResult: async () => false,
    getProblemSubmissions: async (username: string) => submissions[username] ?? []
  } as unknown as DiscordAtCoderService;
}

function submission(userId: string, duel: { contestId?: string | undefined; problemId?: string | undefined }, result: string, epochSecond: number): Submission {
  return {
    id: epochSecond,
    epoch_second: epochSecond,
    problem_id: duel.problemId ?? "abc250_c",
    contest_id: duel.contestId ?? "abc250",
    user_id: userId,
    result
  };
}

function fakeUser(id: string) {
  return { id } as Parameters<typeof graphReply>[1];
}

function fakeChatInputInteraction(commandName: string, subcommand: string | null, events: string[], optionUser: { id: string; bot?: boolean } | null = null) {
  const fake = {
    commandName,
    guildId: "guild",
    user: { id: "1" },
    deferred: false,
    replied: false,
    isButton: () => false,
    isChatInputCommand: () => true,
    options: {
      getSubcommand: () => subcommand,
      getString: () => null,
      getInteger: () => null,
      getBoolean: () => null,
      getUser: () => optionUser
    },
    deferReply: async (options: { ephemeral?: boolean }) => {
      events.push(`defer:${options.ephemeral === true}`);
      fake.deferred = true;
    },
    editReply: async (response?: { components?: unknown[] }) => {
      if (response?.components && response.components.length > 0) events.push("components");
      events.push("edit");
      fake.replied = true;
    },
    reply: async (options?: { ephemeral?: boolean }) => {
      events.push(`reply:${options?.ephemeral === true}`);
      fake.replied = true;
    },
    followUp: async () => {
      events.push("followUp");
    }
  };
  return fake as unknown as Parameters<typeof handleInteraction>[0];
}

function fakeButtonInteraction(customId: string, events: string[]) {
  const fake = {
    customId,
    guildId: "guild",
    user: { id: "1" },
    deferred: false,
    replied: false,
    isButton: () => true,
    isChatInputCommand: () => false,
    deferReply: async (options: { ephemeral?: boolean }) => {
      events.push(`defer:${options.ephemeral === true}`);
      fake.deferred = true;
    },
    editReply: async (response?: { components?: unknown[] }) => {
      if (response?.components && response.components.length > 0) events.push("components");
      events.push("edit");
      fake.replied = true;
    },
    reply: async (options?: { ephemeral?: boolean }) => {
      events.push(`reply:${options?.ephemeral === true}`);
      fake.replied = true;
    },
    followUp: async () => {
      events.push("followUp");
    }
  };
  return fake as unknown as Parameters<typeof handleInteraction>[0];
}
