import { describe, expect, it, vi } from "vitest";
import { isDatasetCacheKey, isFresh } from "../src/background/cache";
import { normalizeHistoryEntry } from "../src/background/message-handler";
import { AtCoderClient } from "../src/services/atcoder/client";
import { TrainingRepository } from "../src/features/training";
import type { BrowserStorage } from "../src/platform/browser-storage";
import type { RuntimeMessenger } from "../src/platform/runtime-messaging";

describe("background normalization and cache policy", () => {
  it("normalizes rated history entries and rejects unrated entries", () => {
    expect(normalizeHistoryEntry({
      IsRated: true,
      EndTime: "2024-01-01T00:00:00Z",
      NewRating: 1234,
      ContestName: "ABC"
    })).toMatchObject({ rating: 1234, contestName: "ABC" });
    expect(normalizeHistoryEntry({ IsRated: false, EndTime: "2024-01-01", Rating: 1000 })).toBeNull();
  });

  it("recognizes current cache namespaces and TTL boundaries", () => {
    expect(isDatasetCacheKey("resources:problems")).toBe(true);
    expect(isDatasetCacheKey("unrelated")).toBe(false);
    expect(isFresh(1_000, 1_500, 501)).toBe(true);
    expect(isFresh(1_000, 1_500, 500)).toBe(false);
  });
});

describe("browser adapters", () => {
  it("preserves runtime message names and payloads", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, history: [] });
    const client = new AtCoderClient({ send } as RuntimeMessenger);
    await client.getRatingHistory("tourist");
    expect(send).toHaveBeenCalledWith({
      type: "ATCODER_PROBLEMSET_GET_RATING_HISTORY",
      username: "tourist"
    });
  });

  it("uses the existing per-user training storage keys", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const storage = {
      get: vi.fn().mockResolvedValue({}),
      set,
      remove: vi.fn().mockResolvedValue(undefined)
    } satisfies BrowserStorage;
    const repository = new TrainingRepository(storage, "tourist");
    await repository.save({ settings: null, sessions: [], activeSession: undefined });
    expect(set).toHaveBeenCalledWith({
      "atcoder-problemset:training:tourist:settings": null,
      "atcoder-problemset:training:tourist:sessions": [],
      "atcoder-problemset:training:tourist:active-session": undefined
    });
  });

  it("loads and clears training state through the repository boundary", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const storage = {
      get: vi.fn().mockResolvedValue({
        "atcoder-problemset:training:tourist:sessions": []
      }),
      set: vi.fn().mockResolvedValue(undefined),
      remove
    } satisfies BrowserStorage;
    const repository = new TrainingRepository(storage, "tourist");
    expect(await repository.load()).toEqual({ settings: null, sessions: [], activeSession: undefined });
    await repository.clear();
    expect(remove).toHaveBeenCalledWith([
      "atcoder-problemset:training:tourist:settings",
      "atcoder-problemset:training:tourist:sessions",
      "atcoder-problemset:training:tourist:active-session"
    ]);
  });
});
