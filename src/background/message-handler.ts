import type { Submission } from "../types";
import type { AtCoderMessage } from "../services/atcoder/messages";
import { isDatasetCacheKey } from "./cache";
import { parseAtCoderSubmissions } from "../services/atcoder/submission-parser";
import { fetchJson, KENKOOOO_API_BASE } from "./kenkoooo-client";
import { normalizeHistoryEntry } from "../services/atcoder/rating-history";
import { AtCoderDataService, type CacheStore } from "../services/atcoder/data-service";

export function registerBackgroundMessageHandler(): void {
const dataService = createBackgroundDataService();
chrome.runtime.onMessage.addListener((message: AtCoderMessage, _sender, sendResponse) => {
  if (message.type === "ATCODER_PROBLEMSET_GET_DATA") {
    dataService.getDataset(message.username)
      .then((dataset) => sendResponse({ ok: true, dataset }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "ATCODER_PROBLEMSET_CLEAR_CACHE") {
    dataService.clearCache().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "ATCODER_PROBLEMSET_GET_RATING_HISTORY") {
    dataService.getRatingHistory(message.username)
      .then((history) => sendResponse({ ok: true, history }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "ATCODER_PROBLEMSET_GET_RECENT_SUBMISSIONS") {
    dataService.getRecentSubmissions(message.username, message.fromSecond, message.problems ?? [])
      .then((submissions) => sendResponse({ ok: true, submissions }))
      .catch((error: unknown) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
}

function createBackgroundDataService(): AtCoderDataService {
  return new AtCoderDataService(
    new ChromeCacheStore(),
    fetchJson,
    {
      async fetchSubmissions(username, fromSecond, problems) {
        const submissions = await fetchAtCoderSubmissions(username, fromSecond, problems);
        return submissions.length > 0 ? submissions : null;
      }
    }
  );
}

async function fetchAtCoderSubmissions(username: string, fromSecond: number, problems: Array<{ contestId: string; problemId: string }>): Promise<Submission[]> {
  const contestIds = [...new Set(problems.map((problem) => problem.contestId))];
  const problemIds = new Set(problems.map((problem) => problem.problemId));
  const submissions: Submission[] = [];

  for (const contestId of contestIds) {
    const url = `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/submissions?f.User=${encodeURIComponent(username)}&f.Task=&f.LanguageName=&f.Status=`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) continue;
    const html = await response.text();
    if (html.includes("Sign In - AtCoder")) continue;
    for (const submission of parseAtCoderSubmissions(html, username, contestId)) {
      if (submission.epoch_second >= fromSecond && problemIds.has(submission.problem_id)) {
        submissions.push(submission);
      }
    }
  }

  return submissions.sort((a, b) => a.id - b.id);
}

function getStorageItem<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (items) => resolve(items[key] as T | undefined));
  });
}

function setStorageItem<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

class ChromeCacheStore implements CacheStore {
  get<T>(key: string): Promise<T | undefined> {
    return getStorageItem<T>(key);
  }

  set<T>(key: string, value: T): Promise<void> {
    return setStorageItem(key, value);
  }

  clearMatching(predicate: (key: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        const keys = Object.keys(items).filter(predicate);
        if (keys.length === 0) {
          resolve();
          return;
        }
        chrome.storage.local.remove(keys, resolve);
      });
    });
  }
}

export { normalizeHistoryEntry };
