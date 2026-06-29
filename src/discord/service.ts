import { randomBytes } from "node:crypto";
import type { AtCoderDataset, Submission } from "../types";
import { selectRandomProblem, selectTrainingProblem } from "./problem-selection";
import { reviewDelaySeconds, updateTrainingRating } from "./scoring";
import { getUtcMonthKey } from "./time";
import type { DiscordAtCoderService } from "./atcoder";
import type { DiscordBotStore } from "./storage";
import type { OfficialRatingPoint } from "../types";
import type { BotAssignment, Duel, DuelProfile, LinkedUser, PendingLinkChallenge, ProblemFilters, ScoreReason } from "./types";
import {
  calculateHandicapCoefficient,
  compareDuelSolves,
  DUEL_ACTIVE_TTL_SECONDS,
  DUEL_PENDING_TTL_SECONDS,
  type DuelComparison
} from "./duels";

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

export type DuelChallengeResult = { duel: Duel; challenger: LinkedUser; target: LinkedUser };
export type DuelAcceptResult = { duel: Duel; challengerProfile: DuelProfile; targetProfile: DuelProfile };
export type DuelDenyResult = { duel: Duel };
export type DuelStatusResult =
  | { status: "active"; duel: Duel; comparison: DuelComparison }
  | { status: "pending"; sent: Duel[]; received: Duel[] };
