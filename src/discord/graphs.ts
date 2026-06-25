import type { InteractionReplyOptions, User } from "discord.js";
import type { OfficialRatingPoint } from "../types";
import { renderBarChart, renderLineChart, renderStackedBarChart, type LineSeries } from "./charts";
import { getUtcMonthKey } from "./time";
import type { DiscordTrainingBotService } from "./service";
import type { DiscordBotStore } from "./storage";
import type { AssignmentStatus, BotAssignment, DifficultyColor, LeaderboardEntry } from "./types";

const DEFAULT_WINDOW_DAYS = 90;
const DAY_SECONDS = 24 * 60 * 60;
const STATUS_SERIES: Array<{ status: AssignmentStatus; label: string; color: string }> = [
  { status: "completed", label: "Completed", color: "#16a34a" },
  { status: "assisted", label: "Assisted", color: "#2563eb" },
  { status: "skipped", label: "Skipped", color: "#dc2626" },
  { status: "active", label: "Active", color: "#9ca3af" }
];
const DIFFICULTY_BANDS: Array<{ label: DifficultyColor; min: number; max: number }> = [
  { label: "gray", min: 0, max: 399 },
  { label: "brown", min: 400, max: 799 },
  { label: "green", min: 800, max: 1199 },
  { label: "cyan", min: 1200, max: 1599 },
  { label: "blue", min: 1600, max: 1999 },
  { label: "yellow", min: 2000, max: 2399 },
  { label: "orange", min: 2400, max: 2799 },
  { label: "red", min: 2800, max: Number.POSITIVE_INFINITY }
];
const DELTAS = [-300, -200, -100, 0, 100, 200, 300] as const;
const LINE_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

export async function graphReply(
  subcommand: string,
  interactionUser: User,
  targetUser: User | null,
  guildId: string,
  service: DiscordTrainingBotService,
  store: DiscordBotStore,
  now = Math.floor(Date.now() / 1000)
): Promise<InteractionReplyOptions> {
  const target = targetUser ?? interactionUser;
  const since = now - DEFAULT_WINDOW_DAYS * DAY_SECONDS;
  if (subcommand === "official") return officialGraphReply(guildId, target, service, store, since);
  if (subcommand === "difficulty") return difficultyGraphReply(guildId, target, store, since);
  if (subcommand === "delta") return deltaGraphReply(guildId, target, store, since);
  if (subcommand === "points") return pointsGraphReply(guildId, target, store, since, now);
  if (subcommand === "leaderboard") return leaderboardGraphReply(guildId, store, since, now);
  return { content: "Unknown graph." };
}

async function officialGraphReply(
  guildId: string,
  target: User,
  service: DiscordTrainingBotService,
  store: DiscordBotStore,
  since: number
): Promise<InteractionReplyOptions> {
  const user = store.getLinkedUserOrThrow(guildId, target.id);
  const history = (await service.getOfficialRatingHistory(user.atcoderUsername))
    .filter((point) => point.epochSecond >= since);
  if (history.length === 0) return { content: `No rated AtCoder contests found for <@${target.id}> in the last ${DEFAULT_WINDOW_DAYS} days.` };
  const series: LineSeries[] = [
    {
      label: "Rating",
      color: "#2563eb",
      points: history.map((point) => ({ x: point.epochSecond, y: point.rating, label: pointLabel(point, "Rating", point.rating) }))
    }
  ];
  const performance = history.filter((point) => point.performance !== undefined);
  if (performance.length > 0) {
    series.push({
      label: "Performance",
      color: "#dc2626",
      points: performance.map((point) => ({
        x: point.epochSecond,
        y: point.performance ?? 0,
        label: pointLabel(point, "Performance", point.performance ?? 0)
      }))
    });
  }
  return attachmentReply(
    `${user.atcoderUsername} official rating vs performance`,
    "official-rating.png",
    await renderLineChart(
      `${user.atcoderUsername}: official rating vs performance`,
      series,
      history.map((point) => shortDate(point.epochSecond)),
      { ratingBands: true }
    )
  );
}

async function difficultyGraphReply(guildId: string, target: User, store: DiscordBotStore, since: number): Promise<InteractionReplyOptions> {
  const user = store.getLinkedUserOrThrow(guildId, target.id);
  const assignments = store.listAssignmentsForGraph(guildId, target.id, since);
  if (assignments.length === 0) return { content: `No assignments found for <@${target.id}> in the last ${DEFAULT_WINDOW_DAYS} days.` };
  const labels = DIFFICULTY_BANDS.map((band) => band.label);
  const series = STATUS_SERIES.map(({ status, label, color }) => ({
    label,
    color,
    values: DIFFICULTY_BANDS.map((band) => assignments.filter((assignment) =>
      assignment.status === status && assignment.difficulty >= band.min && assignment.difficulty <= band.max
    ).length)
  }));
  return attachmentReply(
    `${user.atcoderUsername} problem difficulty distribution`,
    "difficulty-distribution.png",
    await renderStackedBarChart(`${user.atcoderUsername}: problem difficulty distribution`, labels, series)
  );
}

