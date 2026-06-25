import type { BrowserStorage } from "../../platform/browser-storage";
import type { ContestType, TrainingSession, TrainingSettings } from "../../types";

const STORAGE_TRAINING_PREFIX = "atcoder-problemset:training";

export interface TrainingState {
  settings: TrainingSettings | null;
  sessions: TrainingSession[];
  activeSession: TrainingSession | undefined;
}

export class TrainingRepository {
  constructor(
    private readonly storage: BrowserStorage,
    private readonly username: string
  ) {}

  async load(): Promise<TrainingState> {
    const settingsKey = this.key("settings");
    const sessionsKey = this.key("sessions");
    const activeSessionKey = this.key("active-session");
    const keys = [settingsKey, sessionsKey, activeSessionKey];
    const stored = await this.storage.get(keys);
    return {
      settings: normalizeTrainingSettings(stored[settingsKey], this.username),
      sessions: Array.isArray(stored[sessionsKey]) ? stored[sessionsKey] as TrainingSession[] : [],
      activeSession: normalizeActiveSession(stored[activeSessionKey], this.username)
    };
  }

  async save(state: TrainingState): Promise<void> {
    await this.storage.set({
      [this.key("settings")]: state.settings,
      [this.key("sessions")]: state.sessions,
      [this.key("active-session")]: state.activeSession
    });
  }

  async clear(): Promise<void> {
    await this.storage.remove([this.key("settings"), this.key("sessions"), this.key("active-session")]);
  }

  private key(suffix: string): string {
    return `${STORAGE_TRAINING_PREFIX}:${this.username}:${suffix}`;
  }
}

function normalizeTrainingSettings(value: unknown, username: string): TrainingSettings | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as TrainingSettings;
  if (candidate.schemaVersion !== 1 || candidate.username !== username) return null;
  if (typeof candidate.eloByMode?.["ladder-2h"] !== "number") return null;
  if (typeof candidate.eloByMode?.["consistency-1h"] !== "number") return null;
  const contestTypes: ContestType[] = ["ABC", "ARC", "AGC", "AHC", "JOI", "Typical", "Other"];
  return {
    ...candidate,
    contestTypes: Array.isArray(candidate.contestTypes) && candidate.contestTypes.every((type) => contestTypes.includes(type))
      ? candidate.contestTypes
      : ["ABC", "ARC", "AGC"]
  };
}

function normalizeActiveSession(value: unknown, username: string): TrainingSession | undefined {
  if (!value || typeof value !== "object") return undefined;
  const session = value as TrainingSession;
  return session.username === username && !session.endedAt ? session : undefined;
}
