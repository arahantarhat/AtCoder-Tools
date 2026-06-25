import type { Submission, TrainingSession } from "../../types";

export function applyTrainingSubmissions(session: TrainingSession, submissions: Submission[]): TrainingSession {
  const problemById = new Map(session.problems.map((problem) => [problem.problemId, problem]));
  const rawById = new Map(session.rawSubmissions.map((submission) => [submission.id, { ...submission, counted: false }]));
  for (const submission of submissions.sort((a, b) => a.id - b.id || a.epoch_second - b.epoch_second)) {
    const problem = problemById.get(submission.problem_id);
    if (!problem) continue;
    if (submission.epoch_second < session.startedAt || submission.epoch_second > session.startedAt + session.durationSeconds) continue;
    const existing = rawById.get(submission.id);
    if (existing && isTerminalResult(existing.result) && !isBetterResult(submission.result, existing.result)) continue;
    rawById.set(submission.id, {
      id: submission.id,
      problemId: submission.problem_id,
      contestId: submission.contest_id,
      result: submission.result,
      epochSecond: submission.epoch_second,
      order: problem.order,
      counted: false
    });
  }
  const next: TrainingSession = {
    ...session,
    rawSubmissions: [...rawById.values()].sort((a, b) => a.id - b.id || a.epochSecond - b.epochSecond),
    problems: session.problems.map((problem, index) => ({
      ...problem,
      unlocked: index === 0 || session.problems[index - 1]?.solvedAt !== undefined,
      solvedAt: undefined,
      wrongAttempts: 0
    }))
  };
  for (const problem of next.problems) {
    const previous = next.problems[problem.order - 1];
    const unlockedAt = problem.order === 0 ? next.startedAt : previous?.solvedAt;
    problem.unlocked = problem.order === 0 || unlockedAt !== undefined;
    if (unlockedAt === undefined) continue;
    const problemSubmissions = next.rawSubmissions
      .filter((submission) => submission.problemId === problem.problemId && submission.epochSecond >= unlockedAt)
      .sort((a, b) => a.id - b.id || a.epochSecond - b.epochSecond);
    for (const submission of problemSubmissions) {
      if (submission.result === "AC") {
        problem.solvedAt = submission.epochSecond;
        submission.counted = true;
        break;
      }
      problem.wrongAttempts += 1;
      submission.counted = true;
    }
  }
  for (const problem of next.problems) {
    problem.unlocked = problem.order === 0 || next.problems[problem.order - 1]?.solvedAt !== undefined;
  }
  return next;
}

export function getSolvedPrefixLength(session: TrainingSession): number {
  let solved = 0;
  for (const problem of session.problems) {
    if (problem.solvedAt === undefined) break;
    solved += 1;
  }
  return solved;
}

function isTerminalResult(result: string): boolean {
  return result !== "WJ" && result !== "Judging";
}

function isBetterResult(next: string, current: string): boolean {
  return (next === "AC" && current !== "AC") || (isTerminalResult(next) && !isTerminalResult(current));
}
