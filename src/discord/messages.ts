import type { APIEmbed, ActionRowData, ButtonComponentData, MessageActionRowComponentData } from "discord.js";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import { formatDate } from "./time";
import type { BotAssignment, LeaderboardEntry, LinkedUser, ReviewQueueItem } from "./types";

export function helpMessage(): string {
  return [
    "**AtCoder training bot**",
    "1. `/link username:<atcoder>` to connect your AtCoder handle.",
    "2. `/gimme` for a filtered random problem.",
    "3. `/train start` for an adaptive gitgud-style problem.",
    "4. Use Completed, Assisted, or Skip buttons, or `/train completed`, `/train assisted`, `/train skip`.",
    "5. `/queue` reviews assisted/skipped problems later.",
    "6. `/points`, `/leaderboard`, `/profile`, and `/graph` show progress."
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
  return entries.map((entry, index) => {
    const name = entry.atcoderUsername ? `${entry.atcoderUsername} (<@${entry.discordUserId}>)` : `<@${entry.discordUserId}>`;
    return `${index + 1}. ${name}: ${entry.points} pts`;
  }).join("\n");
}

export function profileMessage(user: LinkedUser, monthlyPoints: number, totalPoints: number, active: BotAssignment | null, queued: number): string {
  const current = active
    ? `[${active.title}](${problemUrl(active.contestId, active.problemId)}) (${active.difficulty})`
    : "None";
  return [
    `AtCoder: **${user.atcoderUsername}**`,
    `Training rating: **${user.trainingRating}**`,
    `Monthly points: **${monthlyPoints}**`,
    `All-time points: **${totalPoints}**`,
    `Active assignment: ${current}`,
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
