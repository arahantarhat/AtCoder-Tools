import type { TrainingSession } from "../../types";
import type { RuntimeMessenger } from "../../platform/runtime-messaging";
import type { AtCoderDataset, OfficialRatingPoint, Submission } from "./types";

export class AtCoderClient {
  constructor(private readonly messenger: RuntimeMessenger) {}

  async getDataset(username: string): Promise<AtCoderDataset> {
    const response = await this.messenger.send({ type: "ATCODER_PROBLEMSET_GET_DATA", username });
    if (!response.ok || !("dataset" in response)) throw new Error(!response.ok ? response.error : "Unknown background response");
    return response.dataset;
  }

  async getRatingHistory(username: string): Promise<OfficialRatingPoint[]> {
    const response = await this.messenger.send({ type: "ATCODER_PROBLEMSET_GET_RATING_HISTORY", username });
    return response.ok && "history" in response ? response.history : [];
  }

  async getRecentSubmissions(username: string, fromSecond: number, session: TrainingSession): Promise<Submission[]> {
    const response = await this.messenger.send({
      type: "ATCODER_PROBLEMSET_GET_RECENT_SUBMISSIONS",
      username,
      fromSecond,
      problems: session.problems.map((problem) => ({ contestId: problem.contestId, problemId: problem.problemId }))
    });
    if (!response.ok || !("submissions" in response)) throw new Error(!response.ok ? response.error : "Unknown background response");
    return response.submissions;
  }
}
