import { randomBytes } from "node:crypto";
import type { AtCoderDataset } from "../types";
import { selectRandomProblem, selectTrainingProblem } from "./problem-selection";
import { reviewDelaySeconds, updateTrainingRating } from "./scoring";
import { getUtcMonthKey } from "./time";
import type { DiscordAtCoderService } from "./atcoder";
import type { DiscordBotStore } from "./storage";
import type { OfficialRatingPoint } from "../types";
import type { BotAssignment, LinkedUser, PendingLinkChallenge, ProblemFilters, ScoreReason } from "./types";

type TrainingOutcome = "completed" | "assisted" | "skipped";

export type LinkUserResult =
  | { status: "already_linked"; user: LinkedUser }
  | { status: "pending"; challenge: PendingLinkChallenge }
  | { status: "linked"; user: LinkedUser };

export interface TrainingResolutionResult {
  assignment: BotAssignment;
  outcome: TrainingOutcome;
  verification: "verified" | "pending" | "not_required";
  points: number;
  rating: number | null;
}

export interface PendingVerificationResult {
  checked: number;
  verified: number;
  remaining: number;
}

export class DiscordTrainingBotService {
  constructor(private readonly store: DiscordBotStore, private readonly atcoder: DiscordAtCoderService) {}

  async linkUser(guildId: string, discordUserId: string, username: string, now = nowSecond()): Promise<LinkUserResult> {
    const linked = this.store.getLinkedUser(guildId, discordUserId);
    if (linked) return { status: "already_linked", user: linked };

    const pending = this.store.getPendingLinkChallenge(guildId, discordUserId);
    if (pending?.atcoderUsername === username && pending.verificationCode) {
      const verified = await this.atcoder.hasProfileVerificationCode(username, pending.verificationCode);
      if (verified) {
        const user = await this.createLinkedUser(guildId, discordUserId, username, now);
        this.store.clearPendingLinkChallenge(guildId, discordUserId);
        return { status: "linked", user };
      }
      return { status: "pending", challenge: pending };
    }

    const challenge = this.store.savePendingLinkChallenge({
      guildId,
      discordUserId,
      atcoderUsername: username,
      verificationCode: createLinkVerificationCode(),
      issuedAt: now,
      updatedAt: now
    });
    return { status: "pending", challenge };
  }

