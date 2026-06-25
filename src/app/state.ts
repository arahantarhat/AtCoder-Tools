import type {
  Filters,
  OfficialRatingPoint,
  ProblemRow,
  ProgressMode,
  Stats,
  TrainingSession,
  TrainingSettings
} from "../types";
import { DEFAULT_FILTERS } from "../features/problemset";
import { computeStats } from "../features/stats";
import type { ActiveTab } from "./router";

export interface AppState {
  allRows: ProblemRow[];
  filteredRows: ProblemRow[];
  filters: Filters;
  stats: Stats;
  activeTab: ActiveTab;
  progressMode: ProgressMode;
  username: string;
  noticeMessage: string;
  officialHistory: OfficialRatingPoint[];
  trainingSettings: TrainingSettings | null;
  trainingSessions: TrainingSession[];
  activeSession: TrainingSession | undefined;
}

export function createAppState(): AppState {
  return {
    allRows: [],
    filteredRows: [],
    filters: { ...DEFAULT_FILTERS },
    stats: computeStats([], 0),
    activeTab: "problemset",
    progressMode: "all",
    username: "",
    noticeMessage: "",
    officialHistory: [],
    trainingSettings: null,
    trainingSessions: [],
    activeSession: undefined
  };
}
