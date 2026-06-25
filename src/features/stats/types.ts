import type { ContestType } from "../../shared/contest-types";

export interface BandStat {
  band: string;
  total: number;
  solved: number;
}

export interface TypeStat {
  type: ContestType;
  total: number;
  solved: number;
}

export interface Stats {
  total: number;
  solved: number;
  unsolved: number;
  unrated: number;
  completionRate: number;
  byBand: BandStat[];
  byType: TypeStat[];
}