export type DuelVerifyResult =
  | { status: "completed"; duel: Duel; alreadyCompleted: boolean }
  | { status: "active"; duel: Duel; comparison: DuelComparison }
  | { status: "expired"; duel: Duel }
  | { status: "pending_judgement"; duel: Duel };

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

  async challengeDuel(guildId: string, challengerUserId: string, targetUserId: string, now = nowSecond()): Promise<DuelChallengeResult> {
    if (challengerUserId === targetUserId) throw new Error("You cannot duel yourself.");
    this.store.expireStaleDuels(now);
    const challenger = this.store.getLinkedUserOrThrow(guildId, challengerUserId);
    const target = this.store.getLinkedUser(guildId, targetUserId);
    if (!target) throw new Error("That Discord user is not linked. They need to use /link first.");
    if (this.store.findDuplicatePendingDuel(guildId, challengerUserId, targetUserId, now)) {
      throw new Error("There is already a pending duel challenge between those users.");
    }
    if (this.store.getActiveDuelConflict(guildId, challengerUserId, targetUserId)) {
      throw new Error("One of those users is already in an active duel.");
    }
    const duel = this.store.createPendingDuel({
      guildId,
      challengerUserId,
      targetUserId,
      challengedAt: now,
      expiresAt: now + DUEL_PENDING_TTL_SECONDS
    });
    return { duel, challenger, target };
  }

  async acceptDuel(guildId: string, discordUserId: string, now = nowSecond(), duelId?: number): Promise<DuelAcceptResult> {
    this.store.expireStaleDuels(now);
    const pending = duelId === undefined ? this.store.getOldestReceivedPendingDuel(guildId, discordUserId, now) : this.store.getDuel(duelId);
    if (!pending || pending.guildId !== guildId || pending.status !== "pending" || pending.expiresAt === undefined || pending.expiresAt <= now) {
      throw new Error("That duel challenge is no longer pending.");
    }
    if (pending.targetUserId !== discordUserId) throw new Error("Only the challenged user can accept this duel.");
    if (this.store.getActiveDuelConflict(guildId, pending.challengerUserId, pending.targetUserId)) {
      throw new Error("One of those users is already in an active duel.");
    }

    const challenger = this.store.getLinkedUserOrThrow(guildId, pending.challengerUserId);
    const target = this.store.getLinkedUserOrThrow(guildId, pending.targetUserId);
    const challengerProfile = await this.ensureDuelProfile(challenger, now);
    const targetProfile = await this.ensureDuelProfile(target, now);
    const dataset = await this.atcoder.getDataset(challenger.atcoderUsername);
    const row = selectRandomProblem(dataset, { unsolvedOnly: true });
    if (!row || row.difficulty === null) throw new Error("No duel problem is available right now.");

    const lowerRatedUserId = challengerProfile.duelRating <= targetProfile.duelRating ? challenger.discordUserId : target.discordUserId;
    const higherRatedUserId = lowerRatedUserId === challenger.discordUserId ? target.discordUserId : challenger.discordUserId;
    const lowerRating = Math.min(challengerProfile.duelRating, targetProfile.duelRating);
    const higherRating = Math.max(challengerProfile.duelRating, targetProfile.duelRating);
    const duel = this.store.acceptDuel({
      duelId: pending.id,
      challengerHandle: challenger.atcoderUsername,
      targetHandle: target.atcoderUsername,
      problemId: row.problem.id,
      contestId: row.problem.contest_id,
      title: row.problem.title,
      difficulty: row.difficulty,
      challengerRating: challengerProfile.duelRating,
      targetRating: targetProfile.duelRating,
      lowerRatedUserId,
      higherRatedUserId,
      handicapCoefficient: calculateHandicapCoefficient(row.difficulty, lowerRating, higherRating),
      acceptedAt: now,
      expiresAt: now + DUEL_ACTIVE_TTL_SECONDS
    });
    if (!duel) throw new Error("That duel challenge is no longer pending.");
    return { duel, challengerProfile, targetProfile };
  }

  async denyDuel(guildId: string, discordUserId: string, now = nowSecond(), duelId?: number): Promise<DuelDenyResult> {
    this.store.expireStaleDuels(now);
    const pending = duelId === undefined ? this.store.getOldestReceivedPendingDuel(guildId, discordUserId, now) : this.store.getDuel(duelId);
    if (!pending || pending.guildId !== guildId || pending.status !== "pending" || pending.expiresAt === undefined || pending.expiresAt <= now) {
      throw new Error("That duel challenge is no longer pending.");
    }
    if (pending.targetUserId !== discordUserId && pending.challengerUserId !== discordUserId) {
      throw new Error("Only a participant can deny this duel.");
    }
    const duel = this.store.declineDuel(pending.id, now);
    if (!duel) throw new Error("That duel challenge is no longer pending.");
    return { duel };
  }

  async getDuelStatus(guildId: string, discordUserId: string, now = nowSecond()): Promise<DuelStatusResult> {
    this.store.expireStaleDuels(now);
    const active = this.store.getActiveDuelForUser(guildId, discordUserId);
    if (!active) {
      const pending = this.store.listPendingDuelsForUser(guildId, discordUserId, now);
      return { status: "pending", sent: pending.sent, received: pending.received };
    }
    const comparison = await this.compareActiveDuel(active, now);
    if (comparison.status === "expired") {
      this.store.expireDuel(active.id, now);
      const pending = this.store.listPendingDuelsForUser(guildId, discordUserId, now);
      return { status: "pending", sent: pending.sent, received: pending.received };
    }
    return { status: "active", duel: active, comparison };
  }

  async verifyDuel(guildId: string, discordUserId: string, now = nowSecond()): Promise<DuelVerifyResult> {
    this.store.expireStaleDuels(now);
    const active = this.store.getActiveDuelForUser(guildId, discordUserId);
    if (!active) {
      const latest = this.store.listCompletedDuelsForUser(guildId, discordUserId, 1)[0];
      if (latest) return { status: "completed", duel: latest, alreadyCompleted: true };
      throw new Error("You do not have an active duel.");
    }
    const comparison = await this.compareActiveDuel(active, now);
    if (comparison.status === "pending_judgement") return { status: "pending_judgement", duel: active };
    if (comparison.status === "expired") {
      const expired = this.store.expireDuel(active.id, now) ?? active;
      return { status: "expired", duel: expired };
    }
    if (comparison.status === "completed") {
      const completed = this.store.completeDuel({ duel: active, completion: comparison, now });
      return { status: "completed", duel: completed ?? active, alreadyCompleted: false };
    }
    return { status: "active", duel: active, comparison };
  }

  listDuelHistory(guildId: string, discordUserId: string): Duel[] {
    this.store.getLinkedUserOrThrow(guildId, discordUserId);
    return this.store.listCompletedDuelsForUser(guildId, discordUserId, 10);
  }

  getDatasetForTests(username: string): Promise<AtCoderDataset> {
    return this.atcoder.getDataset(username);
  }

  private async ensureDuelProfile(user: LinkedUser, now: number): Promise<DuelProfile> {
    const existing = this.store.getDuelProfile(user.guildId, user.discordUserId);
    if (existing) return this.store.upsertDuelProfile({
      guildId: user.guildId,
      discordUserId: user.discordUserId,
      atcoderUsername: user.atcoderUsername,
      initialRating: existing.duelRating,
      now
    });
    const initialRating = await this.atcoder.getInitialDuelRating(user.atcoderUsername);
    return this.store.upsertDuelProfile({
      guildId: user.guildId,
      discordUserId: user.discordUserId,
      atcoderUsername: user.atcoderUsername,
      initialRating,
      now
    });
  }

  private async compareActiveDuel(duel: Duel, now: number): Promise<DuelComparison> {
    if (!duel.acceptedAt || !duel.contestId || !duel.problemId || !duel.challengerHandle || !duel.targetHandle) {
      throw new Error("Active duel is missing verification metadata.");
    }
    const [challengerSubmissions, targetSubmissions] = await Promise.all([
      this.atcoder.getProblemSubmissions(duel.challengerHandle, duel.contestId, duel.problemId, duel.acceptedAt),
      this.atcoder.getProblemSubmissions(duel.targetHandle, duel.contestId, duel.problemId, duel.acceptedAt)
    ]);
    const challengerSolvedAt = firstAcceptedAt(challengerSubmissions);
    const targetSolvedAt = firstAcceptedAt(targetSubmissions);
    return compareDuelSolves({
      duel,
      challengerSolvedAt,
      targetSolvedAt,
      hasPendingJudgement: hasPendingJudgement(challengerSubmissions) || hasPendingJudgement(targetSubmissions),
      now
    });
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

function firstAcceptedAt(submissions: Submission[]): number | undefined {
  return submissions.find((submission) => submission.result === "AC")?.epoch_second;
}

function hasPendingJudgement(submissions: Submission[]): boolean {
  return submissions.some((submission) => submission.result === "WJ" || submission.result === "Judging");
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
