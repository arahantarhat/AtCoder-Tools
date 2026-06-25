import type { Stats } from "../../types";

export function renderStats(currentStats: Stats): string {
  return `<div class="acps-stats-grid">
    <section class="acps-table-box"><div class="acps-box-title">Filtered Progress</div>
      <div class="acps-metrics">
        <div><strong>${currentStats.solved}</strong><span>Solved</span></div>
        <div><strong>${currentStats.total}</strong><span>Total rated</span></div>
        <div><strong>${Math.round(currentStats.completionRate * 100)}%</strong><span>Complete</span></div>
        <div><strong>${currentStats.unrated}</strong><span>Unrated excluded</span></div>
      </div>
    </section>
    <section class="acps-table-box"><div class="acps-box-title">By Difficulty</div>${renderBandStats(currentStats)}</section>
    <section class="acps-table-box"><div class="acps-box-title">By Contest Type</div>${renderTypeStats(currentStats)}</section>
  </div>`;
}

function renderBandStats(stats: Stats): string {
  if (stats.byBand.length === 0) return `<p class="acps-empty">No rated problems match these filters.</p>`;
  return stats.byBand.map((band) => renderStatRow(band.band, band.solved, band.total)).join("");
}

function renderTypeStats(stats: Stats): string {
  if (stats.byType.length === 0) return `<p class="acps-empty">No contest types match these filters.</p>`;
  return stats.byType.map((type) => renderStatRow(type.type, type.solved, type.total)).join("");
}

function renderStatRow(label: string, solved: number, total: number): string {
  const percent = total === 0 ? 0 : Math.round((solved / total) * 100);
  return `<div class="acps-stat-row"><span>${label}</span><div class="acps-bar"><span style="width:${percent}%"></span></div><b>${solved}/${total}</b></div>`;
}
