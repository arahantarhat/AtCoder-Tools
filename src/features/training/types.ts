import type { ContestType } from "../../shared/contest-types";
import type { TrainingMode } from "../../shared/training-modes";

export type { TrainingMode };

export interface TrainingProblem {
  problemId: string;
  contestId: string;
  title: string;
  difficulty: number;
  targetDifficulty: number;
  targetOffset: number;
  point: number;
  rawDifficulty?: number | undefined;
  slope?: number | undefined;
  intercept?: number | undefined;
  variance?: number | undefined;
  order: number;
  unlocked: boolean;
  solvedAt?: number | undefined;
  wrongAttempts: number;
}

export interface TrainingRawSubmission {
  id: number;
  problemId: string;
  contestId: string;
  result: string;
  epochSecond: number;
  order: number;
  counted: boolean;
}

export interface TrainingSession {
  id: string;
  mode: TrainingMode;
  username: string;
  startedAt: number;
  durationSeconds: number;
  targetRating: number;
  problems: TrainingProblem[];
  rawSubmissions: TrainingRawSubmission[];
  lastPolledAt?: number | undefined;
  manualRefreshAvailableAt?: number | undefined;
  endedAt?: number | undefined;
  gracePolledAt?: number | undefined;
  performance?: number | undefined;
  ratingBefore?: number | undefined;
  ratingAfter?: number | undefined;
}

export interface TrainingSettings {
  schemaVersion: 1;
  username: string;
  eloByMode: Record<TrainingMode, number>;
  contestTypes: ContestType[];
  initializedFrom?: {
    type: "atcoder-rating" | "default";
    value: number;
    at: number;
  };
}

export interface TrainingBackup {
  schemaVersion: 1;
  exportedAt: number;
  user: {
    atcoderId: string;
  };
  activeSession?: TrainingSession | undefined;
  sessions: TrainingSession[];
  settings: TrainingSettings;
}
