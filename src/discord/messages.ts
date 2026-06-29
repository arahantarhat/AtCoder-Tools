import type { APIEmbed, ActionRowData, ButtonComponentData, MessageActionRowComponentData } from "discord.js";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import { formatDate } from "./time";
import type { BotAssignment, LeaderboardEntry, LinkedUser, ReviewQueueItem } from "./types";

export function helpMessage(): string {
  return [
    "**AtCoder training bot**",
    "1. `/link username:<atcoder>` to connect your AtCoder handle with a public profile code.",
    "2. `/gimme` for a filtered random problem.",
    "3. `/train start` for an adaptive gitgud-style problem.",
    "4. Use Completed, Assisted, or Skip buttons. Completion points are awarded after public AC verification.",
    "5. Use `/train verify` to retry pending completion checks.",
    "6. `/train queue` reviews assisted/skipped problems later, and `/train review` starts the next due review.",
    "7. Use `/train status`, `/train leaderboard`, and `/graphs` to show progress."
  ].join("\n");
}

export function trainingHelpMessage(): string {
  return [
    "**Training module**",
    "",
    "`/train start [delta]` gives you one adaptive problem based on your current training ELO. The `delta` is how far above or below your rating the target difficulty should be. Use negative deltas for easier practice, `0` for even practice, and positive deltas when you want a harder push.",
    "",
    "After you solve or attempt the problem, use the buttons or slash commands:",
    "- `Completed`: you solved it without editorial help. Points and ELO are applied after the bot verifies a public AC.",
    "- `Assisted`: you got AC with editorial or outside help. You still get verified points, your ELO is adjusted differently, and the problem is scheduled for review.",
    "- `Skip`: no points are awarded, ELO drops, and the problem is scheduled for later review.",
    "",
    "`/train current` shows your active assignment. You can only have one active training/review assignment at a time.",
    "`/train verify` retries pending completion claims when AtCoder or Kenkoooo has not shown the AC yet.",
    "`/train queue` shows assisted/skipped problems that are due for review, and `/train review` starts the next due review problem.",
    "`/train status [user]` shows linked handle, points, training ELO, active assignment, pending claims, and review queue size.",
    "`/train leaderboard [period] [month]` shows verified server training points. Monthly leaderboards use UTC month keys like `2026-06`; all-time sums every verified score event in this server."
  ].join("\n");
}

export function graphsHelpMessage(): string {
  return [
    "**Graphs module**",
    "",
    "Graph commands render PNG images from linked AtCoder handles and verified bot history. Use `/link username:<handle>` first if a command needs your AtCoder data.",
    "",
    "`/graphs official [user] [range]` shows official AtCoder rating with contest performance when available.",
    "`/graphs training [user] [range]` shows daily training ELO. If multiple training outcomes happen on the same UTC day, the last recorded rating for that day is used.",
    "`/graphs points [user] [range]` shows verified points by UTC month. These points come from score events after AC verification, not from editable totals.",
    "`/graphs solved [user]` shows solved problems grouped by 100-point difficulty bands. This is all-time because it is a difficulty distribution, not a time series.",
    "",
    "Ranges are `30 days`, `90 days`, `6 months`, `1 year`, and `full history`. The default is `90 days`. Use `full history` when an empty graph is likely caused by the default range being too short."
  ].join("\n");
}

export function problemUrl(contestId: string, problemId: string): string {
  return `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/tasks/${encodeURIComponent(problemId)}`;
}

export function assignmentEmbed(assignment: BotAssignment): APIEmbed {
  return {
    title: assignment.title,
    url: problemUrl(assignment.contestId, assignment.problemId),
    description: `${assignment.contestId} / ${assignment.problemId}`,
    fields: [
      { name: "Difficulty", value: String(assignment.difficulty), inline: true },
      { name: "Delta", value: `${assignment.targetDelta >= 0 ? "+" : ""}${assignment.targetDelta}`, inline: true },
      { name: "Points", value: String(assignment.points), inline: true }
    ]
  };
}

export function trainingButtons(assignmentId: number): ActionRowData<MessageActionRowComponentData> {
  return {
    type: ComponentType.ActionRow,
    components: [
      button(`train:completed:${assignmentId}`, "Completed", ButtonStyle.Success),
      button(`train:assisted:${assignmentId}`, "Assisted", ButtonStyle.Primary),
      button(`train:skip:${assignmentId}`, "Skip", ButtonStyle.Secondary)
    ]
  };
}

export function leaderboardMessage(entries: LeaderboardEntry[], label: string): string {
  if (entries.length === 0) return `No points recorded for ${label}.`;
  const rows = entries.map((entry, index) => ({
    rank: String(index + 1),
    name: `<@${entry.discordUserId}>`,
    handle: entry.atcoderUsername ?? "-",
    points: String(entry.points)
  }));
  const rankWidth = Math.max("#".length, ...rows.map((row) => row.rank.length));
  const nameWidth = Math.max("Name".length, ...rows.map((row) => row.name.length));
  const handleWidth = Math.max("Handle".length, ...rows.map((row) => row.handle.length));
  const pointsWidth = Math.max("Points".length, ...rows.map((row) => row.points.length));
  const header = `${"#".padEnd(rankWidth)}  ${"Name".padEnd(nameWidth)}  ${"Handle".padEnd(handleWidth)}  ${"Points".padStart(pointsWidth)}`;
  const separator = `${"-".repeat(rankWidth)}  ${"-".repeat(nameWidth)}  ${"-".repeat(handleWidth)}  ${"-".repeat(pointsWidth)}`;
  const body = rows.map((row) =>
    `${row.rank.padEnd(rankWidth)}  ${row.name.padEnd(nameWidth)}  ${row.handle.padEnd(handleWidth)}  ${row.points.padStart(pointsWidth)}`
  );
  return [`**Training leaderboard - ${label}**`, "```", header, separator, ...body, "```"].join("\n");
}

export function profileMessage(user: LinkedUser, monthlyPoints: number, totalPoints: number, active: BotAssignment | null, pending: number, queued: number): string {
  const current = active
    ? `[${active.title}](${problemUrl(active.contestId, active.problemId)}) (${active.difficulty})`
    : "None";
  return [
    `AtCoder: **${user.atcoderUsername}**`,
    `Training rating: **${user.trainingRating}**`,
    `Monthly points: **${monthlyPoints}**`,
    `All-time points: **${totalPoints}**`,
    `Active assignment: ${current}`,
    `Pending verification: **${pending}**`,
    `Review queue: **${queued}**`
  ].join("\n");
}

export function queueMessage(items: ReviewQueueItem[]): string {
  if (items.length === 0) return "No review problems are available yet.";
  return items.map((item, index) =>
    `${index + 1}. [${item.title}](${problemUrl(item.contestId, item.problemId)}) (${item.difficulty}) - ${item.reason}, due ${formatDate(item.availableAfter)}`
  ).join("\n");
}

function button(
  customId: string,
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger
): ButtonComponentData {
  return {
    type: ComponentType.Button,
    customId,
    label,
    style
  };
}
