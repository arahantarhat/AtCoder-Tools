import { describe, expect, it } from "vitest";
import { renderLineChart, renderStackedBarChart } from "../src/discord/charts";
import { buildDiscordCommands } from "../src/discord/commands";
import { graphReply } from "../src/discord/graphs";
import { selectRandomProblem, selectTrainingProblem } from "../src/discord/problem-selection";
import { pointsForDelta, reviewDelaySeconds, updateTrainingRating } from "../src/discord/scoring";
import { DiscordTrainingBotService } from "../src/discord/service";
import { DiscordBotStore } from "../src/discord/storage";
import { getUtcMonthKey } from "../src/discord/time";
import type { DiscordAtCoderService } from "../src/discord/atcoder";
import type { AtCoderDataset, OfficialRatingPoint } from "../src/types";

const dataset: AtCoderDataset = {
  contests: [
    { id: "abc100", title: "ABC 100", start_epoch_second: 1_600_000_000 },
    { id: "abc250", title: "ABC 250", start_epoch_second: 1_650_000_000 },
    { id: "arc120", title: "ARC 120", start_epoch_second: 1_660_000_000 },
    { id: "agc050", title: "AGC 050", start_epoch_second: 1_670_000_000 }
  ],
  problems: [
    { id: "abc100_a", contest_id: "abc100", title: "Gray" },
    { id: "abc250_c", contest_id: "abc250", title: "Green" },
    { id: "arc120_b", contest_id: "arc120", title: "Cyan" },
    { id: "agc050_a", contest_id: "agc050", title: "Blue" }
  ],
  models: {
    abc100_a: { difficulty: 300 },
    abc250_c: { difficulty: 900 },
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

  it("selects adaptive training problems near the requested delta", () => {
    const selected = selectTrainingProblem(dataset, 1200, 100, new Set(), 0);
    expect(selected?.row.problem.id).toBe("arc120_b");
    expect(selected?.points).toBe(12);
  });

  it("sets longer review delays for skipped problems", () => {
    expect(reviewDelaySeconds("skipped")).toBeGreaterThan(reviewDelaySeconds("assisted"));
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

describe("Discord bot service", () => {
  it("awards points after verified AC and queues assisted reviews", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true));
    await service.linkUser("guild", "1", "tourist", 1_700_000_000);
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
    await service.linkUser("guild", "1", "tourist", 1_700_000_000);
    await service.gimme("guild", "1", { color: "green" }, 1_700_000_050);
    const assignment = await service.startTraining("guild", "1", 0, 1_700_000_100);

    expect(assignment.mode).toBe("train");
    store.close();
  });

  it("keeps assignment active when AC is not verified", async () => {
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(false));
    await service.linkUser("guild", "1", "tourist", 1_700_000_000);
    await service.startTraining("guild", "1", 0, 1_700_000_100);

    await expect(service.resolveTraining("guild", "1", "completed", 1_700_000_200)).rejects.toThrow(/could not find an AC/i);
    expect(store.getActiveAssignment("guild", "1")).not.toBeNull();
    store.close();
  });

  it("exposes the V1 slash commands including help", () => {
    const commands = buildDiscordCommands();
    expect(commands.map((command) => command.name)).toEqual([
      "help",
      "link",
      "gimme",
      "train",
      "queue",
      "leaderboard",
      "points",
      "profile",
      "graph"
    ]);
    const graph = commands.find((command) => command.name === "graph");
    expect(graph?.options?.map((option) => option.name)).toEqual(["official", "difficulty", "delta", "points", "leaderboard"]);
  });

  it("builds official graph replies and empty graph responses", async () => {
    const now = Math.floor(Date.parse("2026-06-25T00:00:00Z") / 1000);
    const history: OfficialRatingPoint[] = [
      { epochSecond: now - 10 * 24 * 60 * 60, rating: 1400, performance: 1500, contestName: "ABC 400" },
      { epochSecond: now - 2 * 24 * 60 * 60, rating: 1450, contestName: "ABC 401" }
    ];
    const store = new DiscordBotStore(":memory:");
    const service = new DiscordTrainingBotService(store, fakeAtCoder(true, history));
    await service.linkUser("guild", "1", "tourist", now);

    const reply = await graphReply("official", fakeUser("1"), null, "guild", service, store, now);
    expect(reply.content).toContain("official rating vs performance");
    expect(reply.files).toHaveLength(1);
    expect((reply.files?.[0] as { name?: string } | undefined)?.name).toBe("official-rating.png");

    const empty = await graphReply("points", fakeUser("1"), null, "guild", service, store, now);
    expect(empty.content).toMatch(/No verified points/);
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

function fakeAtCoder(solved: boolean, history: OfficialRatingPoint[] = []): DiscordAtCoderService {
  return {
    getInitialRating: async () => 1200,
    getRatingHistory: async () => history,
    getDataset: async () => dataset,
    hasAcceptedSubmission: async () => solved
  } as unknown as DiscordAtCoderService;
}

function fakeUser(id: string) {
  return { id } as Parameters<typeof graphReply>[1];
}
