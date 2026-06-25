import type { TrainingMode } from "../../shared/training-modes";

export type ProgressMode = "all" | TrainingMode;

export interface TimelinePoint {
  epochSecond: number;
  officialRating?: number | undefined;
  trainingRating?: number | undefined;
  label: string;
  mode?: TrainingMode | "official" | undefined;
}
