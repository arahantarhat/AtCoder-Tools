import type { InteractionReplyOptions, User } from "discord.js";
import type { AtCoderDataset, OfficialRatingPoint } from "../types";
import { renderBarChart, renderHistogramChart, renderLineChart, type LineSeries } from "./charts";
import { getUtcMonthKey } from "./time";
import type { DiscordTrainingBotService } from "./service";
import type { DiscordBotStore } from "./storage";

const DAY_SECONDS = 24 * 60 * 60;
const GRAPH_RANGES: Record<string, { label: string; days?: number | undefined }> = {
  "30d": { label: "last 30 days", days: 30 },
  "90d": { label: "last 90 days", days: 90 },
  "6m": { label: "last 6 months", days: 183 },
  "1y": { label: "last 1 year", days: 365 },
  full: { label: "full history" }
};

interface GraphRange {
  label: string;
  since?: number | undefined;
}

export async function graphReply(
  subcommand: string,
  interactionUser: User,
  targetUser: User | null,
  guildId: string,
  service: DiscordTrainingBotService,
  store: DiscordBotStore,
  now = Math.floor(Date.now() / 1000),
  rangeValue?: string | null
): Promise<InteractionReplyOptions> {
  const target = targetUser ?? interactionUser;
  const range = parseGraphRange(rangeValue, now);
  if (subcommand === "official") return officialGraphReply(guildId, target, service, store, range);
  if (subcommand === "training") return trainingGraphReply(guildId, target, store, range);
  if (subcommand === "points") return pointsGraphReply(guildId, target, store, range, now);
  if (subcommand === "solved") return solvedHistogramGraphReply(guildId, target, service, store);
  return { content: "Unknown graph." };
}

async function officialGraphReply(
  guildId: string,
  target: User,
  service: DiscordTrainingBotService,
  store: DiscordBotStore,
  range: GraphRange
): Promise<InteractionReplyOptions> {
  const user = store.getLinkedUserOrThrow(guildId, target.id);
  const history = (await service.getOfficialRatingHistory(user.atcoderUsername))
    .filter((point) => range.since === undefined || point.epochSecond >= range.since);
  if (history.length === 0) return { content: `No rated AtCoder contests found for <@${target.id}> in ${range.label}.` };
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

async function trainingGraphReply(guildId: string, target: User, store: DiscordBotStore, range: GraphRange): Promise<InteractionReplyOptions> {
  const user = store.getLinkedUserOrThrow(guildId, target.id);
  const history = store.getTrainingRatingHistorySince(guildId, target.id, range.since ?? 0);
  if (history.length === 0) return { content: `No training ELO history found for <@${target.id}> in ${range.label}.` };
  return attachmentReply(
    `${user.atcoderUsername} daily training ELO`,
    "training-elo.png",
    await renderLineChart(
      `${user.atcoderUsername}: daily training ELO`,
      [{
        label: "Training ELO",
        color: "#2563eb",
        points: history.map((point) => ({
          x: point.epochSecond,
          y: point.rating,
          label: `${point.dayKey}: ${point.rating}`
        }))
      }],
      history.map((point) => point.dayKey.slice(5)),
      { ratingBands: true }
    )
  );
}

async function pointsGraphReply(guildId: string, target: User, store: DiscordBotStore, range: GraphRange, now: number): Promise<InteractionReplyOptions> {
  const user = store.getLinkedUserOrThrow(guildId, target.id);
  const points = store.getMonthlyPointsSince(guildId, target.id, range.since ?? 0);
  if (points.length === 0) return { content: `No verified points found for <@${target.id}> in ${range.label}.` };
  const months = monthKeysBetween(range.since ?? monthKeyToEpochSecond(points[0]?.monthKey ?? getUtcMonthKey(now)), now);
  const pointsByMonth = new Map(points.map((point) => [point.monthKey, point.points]));
  const values = months.map((month) => pointsByMonth.get(month) ?? 0);
  return attachmentReply(
    `${user.atcoderUsername} monthly points`,
    "monthly-points.png",
    await renderBarChart(`${user.atcoderUsername}: monthly points`, months, values, "#2563eb")
  );
}

async function solvedHistogramGraphReply(
  guildId: string,
  target: User,
  service: DiscordTrainingBotService,
  store: DiscordBotStore
): Promise<InteractionReplyOptions> {
  const user = store.getLinkedUserOrThrow(guildId, target.id);
  const bins = buildSolvedDifficultyBins(await service.getDataset(user.atcoderUsername));
  if (bins.length === 0) return { content: `No solved problems with known difficulty found for <@${target.id}>.` };
  return attachmentReply(
    `${user.atcoderUsername} solved problems by 100-point difficulty band`,
    "solved-difficulty-histogram.png",
    await renderHistogramChart(
      `${user.atcoderUsername}: solved problems by difficulty`,
      bins.map((bin) => `${bin.start}-${bin.start + 99}`),
      bins.map((bin) => bin.count),
      bins.map((bin) => difficultyColor(bin.start))
    )
  );
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

function parseGraphRange(value: string | null | undefined, now: number): GraphRange {
  const range = GRAPH_RANGES[value ?? "90d"] ?? GRAPH_RANGES["90d"]!;
  return {
    label: range.label,
    since: range.days === undefined ? undefined : now - range.days * DAY_SECONDS
  };
}

function monthKeyToEpochSecond(monthKey: string): number {
  const time = Date.parse(`${monthKey}-01T00:00:00Z`);
  return Number.isFinite(time) ? Math.floor(time / 1000) : 0;
}

function buildSolvedDifficultyBins(dataset: AtCoderDataset): Array<{ start: number; count: number }> {
  const solvedIds = new Set(dataset.submissions
    .filter((submission) => submission.result === "AC")
    .map((submission) => submission.problem_id));
  const counts = new Map<number, number>();
  for (const problemId of solvedIds) {
    const difficulty = dataset.models[problemId]?.difficulty;
    if (difficulty === undefined || !Number.isFinite(difficulty)) continue;
    const start = Math.max(0, Math.floor(difficulty / 100) * 100);
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const min = Math.min(...counts.keys());
  const max = Math.max(...counts.keys());
  const bins: Array<{ start: number; count: number }> = [];
  for (let start = min; start <= max; start += 100) {
    bins.push({ start, count: counts.get(start) ?? 0 });
  }
  return bins;
}

function difficultyColor(start: number): string {
  if (start < 400) return "#9ca3af";
  if (start < 800) return "#8b5a2b";
  if (start < 1200) return "#16a34a";
  if (start < 1600) return "#0891b2";
  if (start < 2000) return "#2563eb";
  if (start < 2400) return "#ca8a04";
  if (start < 2800) return "#ea580c";
  return "#dc2626";
}
