import type { AtCoderDataset } from "../types";
import { selectRandomProblem, selectTrainingProblem } from "./problem-selection";
import { reviewDelaySeconds, updateTrainingRating } from "./scoring";
import { getUtcMonthKey } from "./time";
import type { DiscordAtCoderService } from "./atcoder";
import type { DiscordBotStore } from "./storage";
import type { OfficialRatingPoint } from "../types";
import type { BotAssignment, ProblemFilters } from "./types";

export class DiscordTrainingBotService {
  constructor(private readonly store: DiscordBotStore, private readonly atcoder: DiscordAtCoderService) {}

  async linkUser(guildId: string, discordUserId: string, username: string, now = nowSecond()) {
    const initialRating = await this.atcoder.getInitialRating(username);
    return this.store.linkUser(guildId, discordUserId, username, initialRating, now);
  }

  async gimme(guildId: string, discordUserId: string, filters: ProblemFilters, now = nowSecond()): Promise<BotAssignment> {
    const user = this.store.getLinkedUserOrThrow(guildId, discordUserId);
    const dataset = await this.atcoder.getDataset(user.atcoderUsername);
    const row = selectRandomProblem(dataset, filters);
    if (!row || row.difficulty === null) throw new Error("No problem matched those filters.");
    return {
      id: 0,
      guildId,
      discordUserId,
      atcoderUsername: user.atcoderUsername,
      mode: "gimme",
      problemId: row.problem.id,
      contestId: row.problem.contest_id,
      title: row.problem.title,
      difficulty: row.difficulty,
      targetDelta: 0,
      points: 0,
      status: "active",
      assignedAt: now
    };
  }

  async startTraining(guildId: string, discordUserId: string, requestedDelta = 0, now = nowSecond()): Promise<BotAssignment> {
    const user = this.store.getLinkedUserOrThrow(guildId, discordUserId);
    const dataset = await this.atcoder.getDataset(user.atcoderUsername);
    const selected = selectTrainingProblem(dataset, user.trainingRating, requestedDelta, this.store.getUsedProblemIds(guildId, discordUserId));
    if (!selected || selected.row.difficulty === null) throw new Error("No unsolved ABC/ARC/AGC problem is available near your training rating.");
    return this.store.createAssignment({
      guildId,
      discordUserId,
      atcoderUsername: user.atcoderUsername,
      mode: "train",
      problemId: selected.row.problem.id,
      contestId: selected.row.problem.contest_id,
      title: selected.row.problem.title,
      difficulty: selected.row.difficulty,
      targetDelta: selected.targetDelta,
      points: selected.points,
      assignedAt: now
    });
  }

  getActiveAssignment(guildId: string, discordUserId: string): BotAssignment | null {
    return this.store.getActiveAssignment(guildId, discordUserId);
  }

  getOfficialRatingHistory(username: string): Promise<OfficialRatingPoint[]> {
    return this.atcoder.getRatingHistory(username);
  }

  async resolveTraining(
    guildId: string,
    discordUserId: string,
    outcome: "completed" | "assisted" | "skipped",
    now = nowSecond()
  ): Promise<{ assignment: BotAssignment; points: number; rating: number }> {
    const user = this.store.getLinkedUserOrThrow(guildId, discordUserId);
    const assignment = this.store.getActiveAssignment(guildId, discordUserId);
    if (!assignment) throw new Error("You do not have an active assignment.");
    if (outcome !== "skipped") {
      const solved = await this.atcoder.hasAcceptedSubmission(user.atcoderUsername, assignment.contestId, assignment.problemId, assignment.assignedAt);
      if (!solved) throw new Error("I could not find an AC for this assignment yet. Try again after AtCoder shows the submission.");
      this.store.addScoreEvent({
        guildId,
        discordUserId,
        assignmentId: assignment.id,
        points: assignment.points,
        reason: outcome,
        occurredAt: now,
        monthKey: getUtcMonthKey(now)
      });
    }
    this.store.resolveAssignment(assignment, outcome, now);
    if (outcome === "assisted" || outcome === "skipped") {
      this.store.enqueueReview({
        guildId,
        discordUserId,
        problemId: assignment.problemId,
        contestId: assignment.contestId,
        title: assignment.title,
        difficulty: assignment.difficulty,
        reason: outcome,
        availableAfter: now + reviewDelaySeconds(outcome),
        createdAt: now
      });
    }
    const rating = updateTrainingRating(user.trainingRating, outcome, assignment.targetDelta);
    this.store.updateTrainingRating(guildId, discordUserId, rating, now);
    return { assignment, points: outcome === "skipped" ? 0 : assignment.points, rating };
  }

  async startReview(guildId: string, discordUserId: string, now = nowSecond()): Promise<BotAssignment> {
    const user = this.store.getLinkedUserOrThrow(guildId, discordUserId);
    const item = this.store.listReviewQueue(guildId, discordUserId, now)[0];
    if (!item) throw new Error("No review problems are available yet.");
    const assignment = this.store.createAssignment({
      guildId,
      discordUserId,
      atcoderUsername: user.atcoderUsername,
      mode: "review",
      problemId: item.problemId,
      contestId: item.contestId,
      title: item.title,
      difficulty: item.difficulty,
      targetDelta: 0,
      points: 8,
      assignedAt: now
    });
    this.store.consumeReviewItem(item.id, now);
    return assignment;
  }

  getDatasetForTests(username: string): Promise<AtCoderDataset> {
    return this.atcoder.getDataset(username);
  }
}

function nowSecond(): number {
  return Math.floor(Date.now() / 1000);
}
