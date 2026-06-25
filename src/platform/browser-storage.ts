export interface BrowserStorage {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

const chromeStorage: BrowserStorage = {
  async get(keys) {
    return chrome.storage.local.get(keys);
  },
  async set(items) {
    await chrome.storage.local.set(items);
  },
  async remove(keys) {
    await chrome.storage.local.remove(keys);
  }
};

export const browserStorage: BrowserStorage = typeof globalThis.chrome !== "undefined" && Boolean(globalThis.chrome.runtime?.id)
  ? chromeStorage
  : localStorageAdapter;
import { localStorageAdapter } from "./local-runtime";
