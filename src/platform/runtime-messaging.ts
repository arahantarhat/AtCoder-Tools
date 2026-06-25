import type { AtCoderMessage, AtCoderResponse } from "../services/atcoder/messages";
import { localRuntimeMessenger } from "./local-runtime";

export interface RuntimeMessenger {
  send(message: AtCoderMessage): Promise<AtCoderResponse>;
}

const chromeRuntimeMessenger: RuntimeMessenger = {
  async send(message) {
    return chrome.runtime.sendMessage(message) as Promise<AtCoderResponse>;
  }
};

export const runtimeMessenger: RuntimeMessenger = typeof globalThis.chrome !== "undefined" && Boolean(globalThis.chrome.runtime?.id)
  ? chromeRuntimeMessenger
  : localRuntimeMessenger;
