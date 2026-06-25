export const TRAINING_MODES = {
  "ladder-2h": { durationSeconds: 2 * 60 * 60, offsets: [-400, -200, -100, 100], label: "2h Ladder", clamp: 150 },
  "consistency-1h": { durationSeconds: 60 * 60, offsets: [-100, 0, 100], label: "1h Consistency", clamp: 120 }
} as const;

export type TrainingMode = keyof typeof TRAINING_MODES;
