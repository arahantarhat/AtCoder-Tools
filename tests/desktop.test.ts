import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasStoredTrainingForUser, isValidAtCoderUsername } from "../src/electron/account-policy";
import { JsonStore } from "../src/electron/json-store";
import { isAuthorizedRequest } from "../src/electron/local-server";

describe("desktop persistence", () => {
  it("persists values atomically and supports key removal", async () => {
    const directory = await mkdtemp(join(tmpdir(), "atcoder-dashboard-store-"));
    const path = join(directory, "state.json");
    const store = new JsonStore(path);
    await store.set({ alpha: 1, beta: { ok: true } });
    await store.remove("alpha");
    expect(await store.get(null)).toEqual({ beta: { ok: true } });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ beta: { ok: true } });
  });
});

describe("desktop account policy", () => {
  it("detects persisted per-user training before account switching", () => {
    expect(hasStoredTrainingForUser({
      "atcoder-problemset:training:tourist:sessions": [{ id: "session" }],
      "atcoder-problemset:training:other:sessions": []
    }, "tourist")).toBe(true);
    expect(hasStoredTrainingForUser({
      "atcoder-problemset:training:tourist:sessions": []
    }, "tourist")).toBe(false);
  });

  it("validates AtCoder usernames at the desktop boundary", () => {
    expect(isValidAtCoderUsername("tourist_123")).toBe(true);
    expect(isValidAtCoderUsername("bad-name")).toBe(false);
  });
});

describe("localhost server", () => {
  it("requires the launch token and rejects foreign browser origins", () => {
    const origin = "http://127.0.0.1:12345";
    expect(isAuthorizedRequest({}, "secret", origin)).toBe(false);
    expect(isAuthorizedRequest({
      origin,
      "x-atcoder-dashboard-token": "secret"
    }, "secret", origin)).toBe(true);
    expect(isAuthorizedRequest({
      origin: "http://127.0.0.1:9999",
      "x-atcoder-dashboard-token": "secret"
    }, "secret", origin)).toBe(false);
  });
});
