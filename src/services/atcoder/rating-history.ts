import type { OfficialRatingPoint } from "./types";

export interface AtCoderHistoryEntry {
  IsRated?: boolean;
  IsRatedAlgorithm?: boolean;
  is_rated?: boolean;
  is_rated_algorithm?: boolean;
  EndTime: string;
  end_time?: string;
  Rating?: number;
  NewRating?: number;
  rating?: number;
  new_rating?: number;
  Performance?: number;
  performance?: number;
  ContestName?: string;
  ContestScreenName?: string;
  contest_name?: string;
  contest_screen_name?: string;
}

export function normalizeHistoryEntry(entry: AtCoderHistoryEntry): OfficialRatingPoint | null {
  const rated = entry.IsRatedAlgorithm ?? entry.IsRated ?? entry.is_rated_algorithm ?? entry.is_rated ?? true;
  if (!rated) return null;
  const rating = firstNumber(entry.Rating, entry.NewRating, entry.rating, entry.new_rating);
  const endTime = entry.EndTime ?? entry.end_time;
  if (rating === undefined || !endTime) return null;
  const epochSecond = Math.floor(Date.parse(endTime) / 1000);
  if (!Number.isFinite(epochSecond)) return null;
  return {
    epochSecond,
    rating,
    performance: firstNumber(entry.Performance, entry.performance),
    contestName: entry.ContestName ?? entry.contest_name,
    contestScreenName: entry.ContestScreenName ?? entry.contest_screen_name
  };
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value));
}
