import { CONTEST_TYPES, type ContestType, type ProblemRow, type Stats } from "../../types";
import { getDifficultyBand } from "../../shared/difficulty";

export function computeStats(filteredRows: ProblemRow[], unrated: number): Stats {
  const total = filteredRows.length;
  const solved = filteredRows.filter((row) => row.solved).length;
  const bands = new Map<string, { total: number; solved: number }>();
  const types = new Map<ContestType, { total: number; solved: number }>();
  for (const row of filteredRows) {
    if (row.difficulty !== null) {
      const band = getDifficultyBand(row.difficulty);
      const stat = bands.get(band) ?? { total: 0, solved: 0 };
      stat.total += 1;
      if (row.solved) stat.solved += 1;
      bands.set(band, stat);
    }
    const typeStat = types.get(row.contestType) ?? { total: 0, solved: 0 };
    typeStat.total += 1;
    if (row.solved) typeStat.solved += 1;
    types.set(row.contestType, typeStat);
  }
  return {
    total,
    solved,
    unsolved: total - solved,
    unrated,
    completionRate: total === 0 ? 0 : solved / total,
    byBand: [...bands.entries()]
      .sort(([a], [b]) => Number(a.split("-")[0]) - Number(b.split("-")[0]))
      .map(([band, stat]) => ({ band, ...stat })),
    byType: CONTEST_TYPES.map((type) => ({ type, ...(types.get(type) ?? { total: 0, solved: 0 }) }))
      .filter((stat) => stat.total > 0)
  };
}
