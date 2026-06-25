import { describe, expect, it, vi } from "vitest";
import { AtCoderDataService, type CacheStore, type JsonFetcher } from "../src/services/atcoder/data-service";
import type { Submission } from "../src/types";

class MemoryCache implements CacheStore {
  items = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.items.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.items.set(key, value);
  }

  async clearMatching(predicate: (key: string) => boolean): Promise<void> {
    for (const key of [...this.items.keys()]) {
      if (predicate(key)) this.items.delete(key);
    }
  }
}

describe("shared AtCoder data service", () => {
  it("returns cached rating history without fetching", async () => {
    const cache = new MemoryCache();
    cache.items.set("rating-history:tourist", {
      fetchedAt: Date.now(),
      data: [{ epochSecond: 1, rating: 1200 }]
    });
    const fetchJson = vi.fn() as unknown as JsonFetcher;
    const service = new AtCoderDataService(cache, fetchJson);

    expect(await service.getRatingHistory("tourist")).toEqual([{ epochSecond: 1, rating: 1200 }]);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("falls back to public submissions when authenticated source is unavailable", async () => {
    const publicSubmission: Submission = {
      id: 1,
      epoch_second: 100,
      problem_id: "abc100_a",
      contest_id: "abc100",
      user_id: "tourist",
      result: "AC"
    };
    const service = new AtCoderDataService(
      new MemoryCache(),
      vi.fn().mockResolvedValue([publicSubmission]),
      { fetchSubmissions: vi.fn().mockResolvedValue(null) }
    );

    expect(await service.getRecentSubmissions("tourist", 50, [])).toEqual([publicSubmission]);
  });

  it("uses authenticated submissions when provided", async () => {
    const directSubmission: Submission = {
      id: 2,
      epoch_second: 120,
      problem_id: "abc100_b",
      contest_id: "abc100",
      user_id: "tourist",
      result: "AC"
    };
    const fetchJson = vi.fn().mockResolvedValue([]);
    const service = new AtCoderDataService(
      new MemoryCache(),
      fetchJson,
      { fetchSubmissions: vi.fn().mockResolvedValue([directSubmission]) }
    );

    expect(await service.getRecentSubmissions("tourist", 50, [])).toEqual([directSubmission]);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
