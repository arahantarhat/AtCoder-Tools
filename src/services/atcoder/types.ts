export interface Problem {
  id: string;
  contest_id: string;
  title: string;
  point?: number;
}

export interface ProblemModel {
  difficulty?: number;
  rawDifficulty?: number;
  slope?: number;
  intercept?: number;
  variance?: number;
  is_experimental?: boolean;
}

export type ProblemModels = Record<string, ProblemModel>;

export interface Contest {
  id: string;
  title: string;
  start_epoch_second?: number;
}

export interface Submission {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  user_id: string;
  result: string;
  point?: number;
}

export interface AtCoderDataset {
  problems: Problem[];
  models: ProblemModels;
  contests: Contest[];
  submissions: Submission[];
}

export interface OfficialRatingPoint {
  epochSecond: number;
  rating: number;
  performance?: number | undefined;
  contestName?: string | undefined;
  contestScreenName?: string | undefined;
}
