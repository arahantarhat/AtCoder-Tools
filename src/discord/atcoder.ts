import { parseAtCoderSubmissions } from "../services/atcoder/submission-parser";
import { AtCoderDataService, type CacheStore } from "../services/atcoder/data-service";
import { fetchJson } from "../services/atcoder/kenkoooo";
import type { AtCoderDataset, OfficialRatingPoint, Submission } from "../types";

export class DiscordAtCoderService {
  private readonly dataService: AtCoderDataService;

  constructor(cache: CacheStore, private readonly fetchImpl: typeof fetch = fetch) {
    this.dataService = new AtCoderDataService(cache, fetchJson);
  }

  getDataset(username: string): Promise<AtCoderDataset> {
    return this.dataService.getDataset(username);
  }

  async getInitialRating(username: string): Promise<number> {
    const history = await this.dataService.getRatingHistory(username).catch((): OfficialRatingPoint[] => []);
    return Math.max(400, history.at(-1)?.rating ?? 400);
  }

  getRatingHistory(username: string): Promise<OfficialRatingPoint[]> {
    return this.dataService.getRatingHistory(username);
  }

  async hasAcceptedSubmission(username: string, contestId: string, problemId: string, fromSecond: number): Promise<boolean> {
    const direct = await this.fetchContestSubmissions(username, contestId).catch((): Submission[] | null => null);
    if (direct?.some((submission) => isAcceptedAfter(submission, problemId, fromSecond))) return true;
    const fallback = await this.dataService.getRecentSubmissions(username, fromSecond, [{ contestId, problemId }]).catch((): Submission[] => []);
    return fallback.some((submission) => isAcceptedAfter(submission, problemId, fromSecond));
  }

  private async fetchContestSubmissions(username: string, contestId: string): Promise<Submission[]> {
    const url = `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/submissions?f.User=${encodeURIComponent(username)}&f.Task=&f.LanguageName=&f.Status=AC`;
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`AtCoder submissions request failed: ${response.status} ${response.statusText}`);
    return parseAtCoderSubmissions(await response.text(), username, contestId);
  }
}

function isAcceptedAfter(submission: Submission, problemId: string, fromSecond: number): boolean {
  return submission.problem_id === problemId && submission.result === "AC" && submission.epoch_second >= fromSecond;
}
