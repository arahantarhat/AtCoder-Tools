import type { ContestType, ProblemRow } from "../types";

export type AssignmentStatus = "active" | "completed" | "assisted" | "skipped";
export type AssignmentMode = "gimme" | "train" | "review";
export type ReviewReason = "assisted" | "skipped";

export interface LinkedUser {
  guildId: string;
  discordUserId: string;
  atcoderUsername: string;
  trainingRating: number;
  createdAt: number;
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

export interface ProblemFilters {
  minDifficulty?: number | undefined;
  maxDifficulty?: number | undefined;
  color?: DifficultyColor | undefined;
  categories?: ContestType[] | undefined;
  contestId?: string | undefined;
  contestNumberMin?: number | undefined;
  contestNumberMax?: number | undefined;
  afterEpochSecond?: number | undefined;
  beforeEpochSecond?: number | undefined;
  unsolvedOnly?: boolean | undefined;
}

export type DifficultyColor = "gray" | "brown" | "green" | "cyan" | "blue" | "yellow" | "orange" | "red";

export interface SelectedProblem {
  row: ProblemRow;
  targetDelta: number;
  points: number;
}
