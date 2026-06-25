"use strict";
(() => {
  // src/services/atcoder/submission-parser.ts
  function parseAtCoderSubmissions(html, username, fallbackContestId) {
    const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
    const submissions = [];
    for (const row of rows) {
      const id = Number(row.match(/\/submissions\/(\d+)/)?.[1]);
      const problemId = row.match(/\/tasks\/([^"?#]+)/)?.[1];
      const contestId = row.match(/\/contests\/([^/]+)\/submissions\//)?.[1] ?? fallbackContestId;
      const timeText = decodeHtml(row.match(/<time[^>]*>([^<]+)<\/time>/)?.[1] ?? "");
      const cells = row.match(/<td[\s\S]*?<\/td>/g) ?? [];
      const result = extractSubmissionResult(cells[6] ?? row);
      const epochSecond = Math.floor(Date.parse(timeText.replace(" ", "T")) / 1e3);
      if (!Number.isFinite(id) || !problemId || !result || !Number.isFinite(epochSecond))
        continue;
      submissions.push({
        id,
        epoch_second: epochSecond,
        problem_id: problemId,
        contest_id: contestId,
        user_id: username,
        result
      });
    }
    return submissions;
  }
  function extractSubmissionResult(html) {
    const text = decodeHtml(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    return ["AC", "WA", "TLE", "MLE", "RE", "CE", "OLE", "IE", "WJ", "Judging"].find((status) => new RegExp(`(^|\\s)${status}(\\s|$)`).test(text));
  }
  function decodeHtml(value) {
    return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  // src/services/atcoder/kenkoooo.ts
  var KENKOOOO_API_BASE = "https://kenkoooo.com/atcoder";
  async function fetchJson(url, errorPrefix = "Kenkoooo request failed") {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`${errorPrefix}: ${response.status} ${response.statusText}`);
    return response.json();
  }

  // src/services/atcoder/rating-history.ts
  function normalizeHistoryEntry(entry) {
    const rated = entry.IsRatedAlgorithm ?? entry.IsRated ?? entry.is_rated_algorithm ?? entry.is_rated ?? true;
    if (!rated)
      return null;
    const rating = firstNumber(entry.Rating, entry.NewRating, entry.rating, entry.new_rating);
    const endTime = entry.EndTime ?? entry.end_time;
    if (rating === void 0 || !endTime)
      return null;
    const epochSecond = Math.floor(Date.parse(endTime) / 1e3);
    if (!Number.isFinite(epochSecond))
      return null;
    return {
      epochSecond,
      rating,
      performance: firstNumber(entry.Performance, entry.performance),
      contestName: entry.ContestName ?? entry.contest_name,
      contestScreenName: entry.ContestScreenName ?? entry.contest_screen_name
    };
  }
  function firstNumber(...values) {
    return values.find((value) => typeof value === "number" && Number.isFinite(value));
  }

  // src/services/atcoder/cache-policy.ts
  var CACHE_TTL_MS = 12 * 60 * 60 * 1e3;
  function isFresh(fetchedAt, now = Date.now(), ttlMs = CACHE_TTL_MS) {
    return now - fetchedAt < ttlMs;
  }
  function isDatasetCacheKey(key) {
    return key.startsWith("resources:") || key.startsWith("submissions:") || key.startsWith("rating-history:");
  }

  // src/services/atcoder/data-service.ts
  var SUBMISSION_PAGE_SIZE = 500;
  var SUBMISSION_DELAY_MS = 350;
  var AtCoderDataService = class {
    constructor(cache, fetchJson2, authenticatedSubmissions = null, delay = defaultDelay) {
      this.cache = cache;
      this.fetchJson = fetchJson2;
      this.authenticatedSubmissions = authenticatedSubmissions;
      this.delay = delay;
    }
    async clearCache() {
      await this.cache.clearMatching(isDatasetCacheKey);
    }
    async getDataset(username) {
      const [problems, models, contests, submissions] = await Promise.all([
        this.getCachedJson("resources:problems", `${KENKOOOO_API_BASE}/resources/problems.json`),
        this.getCachedJson("resources:problem-models", `${KENKOOOO_API_BASE}/resources/problem-models.json`),
        this.getCachedJson("resources:contests", `${KENKOOOO_API_BASE}/resources/contests.json`),
        this.getCachedSubmissions(username)
      ]);
      return { problems, models, contests, submissions };
    }
    async getRatingHistory(username) {
      const key = `rating-history:${username}`;
      const cached = await this.cache.get(key);
      if (cached?.data.length && isFresh(cached.fetchedAt))
        return cached.data;
      const raw = await this.fetchJson(
        `https://atcoder.jp/users/${encodeURIComponent(username)}/history/json`,
        "AtCoder rating history request failed"
      );
      const history = raw.map(normalizeHistoryEntry).filter((entry) => entry !== null).sort((a, b) => a.epochSecond - b.epochSecond);
      await this.cache.set(key, { fetchedAt: Date.now(), data: history });
      return history;
    }
    async getRecentSubmissions(username, fromSecond, problems) {
      const safeFrom = Math.max(0, Math.floor(fromSecond));
      const direct = await this.authenticatedSubmissions?.fetchSubmissions(username, safeFrom, problems);
      if (direct !== void 0 && direct !== null)
        return direct;
      return this.fetchSubmissionsPage(username, safeFrom);
    }
    async getCachedSubmissions(username) {
      const key = `submissions:${username}`;
      const cached = await this.cache.get(key);
      if (cached && isFresh(cached.fetchedAt))
        return cached.data;
      const submissions = await this.fetchAllSubmissions(username);
      await this.cache.set(key, { fetchedAt: Date.now(), data: submissions });
      return submissions;
    }
    async fetchAllSubmissions(username) {
      const submissions = [];
      let fromSecond = 0;
      while (true) {
        const page = await this.fetchSubmissionsPage(username, fromSecond);
        submissions.push(...page);
        if (page.length < SUBMISSION_PAGE_SIZE)
          break;
        const last = page.at(-1);
        if (!last)
          break;
        fromSecond = last.epoch_second + 1;
        await this.delay(SUBMISSION_DELAY_MS);
      }
      return submissions;
    }
    fetchSubmissionsPage(username, fromSecond) {
      return this.fetchJson(
        `${KENKOOOO_API_BASE}/atcoder-api/v3/user/submissions?user=${encodeURIComponent(username)}&from_second=${Math.max(0, Math.floor(fromSecond))}`
      );
    }
    async getCachedJson(key, url) {
      const cached = await this.cache.get(key);
      if (cached && isFresh(cached.fetchedAt, Date.now(), CACHE_TTL_MS))
        return cached.data;
      const data = await this.fetchJson(url);
      await this.cache.set(key, { fetchedAt: Date.now(), data });
      return data;
    }
  };
  function defaultDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // src/background/message-handler.ts
  function registerBackgroundMessageHandler() {
    const dataService = createBackgroundDataService();
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "ATCODER_PROBLEMSET_GET_DATA") {
        dataService.getDataset(message.username).then((dataset) => sendResponse({ ok: true, dataset })).catch((error) => sendResponse({ ok: false, error: String(error) }));
        return true;
      }
      if (message.type === "ATCODER_PROBLEMSET_CLEAR_CACHE") {
        dataService.clearCache().then(() => sendResponse({ ok: true }));
        return true;
      }
      if (message.type === "ATCODER_PROBLEMSET_GET_RATING_HISTORY") {
        dataService.getRatingHistory(message.username).then((history) => sendResponse({ ok: true, history })).catch((error) => sendResponse({ ok: false, error: String(error) }));
        return true;
      }
      if (message.type === "ATCODER_PROBLEMSET_GET_RECENT_SUBMISSIONS") {
        dataService.getRecentSubmissions(message.username, message.fromSecond, message.problems ?? []).then((submissions) => sendResponse({ ok: true, submissions })).catch((error) => sendResponse({ ok: false, error: String(error) }));
        return true;
      }
      return false;
    });
  }
  function createBackgroundDataService() {
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
  async function fetchAtCoderSubmissions(username, fromSecond, problems) {
    const contestIds = [...new Set(problems.map((problem) => problem.contestId))];
    const problemIds = new Set(problems.map((problem) => problem.problemId));
    const submissions = [];
    for (const contestId of contestIds) {
      const url = `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/submissions?f.User=${encodeURIComponent(username)}&f.Task=&f.LanguageName=&f.Status=`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok)
        continue;
      const html = await response.text();
      if (html.includes("Sign In - AtCoder"))
        continue;
      for (const submission of parseAtCoderSubmissions(html, username, contestId)) {
        if (submission.epoch_second >= fromSecond && problemIds.has(submission.problem_id)) {
          submissions.push(submission);
        }
      }
    }
    return submissions.sort((a, b) => a.id - b.id);
  }
  function getStorageItem(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (items) => resolve(items[key]));
    });
  }
  function setStorageItem(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
  var ChromeCacheStore = class {
    get(key) {
      return getStorageItem(key);
    }
    set(key, value) {
      return setStorageItem(key, value);
    }
    clearMatching(predicate) {
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
  };

  // src/entrypoints/background.ts
  registerBackgroundMessageHandler();
})();
//# sourceMappingURL=background.js.map