async function deltaGraphReply(guildId: string, target: User, store: DiscordBotStore, since: number): Promise<InteractionReplyOptions> {
  const user = store.getLinkedUserOrThrow(guildId, target.id);
  const assignments = store.listAssignmentsForGraph(guildId, target.id, since)
    .filter((assignment) => assignment.mode === "train" && assignment.status !== "active");
  if (assignments.length === 0) return { content: `No resolved training assignments found for <@${target.id}> in the last ${DEFAULT_WINDOW_DAYS} days.` };
  const labels = DELTAS.map((delta) => `${delta >= 0 ? "+" : ""}${delta}`);
  const series = STATUS_SERIES
    .filter((entry) => entry.status !== "active")
    .map(({ status, label, color }) => ({
      label,
      color,
      values: DELTAS.map((delta) => assignments.filter((assignment) => assignment.status === status && assignment.targetDelta === delta).length)
    }));
  return attachmentReply(
    `${user.atcoderUsername} outcomes by training delta`,
    "training-delta-outcomes.png",
    await renderStackedBarChart(`${user.atcoderUsername}: outcomes by training delta`, labels, series)
  );
}

async function pointsGraphReply(guildId: string, target: User, store: DiscordBotStore, since: number, now: number): Promise<InteractionReplyOptions> {
  const user = store.getLinkedUserOrThrow(guildId, target.id);
  const months = monthKeysBetween(since, now);
  const pointsByMonth = new Map(store.getMonthlyPointsSince(guildId, target.id, since).map((point) => [point.monthKey, point.points]));
  const values = months.map((month) => pointsByMonth.get(month) ?? 0);
  if (values.every((value) => value === 0)) return { content: `No verified points found for <@${target.id}> in the last ${DEFAULT_WINDOW_DAYS} days.` };
  return attachmentReply(
    `${user.atcoderUsername} monthly points`,
    "monthly-points.png",
    await renderBarChart(`${user.atcoderUsername}: monthly points`, months, values, "#2563eb")
  );
}

async function leaderboardGraphReply(guildId: string, store: DiscordBotStore, since: number, now: number): Promise<InteractionReplyOptions> {
  const leaders = store.getTopLeaderboardUsersSince(guildId, since, 5);
  if (leaders.length === 0) return { content: `No leaderboard points found in the last ${DEFAULT_WINDOW_DAYS} days.` };
  const months = monthKeysBetween(since, now);
  const trend = store.getLeaderboardTrendSince(guildId, leaders.map((entry) => entry.discordUserId), since);
  const series = leaders.map((leader, index) => cumulativeSeries(leader, index, months, trend));
  return attachmentReply(
    "Server leaderboard trend",
    "leaderboard-trend.png",
    await renderLineChart("Server leaderboard trend", series, months)
  );
}

function cumulativeSeries(
  leader: LeaderboardEntry,
  index: number,
  months: string[],
  trend: Array<{ discordUserId: string; monthKey: string; points: number }>
): LineSeries {
  const monthly = new Map(trend.filter((point) => point.discordUserId === leader.discordUserId).map((point) => [point.monthKey, point.points]));
  let total = 0;
  return {
    label: leader.atcoderUsername ?? leader.discordUserId,
    color: LINE_COLORS[index % LINE_COLORS.length] ?? "#2563eb",
    points: months.map((month, monthIndex) => {
      total += monthly.get(month) ?? 0;
      return { x: monthIndex, y: total, label: `${leader.atcoderUsername ?? leader.discordUserId}: ${total} pts` };
    })
  };
}

function attachmentReply(content: string, name: string, png: Buffer): InteractionReplyOptions {
  return {
    content,
    files: [{ attachment: png, name }]
  };
}

function pointLabel(point: OfficialRatingPoint, metric: string, value: number): string {
  return `${point.contestName ?? point.contestScreenName ?? "Contest"} ${metric}: ${value}`;
}

function shortDate(epochSecond: number): string {
  return new Date(epochSecond * 1000).toISOString().slice(5, 10);
}

function monthKeysBetween(since: number, now: number): string[] {
  const months: string[] = [];
  const cursor = new Date(`${getUtcMonthKey(since)}-01T00:00:00.000Z`);
  const end = getUtcMonthKey(now);
  while (true) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    months.push(key);
    if (key === end) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}
