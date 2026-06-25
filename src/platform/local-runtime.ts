import type { BrowserStorage } from "./browser-storage";
import type { RuntimeMessenger } from "./runtime-messaging";

export interface DesktopStatus {
  username: string;
  authenticated: boolean;
  authMode: "atcoder" | "public";
  serverUrl: string;
  version: string;
}

function token(): string {
  const stored = sessionStorage.getItem("acps-token");
  if (stored) return stored;
  const value = new URLSearchParams(location.hash.slice(1)).get("token") ?? "";
  if (value) {
    sessionStorage.setItem("acps-token", value);
    history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  }
  return value;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-AtCoder-Dashboard-Token", token());
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

export const localStorageAdapter: BrowserStorage = {
  async get(keys) {
    return api("/api/storage/get", { method: "POST", body: JSON.stringify({ keys }) });
  },
  async set(items) {
    await api("/api/storage/set", { method: "POST", body: JSON.stringify({ items }) });
  },
  async remove(keys) {
    await api("/api/storage/remove", { method: "POST", body: JSON.stringify({ keys }) });
  }
};

export const localRuntimeMessenger: RuntimeMessenger = {
  async send(message) {
    return api("/api/message", { method: "POST", body: JSON.stringify(message) });
  }
};

export const desktopControl = {
  status: () => api<DesktopStatus>("/api/status"),
  login: () => api<DesktopStatus>("/api/auth/login", { method: "POST" }),
  logout: () => api<DesktopStatus>("/api/auth/logout", { method: "POST" }),
  setUsername: (username: string) => api<DesktopStatus>("/api/settings/username", {
    method: "POST",
    body: JSON.stringify({ username })
  }),
  clearCache: () => api<{ ok: true }>("/api/cache/clear", { method: "POST" }),
  resetAccount: () => api<DesktopStatus>("/api/account/reset", { method: "POST" })
};