  private async createLinkedUser(guildId: string, discordUserId: string, username: string, now: number): Promise<LinkedUser> {
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

  getDataset(username: string): Promise<AtCoderDataset> {
    return this.atcoder.getDataset(username);
  }

  async resolveTraining(
    guildId: string,
    discordUserId: string,
    outcome: TrainingOutcome,
    now = nowSecond(),
    expectedAssignmentId?: number
  ): Promise<TrainingResolutionResult> {
    const user = this.store.getLinkedUserOrThrow(guildId, discordUserId);
    const assignment = this.store.getActiveAssignment(guildId, discordUserId);
    if (!assignment) {
      const resolvedAssignment = expectedAssignmentId === undefined
        ? this.store.getLatestAssignment(guildId, discordUserId)
        : this.store.getAssignment(expectedAssignmentId);
      if (resolvedAssignment && resolvedAssignment.guildId === guildId && resolvedAssignment.discordUserId === discordUserId) {
        throw new Error(alreadyResolvedAssignmentMessage(resolvedAssignment));
      }
      throw new Error("You do not have an active assignment.");
    }
    if (expectedAssignmentId !== undefined && assignment.id !== expectedAssignmentId) {
      throw new Error("That training button belongs to an older assignment. Use /train current for the active one.");
    }

    if (outcome === "skipped") {
      this.store.resolveAssignment(assignment, outcome, now);
      this.enqueueReview(assignment, outcome, now);
      const rating = this.updateRating(guildId, discordUserId, user.trainingRating, outcome, assignment.targetDelta, now);
      return { assignment, outcome, verification: "not_required", points: 0, rating };
    }

    const solved = await this.atcoder.hasAcceptedSubmission(user.atcoderUsername, assignment.contestId, assignment.problemId, assignment.assignedAt);
    if (!solved) {
      this.store.resolveAssignment(assignment, pendingStatusFor(outcome), now);
      return { assignment, outcome, verification: "pending", points: 0, rating: null };
    }

    const rating = this.verifyScoredAssignment(assignment, outcome, now, now, user.trainingRating);
    this.store.resolveAssignment(assignment, outcome, now);
    return { assignment, outcome, verification: "verified", points: assignment.points, rating };
  }

  async verifyPendingAssignments(now = nowSecond(), limit = 50): Promise<PendingVerificationResult> {
    return this.verifyPendingList(this.store.listPendingVerification(limit), now);
  }

  async verifyPendingAssignmentsForUser(guildId: string, discordUserId: string, now = nowSecond()): Promise<PendingVerificationResult> {
    return this.verifyPendingList(this.store.listPendingVerificationForUser(guildId, discordUserId), now);
  }

  private async verifyPendingList(assignments: BotAssignment[], now: number): Promise<PendingVerificationResult> {
    let verified = 0;
    for (const assignment of assignments) {
      const outcome = outcomeFromPendingStatus(assignment.status);
      if (!outcome) continue;
      const solved = await this.atcoder.hasAcceptedSubmission(assignment.atcoderUsername, assignment.contestId, assignment.problemId, assignment.assignedAt);
      if (!solved) continue;
      const user = this.store.getLinkedUser(assignment.guildId, assignment.discordUserId);
      if (!user) continue;
      if (!this.store.completePendingVerification(assignment, outcome)) continue;
      const claimAt = assignment.resolvedAt ?? now;
      this.verifyScoredAssignment(assignment, outcome, claimAt, now, user.trainingRating);
      verified += 1;
    }
    return { checked: assignments.length, verified, remaining: assignments.length - verified };
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

  private verifyScoredAssignment(
    assignment: BotAssignment,
    outcome: ScoreReason,
    claimAt: number,
    verifiedAt: number,
    currentRating: number
  ): number {
    this.store.addScoreEvent({
      guildId: assignment.guildId,
      discordUserId: assignment.discordUserId,
      assignmentId: assignment.id,
      points: assignment.points,
      reason: outcome,
      occurredAt: claimAt,
      monthKey: getUtcMonthKey(claimAt)
    });
    if (outcome === "assisted") this.enqueueReview(assignment, outcome, claimAt);
    return this.updateRating(assignment.guildId, assignment.discordUserId, currentRating, outcome, assignment.targetDelta, verifiedAt);
  }

  private updateRating(
    guildId: string,
    discordUserId: string,
    currentRating: number,
    outcome: TrainingOutcome,
    targetDelta: number,
    now: number
  ): number {
    const rating = updateTrainingRating(currentRating, outcome, targetDelta);
    this.store.updateTrainingRating(guildId, discordUserId, rating, now);
    this.store.recordTrainingRating(guildId, discordUserId, rating, now);
    return rating;
  }

  private enqueueReview(assignment: BotAssignment, reason: "assisted" | "skipped", now: number): void {
    this.store.enqueueReview({
      guildId: assignment.guildId,
      discordUserId: assignment.discordUserId,
      problemId: assignment.problemId,
      contestId: assignment.contestId,
      title: assignment.title,
      difficulty: assignment.difficulty,
      reason,
      availableAfter: now + reviewDelaySeconds(reason),
      createdAt: now
    });
  }
}

function nowSecond(): number {
  return Math.floor(Date.now() / 1000);
}

function createLinkVerificationCode(): string {
  return `ACD-${randomBytes(6).toString("base64url")}`;
}

function pendingStatusFor(outcome: ScoreReason): "pending_completed" | "pending_assisted" {
  return outcome === "completed" ? "pending_completed" : "pending_assisted";
}

function outcomeFromPendingStatus(status: BotAssignment["status"]): ScoreReason | null {
  if (status === "pending_completed") return "completed";
  if (status === "pending_assisted") return "assisted";
  return null;
}

function alreadyResolvedAssignmentMessage(assignment: BotAssignment): string {
  if (assignment.status === "pending_completed") {
    return `${assignment.title}: completed claim already recorded and pending verification. No points or rating change have been applied yet. Use /train verify to check again.`;
  }
  if (assignment.status === "pending_assisted") {
    return `${assignment.title}: assisted claim already recorded and pending verification. No points or rating change have been applied yet. Use /train verify to check again.`;
  }
  if (assignment.status === "completed") {
    return `${assignment.title}: already completed. Points and training rating were already applied.`;
  }
  if (assignment.status === "assisted") {
    return `${assignment.title}: already marked assisted. Points, review queue, and training rating were already applied.`;
  }
  if (assignment.status === "skipped") {
    return `${assignment.title}: already skipped. Review queue and training rating were already updated.`;
  }
  return "You do not have an active assignment.";
}
