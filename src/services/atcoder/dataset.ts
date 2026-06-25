import type { AtCoderDataset, Contest, Problem, ProblemModels, Submission } from "./types";

export function createDataset(
  problems: Problem[],
  models: ProblemModels,
  contests: Contest[],
  submissions: Submission[]
): AtCoderDataset {
  return { problems, models, contests, submissions };
}
