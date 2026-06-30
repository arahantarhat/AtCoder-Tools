import type { ContestType, ProblemRow } from "../types";

export type VerifiedAssignmentStatus = "completed" | "assisted" | "skipped";
export type PendingVerificationStatus = "pending_completed" | "pending_assisted";
export type AssignmentStatus = "active" | VerifiedAssignmentStatus | PendingVerificationStatus;
export type AssignmentMode = "gimme" | "train" | "review";
export type ReviewReason = "assisted" | "skipped";
export type ScoreReason = "completed" | "assisted";

export interface LinkedUser {
  guildId: string;
  discordUserId: string;
  atcoderUsername: string;
  trainingRating: number;
  createdAt: number;
  updatedAt: number;
}

export interface PendingLinkChallenge {
  guildId: string;
  discordUserId: string;
  atcoderUsername: string;
  verificationType: "profile_code";
  verificationCode: string;
  issuedAt: number;
  updatedAt: number;
}

export interface BotAssignment {
  id: number;
  guildId: string;
  discordUserId: string;
  atcoderUsername: string;
  mode: AssignmentMode;
  problemId: string;
  contestId: string;
  title: string;
  difficulty: number;
  targetDelta: number;
  points: number;
  status: AssignmentStatus;
  assignedAt: number;
  resolvedAt?: number | undefined;
}

export interface ScoreEvent {
  id: number;
  guildId: string;
  discordUserId: string;
  assignmentId: number;
  points: number;
  reason: "completed" | "assisted";
  occurredAt: number;
  monthKey: string;
}

export interface ReviewQueueItem {
  id: number;
  guildId: string;
  discordUserId: string;
  problemId: string;
  contestId: string;
  title: string;
  difficulty: number;
  reason: ReviewReason;
  availableAfter: number;
  createdAt: number;
  consumedAt?: number | undefined;
}

export interface LeaderboardEntry {
  discordUserId: string;
  atcoderUsername?: string | undefined;
  points: number;
}

export interface MonthlyPoints {
  monthKey: string;
  points: number;
}

export interface LeaderboardTrendPoint extends MonthlyPoints {
  discordUserId: string;
  atcoderUsername?: string | undefined;
}

export interface TrainingRatingPoint {
  dayKey: string;
  epochSecond: number;
  rating: number;
}

export interface ProblemFilters {
  minDifficulty?: number | undefined;
  maxDifficulty?: number | undefined;
  color?: DifficultyColor | undefined;
  category?: ProblemCategory | undefined;
  categories?: ContestType[] | undefined;
  contestId?: string | undefined;
  contestNumberMin?: number | undefined;
  contestNumberMax?: number | undefined;
  afterEpochSecond?: number | undefined;
  beforeEpochSecond?: number | undefined;
  unsolvedOnly?: boolean | undefined;
}

export type DifficultyColor = "gray" | "brown" | "green" | "cyan" | "blue" | "yellow" | "orange" | "red";
export type ProblemCategory = "ABC" | "ARC" | "AGC";

export interface SelectedProblem {
  row: ProblemRow;
  targetDelta: number;
  points: number;
}

export type DuelStatus = "pending" | "active" | "completed" | "declined" | "expired" | "cancelled";
export type DuelResult = "challenger_win" | "target_win" | "draw" | "expired";

export interface DuelProfile {
  guildId: string;
  discordUserId: string;
  atcoderUsername: string;
  duelRating: number;
  createdAt: number;
  updatedAt: number;
}

export interface Duel {
  id: number;
  guildId: string;
  challengerUserId: string;
  targetUserId: string;
  challengerHandle?: string | undefined;
  targetHandle?: string | undefined;
  problemId?: string | undefined;
  contestId?: string | undefined;
  title?: string | undefined;
  difficulty?: number | undefined;
  status: DuelStatus;
  challengedAt: number;
  acceptedAt?: number | undefined;
  expiresAt?: number | undefined;
  completedAt?: number | undefined;
  declinedAt?: number | undefined;
  cancelledAt?: number | undefined;
  expiredAt?: number | undefined;
  handicapCoefficient?: number | undefined;
  lowerRatedUserId?: string | undefined;
  higherRatedUserId?: string | undefined;
  challengerRatingBefore?: number | undefined;
  targetRatingBefore?: number | undefined;
  challengerRatingAfter?: number | undefined;
  targetRatingAfter?: number | undefined;
  challengerDelta?: number | undefined;
  targetDelta?: number | undefined;
  result?: DuelResult | undefined;
  winnerUserId?: string | undefined;
  challengerSolvedAt?: number | undefined;
  targetSolvedAt?: number | undefined;
  filterCategory?: ProblemCategory | undefined;
  filterMinDifficulty?: number | undefined;
  filterMaxDifficulty?: number | undefined;
  filterColor?: DifficultyColor | undefined;
  filterAllowSolved?: boolean | undefined;
}
