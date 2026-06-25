// Compatibility facade for existing consumers. New code imports feature public APIs.
export {
  applyFilters,
  buildProblemRows,
  classifyContestType,
  countUnratedInScope,
  DEFAULT_FILTERS
} from "./features/problemset";
export { computeStats } from "./features/stats";
export {
  applyTrainingSubmissions,
  calcTrainingTotalResult,
  calibrateTrainingPerformance,
  compareTrainingResults,
  createTrainingSettings,
  estimateTrainingPerformance,
  generateTrainingSession,
  getSolvedPrefixLength,
  makeTrainingBackup,
  normalizeTrainingBackup,
  roundTrainingTarget,
  TRAINING_MODES,
  updateTrainingElo
} from "./features/training";
export { buildProgressTimeline } from "./features/progress";
export { getDifficultyBand, getDifficultyColor, getDifficultyColorName } from "./shared/difficulty";
export type { TimelinePoint } from "./features/progress";
export type { TrainingTotalResult } from "./features/training/rating";
