import type { ProgressMode } from "../../types";

export interface ChartViewport {
  zoom: number;
  pan: number;
}

export class ProgressController {
  mode: ProgressMode = "all";
  viewport: ChartViewport = { zoom: 1, pan: 1 };

  setMode(mode: ProgressMode): void {
    this.mode = mode;
  }

  zoom(direction: "in" | "out" | "reset"): void {
    if (direction === "in") this.viewport.zoom = Math.min(8, this.viewport.zoom * 2);
    if (direction === "out") this.viewport.zoom = Math.max(1, this.viewport.zoom / 2);
    if (direction === "reset") this.viewport = { zoom: 1, pan: 1 };
    this.viewport.pan = Math.min(1, Math.max(0, this.viewport.pan));
  }
}
