import type { AtCoderDataset, Contest, OfficialRatingPoint, Problem, ProblemModels, Submission } from "../../types";
import { CACHE_TTL_MS, isDatasetCacheKey, isFresh } from "./cache-policy";
import { KENKOOOO_API_BASE } from "./kenkoooo";
import { normalizeHistoryEntry, type AtCoderHistoryEntry } from "./rating-history";

const SUBMISSION_PAGE_SIZE = 500;
const SUBMISSION_DELAY_MS = 350;

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  clearMatching(predicate: (key: string) => boolean): Promise<void>;
}

export interface JsonFetcher {
  <T>(url: string, errorPrefix?: string): Promise<T>;
}

export interface Delay {
  (ms: number): Promise<void>;
}

export interface AuthenticatedSubmissionSource {
  fetchSubmissions(
    username: string,
    fromSecond: number,
    problems: Array<{ contestId: string; problemId: string }>
  ): Promise<Submission[] | null>;
}

export class AtCoderDataService {
  constructor(
    private readonly cache: CacheStore,
    private readonly fetchJson: JsonFetcher,
    private readonly authenticatedSubmissions: AuthenticatedSubmissionSource | null = null,
    private readonly delay: Delay = defaultDelay
  ) {}

  async clearCache(): Promise<void> {
    await this.cache.clearMatching(isDatasetCacheKey);
  }

  async getDataset(username: string): Promise<AtCoderDataset> {
    const [problems, models, contests, submissions] = await Promise.all([
      this.getCachedJson<Problem[]>("resources:problems", `${KENKOOOO_API_BASE}/resources/problems.json`),
      this.getCachedJson<ProblemModels>("resources:problem-models", `${KENKOOOO_API_BASE}/resources/problem-models.json`),
      this.getCachedJson<Contest[]>("resources:contests", `${KENKOOOO_API_BASE}/resources/contests.json`),
      this.getCachedSubmissions(username)
    ]);
    return { problems, models, contests, submissions };
  }

  async getRatingHistory(username: string): Promise<OfficialRatingPoint[]> {
    const key = `rating-history:${username}`;
    const cached = await this.cache.get<{ fetchedAt: number; data: OfficialRatingPoint[] }>(key);
    if (cached?.data.length && isFresh(cached.fetchedAt)) return cached.data;
    const raw = await this.fetchJson<AtCoderHistoryEntry[]>(
      `https://atcoder.jp/users/${encodeURIComponent(username)}/history/json`,
      "AtCoder rating history request failed"
    );
    const history = raw.map(normalizeHistoryEntry)
      .filter((entry): entry is OfficialRatingPoint => entry !== null)
      .sort((a, b) => a.epochSecond - b.epochSecond);
    await this.cache.set(key, { fetchedAt: Date.now(), data: history });
    return history;
  }

  async getRecentSubmissions(
    username: string,
    fromSecond: number,
    problems: Array<{ contestId: string; problemId: string }>
  ): Promise<Submission[]> {
    const safeFrom = Math.max(0, Math.floor(fromSecond));
    const direct = await this.authenticatedSubmissions?.fetchSubmissions(username, safeFrom, problems);
    if (direct !== undefined && direct !== null) return direct;
    return this.fetchSubmissionsPage(username, safeFrom);
  }

  private async getCachedSubmissions(username: string): Promise<Submission[]> {
    const key = `submissions:${username}`;
    const cached = await this.cache.get<{ fetchedAt: number; data: Submission[] }>(key);
    if (cached && isFresh(cached.fetchedAt)) return cached.data;
    const submissions = await this.fetchAllSubmissions(username);
    await this.cache.set(key, { fetchedAt: Date.now(), data: submissions });
    return submissions;
  }

  private async fetchAllSubmissions(username: string): Promise<Submission[]> {
    const submissions: Submission[] = [];
    let fromSecond = 0;
    while (true) {
      const page = await this.fetchSubmissionsPage(username, fromSecond);
      submissions.push(...page);
      if (page.length < SUBMISSION_PAGE_SIZE) break;
      const last = page.at(-1);
      if (!last) break;
      fromSecond = last.epoch_second + 1;
      await this.delay(SUBMISSION_DELAY_MS);
    }
    return submissions;
  }

  private fetchSubmissionsPage(username: string, fromSecond: number): Promise<Submission[]> {
    return this.fetchJson(
      `${KENKOOOO_API_BASE}/atcoder-api/v3/user/submissions?user=${encodeURIComponent(username)}&from_second=${Math.max(0, Math.floor(fromSecond))}`
    );
  }

  private async getCachedJson<T>(key: string, url: string): Promise<T> {
    const cached = await this.cache.get<{ fetchedAt: number; data: T }>(key);
    if (cached && isFresh(cached.fetchedAt, Date.now(), CACHE_TTL_MS)) return cached.data;
    const data = await this.fetchJson<T>(url);
    await this.cache.set(key, { fetchedAt: Date.now(), data });
    return data;
  }
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
