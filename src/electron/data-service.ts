import type { Session } from "electron";
import { parseAtCoderSubmissions } from "../services/atcoder/submission-parser";
import type { AtCoderMessage, AtCoderResponse } from "../services/atcoder/messages";
import { AtCoderDataService, type CacheStore } from "../services/atcoder/data-service";
import { fetchJson } from "../services/atcoder/kenkoooo";
import type { Submission } from "../types";
import { JsonStore } from "./json-store";

export class DataService {
  private readonly dataService: AtCoderDataService;

  constructor(
    private readonly store: JsonStore,
    private readonly atCoderSession: Session,
    private readonly getAuthenticatedUsername: () => string,
    private readonly onAuthenticationExpired: () => void
  ) {
    this.dataService = new AtCoderDataService(
      new JsonCacheStore(store),
      fetchJson,
      {
        fetchSubmissions: (username, fromSecond, problems) => {
          if (this.getAuthenticatedUsername() !== username) return Promise.resolve(null);
          return this.fetchAtCoderSubmissions(username, fromSecond, problems);
        }
      }
    );
  }

  async handle(message: AtCoderMessage): Promise<AtCoderResponse> {
    try {
      if (message.type === "ATCODER_PROBLEMSET_GET_DATA") {
        return { ok: true, dataset: await this.dataService.getDataset(message.username) };
      }
      if (message.type === "ATCODER_PROBLEMSET_GET_RATING_HISTORY") {
        return { ok: true, history: await this.dataService.getRatingHistory(message.username) };
      }
      if (message.type === "ATCODER_PROBLEMSET_GET_RECENT_SUBMISSIONS") {
        return {
          ok: true,
          submissions: await this.dataService.getRecentSubmissions(message.username, message.fromSecond, message.problems ?? [])
        };
      }
      await this.clearCache();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  async clearCache(): Promise<void> {
    await this.dataService.clearCache();
  }

  private async fetchAtCoderSubmissions(
    username: string,
    fromSecond: number,
    problems: Array<{ contestId: string; problemId: string }>
  ): Promise<Submission[] | null> {
    const problemIds = new Set(problems.map((problem) => problem.problemId));
    const submissions: Submission[] = [];
    for (const contestId of new Set(problems.map((problem) => problem.contestId))) {
      const response = await this.atCoderSession.fetch(
        `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/submissions?f.User=${encodeURIComponent(username)}&f.Task=&f.LanguageName=&f.Status=`
      );
      if (!response.ok) return null;
      const html = await response.text();
      if (html.includes("Sign In - AtCoder")) {
        this.onAuthenticationExpired();
        return null;
      }
      submissions.push(...parseAtCoderSubmissions(html, username, contestId)
        .filter((submission) => submission.epoch_second >= fromSecond && problemIds.has(submission.problem_id)));
    }
    return submissions.sort((a, b) => a.id - b.id);
  }
}

class JsonCacheStore implements CacheStore {
  constructor(private readonly store: JsonStore) {}

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.store.get(key))[key] as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.store.set({ [key]: value });
  }

  async clearMatching(predicate: (key: string) => boolean): Promise<void> {
    await this.store.clearMatching(predicate);
  }
}
