export interface ChartViewport {
  zoom: number;
  pan: number;
}

export interface ChartDragState {
  startX: number;
  startPan: number;
}

export function updateChartZoom(viewport: ChartViewport, direction: string | undefined): ChartViewport {
  if (direction === "in") return { zoom: Math.min(8, viewport.zoom * 2), pan: clampPan(viewport.pan) };
  if (direction === "out") return { zoom: Math.max(1, viewport.zoom / 2), pan: clampPan(viewport.pan) };
  if (direction === "reset") return { zoom: 1, pan: 1 };
  return { zoom: viewport.zoom, pan: clampPan(viewport.pan) };
}

export function updateChartPan(
  viewport: ChartViewport,
  drag: ChartDragState,
  currentX: number,
  chartWidth: number
): ChartViewport {
  const width = chartWidth || 1;
  const visibleFraction = 1 / viewport.zoom;
  const deltaFraction = (currentX - drag.startX) / width;
  const nextPan = drag.startPan - deltaFraction / Math.max(0.01, 1 - visibleFraction);
  return { zoom: viewport.zoom, pan: clampPan(nextPan) };
}

function clampPan(value: number): number {
  return Math.min(1, Math.max(0, value));
}
