import type { APIEmbed, ActionRowData, ButtonComponentData, MessageActionRowComponentData } from "discord.js";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import { formatDate } from "./time";
import { duelResultLabel } from "./duels";
import type { BotAssignment, Duel, LeaderboardEntry, LinkedUser, PracticeProblem, ReviewQueueItem } from "./types";

export function helpMessage(): string {
  return [
    "**AtCoder training bot**",
    "",
    "`/link username:<atcoder>` links your Discord account to AtCoder with a public profile code.",
    "`/gimme [category] [range] [color] [allow_solved]` gives you a filtered random AtCoder problem without creating an active training assignment.",
    "",
    "`/train help` explains adaptive training, scoring, verification, and review.",
    "`/train start [delta]` starts one adaptive AtCoder assignment.",
    "`/train current` shows your active assignment.",
    "`/train completed`, `/train assisted`, and `/train skip` resolve the active assignment. Buttons do the same when shown.",
    "`/train verify` retries pending AC checks.",
    "`/train queue` and `/train review` manage assisted/skipped AtCoder review problems.",
    "`/train status [user]` and `/train leaderboard [period] [month]` show training progress.",
    "",
    "`/practice help` explains the personal practice queue for problems from any site.",
    "`/practice add link:<url> [name] [note]`, `/practice start`, `/practice note`, `/practice later`, `/practice complete`, and `/practice list` manage that queue.",
    "",
    "`/duel challenge`, `/duel accept`, `/duel deny`, `/duel status`, `/duel verify`, and `/duel history` manage AtCoder duels.",
    "`/graphs help` explains `/graphs official`, `/graphs training`, `/graphs points`, and `/graphs solved`."
  ].join("\n");
}

export function practiceHelpMessage(): string {
  return [
    "**Practice queue**",
    "",
    "`/practice add link:<url> [name] [note]` adds a problem to the back of your personal queue.",
    "`/practice start` shows the problem at the front of the queue.",
    "`/practice note text:<note>` appends a note to the current front problem only.",
    "`/practice later` moves the current front problem to the back of the queue.",
    "`/practice complete` marks the current front problem done.",
    "`/practice list` shows the current queue order."
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

export function duelEmbed(duel: Duel): APIEmbed {
  const embed: APIEmbed = {
    title: duel.title ?? "AtCoder duel",
    description: duel.contestId && duel.problemId ? `${duel.contestId} / ${duel.problemId}` : "Problem hidden until the duel is accepted.",
    fields: [
      { name: "Challenger", value: `<@${duel.challengerUserId}>`, inline: true },
      { name: "Opponent", value: `<@${duel.targetUserId}>`, inline: true },
      { name: "Difficulty", value: duel.difficulty === undefined ? "-" : String(duel.difficulty), inline: true },
      { name: "Challenger rating", value: duel.challengerRatingBefore === undefined ? "-" : String(duel.challengerRatingBefore), inline: true },
      { name: "Opponent rating", value: duel.targetRatingBefore === undefined ? "-" : String(duel.targetRatingBefore), inline: true },
      { name: "Handicap", value: duel.handicapCoefficient === undefined ? "-" : duel.handicapCoefficient.toFixed(3), inline: true }
    ]
  };
  if (duel.contestId && duel.problemId) embed.url = problemUrl(duel.contestId, duel.problemId);
  return embed;
}

export function duelChallengeMessage(duel: Duel): string {
  return `<@${duel.targetUserId}>, <@${duel.challengerUserId}> challenged you to an AtCoder duel. Accept within 15 minutes.`;
}

export function duelAcceptedMessage(duel: Duel): string {
  return `Duel accepted: <@${duel.challengerUserId}> vs <@${duel.targetUserId}>. First solve wins after handicap adjustment.`;
}

export function duelDeniedMessage(duel: Duel): string {
  return `Duel challenge declined: <@${duel.challengerUserId}> vs <@${duel.targetUserId}>.`;
}

export function duelStatusMessage(duel: Duel, detail: string): string {
  const expires = duel.expiresAt ? `Expires ${formatDate(duel.expiresAt)}.` : "";
  return [
    `Active duel: <@${duel.challengerUserId}> vs <@${duel.targetUserId}>`,
    duel.title && duel.contestId && duel.problemId ? `[${duel.title}](${problemUrl(duel.contestId, duel.problemId)}) (${duel.difficulty})` : "Problem unavailable.",
    `Ratings: ${duel.challengerRatingBefore ?? "-"} vs ${duel.targetRatingBefore ?? "-"}. Handicap coefficient: ${duel.handicapCoefficient?.toFixed(3) ?? "-"}.`,
    detail,
    expires
  ].filter(Boolean).join("\n");
}

export function duelPendingMessage(sent: Duel[], received: Duel[]): string {
  if (sent.length === 0 && received.length === 0) return "You have no active duel and no pending duel challenges.";
  const lines = ["No active duel."];
  if (received.length > 0) {
    lines.push("Received:");
    lines.push(...received.map((duel) => `#${duel.id} from <@${duel.challengerUserId}> expires ${duel.expiresAt ? formatDate(duel.expiresAt) : "soon"}`));
  }
  if (sent.length > 0) {
    lines.push("Sent:");
    lines.push(...sent.map((duel) => `#${duel.id} to <@${duel.targetUserId}> expires ${duel.expiresAt ? formatDate(duel.expiresAt) : "soon"}`));
  }
  return lines.join("\n");
}

export function duelHistoryMessage(duels: Duel[], userId: string): string {
  if (duels.length === 0) return "No completed duels recorded.";
  return duels.map((duel) => {
    const opponentId = duel.challengerUserId === userId ? duel.targetUserId : duel.challengerUserId;
    const before = duel.challengerUserId === userId ? duel.challengerRatingBefore : duel.targetRatingBefore;
    const after = duel.challengerUserId === userId ? duel.challengerRatingAfter : duel.targetRatingAfter;
    const delta = duel.challengerUserId === userId ? duel.challengerDelta : duel.targetDelta;
    const outcome = duelResultLabel(duel.result, userId, duel.winnerUserId);
    const problem = duel.contestId && duel.problemId && duel.title ? `[${duel.title}](${problemUrl(duel.contestId, duel.problemId)})` : duel.title ?? "Unknown problem";
    return `${formatDate(duel.completedAt ?? duel.challengedAt)} - ${outcome} vs <@${opponentId}> on ${problem}: ${before ?? "-"} -> ${after ?? "-"} (${formatDelta(delta)})`;
  }).join("\n");
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

export function practiceProblemMessage(problem: PracticeProblem, prefix: string): string {
  return [
    `${prefix}: [${problem.name}](${problem.url})`,
    problem.note ? `Note: ${problem.note}` : ""
  ].filter(Boolean).join("\n");
}

export function practiceListMessage(items: PracticeProblem[]): string {
  if (items.length === 0) return "Your practice queue is empty.";
  return items.map((item, index) => {
    const marker = index === 0 ? "current" : "queued";
    const note = item.note ? ` - ${firstLine(item.note)}` : "";
    return `${index + 1}. [${item.name}](${item.url}) (${marker})${note}`;
  }).join("\n");
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

function formatDelta(delta: number | undefined): string {
  if (delta === undefined) return "-";
  return `${delta >= 0 ? "+" : ""}${delta}`;
}

function firstLine(value: string): string {
  return value.split("\n")[0] ?? value;
}
