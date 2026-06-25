import type { Submission } from "./types";

export interface SubmissionProblem {
  contestId: string;
  problemId: string;
}

export function filterRecentProblemSubmissions(
  submissions: Submission[],
  fromSecond: number,
  problems: SubmissionProblem[]
): Submission[] {
  const problemIds = new Set(problems.map((problem) => problem.problemId));
  return submissions
    .filter((submission) => submission.epoch_second >= fromSecond && problemIds.has(submission.problem_id))
    .sort((a, b) => a.id - b.id);
}
