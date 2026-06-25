import type { AtCoderDataset, OfficialRatingPoint, Submission } from "./types";

export type AtCoderMessage =
  | { type: "ATCODER_PROBLEMSET_GET_DATA"; username: string }
  | { type: "ATCODER_PROBLEMSET_GET_RATING_HISTORY"; username: string }
  | {
      type: "ATCODER_PROBLEMSET_GET_RECENT_SUBMISSIONS";
      username: string;
      fromSecond: number;
      problems?: Array<{ contestId: string; problemId: string }>;
    }
  | { type: "ATCODER_PROBLEMSET_CLEAR_CACHE" };

export type AtCoderResponse =
  | { ok: true; dataset: AtCoderDataset }
  | { ok: true; history: OfficialRatingPoint[] }
  | { ok: true; submissions: Submission[] }
  | { ok: true }
  | { ok: false; error: string };
