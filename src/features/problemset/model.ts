import type { AtCoderDataset, ContestType, ProblemRow } from "../../types";

export function classifyContestType(contestId: string, contestTitle = ""): ContestType {
  const id = contestId.toLowerCase();
  const title = contestTitle.toLowerCase();
  if (/^abc\d+/.test(id)) return "ABC";
  if (/^arc\d+/.test(id)) return "ARC";
  if (/^agc\d+/.test(id)) return "AGC";
  if (/^ahc\d+/.test(id)) return "AHC";
  if (id.includes("joi") || title.includes("joi")) return "JOI";
  if (id.includes("typical") || title.includes("typical")) return "Typical";
  return "Other";
}

export function buildProblemRows(dataset: AtCoderDataset): ProblemRow[] {
  const contestById = new Map(dataset.contests.map((contest) => [contest.id, contest]));
  const solvedIds = new Set(
    dataset.submissions.filter((submission) => submission.result === "AC").map((submission) => submission.problem_id)
  );

  return dataset.problems
    .filter((problem) => dataset.models[problem.id]?.is_experimental !== true)
    .map((problem) => {
      const contest = contestById.get(problem.contest_id);
      const model = dataset.models[problem.id];
      const rawDifficulty = model?.difficulty;
      const difficulty = typeof rawDifficulty === "number" && Number.isFinite(rawDifficulty)
        ? Math.round(rawDifficulty)
        : null;
      return {
        problem,
        contest,
        contestType: classifyContestType(problem.contest_id, contest?.title),
        difficulty,
        model,
        startEpochSecond: typeof contest?.start_epoch_second === "number" ? contest.start_epoch_second : null,
        solved: solvedIds.has(problem.id)
      };
    });
}
