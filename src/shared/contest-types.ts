export const CONTEST_TYPES = ["ABC", "ARC", "AGC", "AHC", "JOI", "Typical", "Other"] as const;

export type ContestType = (typeof CONTEST_TYPES)[number];
