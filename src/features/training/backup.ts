import type { TrainingBackup, TrainingSession, TrainingSettings } from "../../types";

export function makeTrainingBackup(
  username: string,
  settings: TrainingSettings,
  sessions: TrainingSession[],
  activeSession?: TrainingSession
): TrainingBackup {
  return {
    schemaVersion: 1,
    exportedAt: Math.floor(Date.now() / 1000),
    user: { atcoderId: username },
    activeSession,
    sessions,
    settings
  };
}

export function normalizeTrainingBackup(value: unknown): TrainingBackup | null {
  if (!value || typeof value !== "object") return null;
  const backup = value as Partial<TrainingBackup>;
  if (backup.schemaVersion !== 1) return null;
  if (!backup.user || typeof backup.user.atcoderId !== "string") return null;
  if (!backup.settings || backup.settings.schemaVersion !== 1) return null;
  if (!Array.isArray(backup.sessions)) return null;
  return backup as TrainingBackup;
}

export function mergeSessions(current: TrainingSession[], incoming: TrainingSession[]): TrainingSession[] {
  const byId = new Map(current.map((session) => [session.id, session]));
  for (const session of incoming) byId.set(session.id, session);
  return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt);
}
