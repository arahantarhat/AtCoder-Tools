import { createCanvas } from "@napi-rs/canvas";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  type ChartConfiguration,
  type Plugin
} from "chart.js";

export interface LineSeries {
  label: string;
  color: string;
  points: Array<{ x: number; y: number; label?: string | undefined }>;
}

export interface BarSeries {
  label: string;
  color: string;
  values: number[];
}

interface LineChartOptions {
  ratingBands?: boolean;
}

const WIDTH = 900;
const HEIGHT = 520;
const PAGE = "#f2f2fb";
const TEXT = "#242733";
const MUTED = "#586174";
const GRID = "rgba(255,255,255,0.78)";
const AXIS = "#a7adc2";
const FONT = "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif";
const ATCODER_BANDS = [
  { min: 0, max: 399, color: "#d9d9d9" },
  { min: 400, max: 799, color: "#d8b48d" },
  { min: 800, max: 1199, color: "#94ee94" },
  { min: 1200, max: 1599, color: "#94dedb" },
  { min: 1600, max: 1999, color: "#adaff0" },
  { min: 2000, max: 2399, color: "#f3e684" },
  { min: 2400, max: 2799, color: "#f4ba82" },
  { min: 2800, max: 4000, color: "#f19696" }
];

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip
);
Chart.defaults.font.family = FONT;
Chart.defaults.color = TEXT;
Chart.defaults.animation = false;
Chart.defaults.responsive = false;

export async function renderLineChart(
  title: string,
  series: LineSeries[],
  xLabels: string[],
  options: LineChartOptions = {}
): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  const allPoints = series.flatMap((entry) => entry.points);
  const rawMinY = Math.min(...allPoints.map((point) => point.y));
  const rawMaxY = Math.max(...allPoints.map((point) => point.y));
  const minY = options.ratingBands ? Math.max(0, Math.floor((rawMinY - 100) / 100) * 100) : Math.max(0, Math.floor(rawMinY * 0.9));
  const maxY = options.ratingBands
    ? Math.min(4000, Math.max(400, Math.ceil((rawMaxY + 100) / 100) * 100))
    : Math.max(1, Math.ceil(rawMaxY * 1.1));
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const labelTicks = pickLabelTicks(xLabels, 5).map((tick) => ({
    ...tick,
    value: minX + (tick.index / Math.max(1, xLabels.length - 1)) * (maxX - minX)
  }));

  const config: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      datasets: series.map((entry) => ({
        label: entry.label,
        data: entry.points.map((point) => ({ x: point.x, y: point.y })),
        borderColor: entry.color,
        backgroundColor: entry.color,
        borderWidth: 2.6,
        pointRadius: 4,
        pointHoverRadius: 5,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: entry.color,
        pointBorderWidth: 2,
        tension: 0.08
      }))
    },
    options: {
      devicePixelRatio: 2,
      layout: { padding: { left: 8, right: 16, top: 12, bottom: 8 } },
      plugins: {
        legend: legendOptions(),
        title: titleOptions(title),
        tooltip: { enabled: false }
      },
      scales: {
        x: {
          type: "linear",
          min: minX,
          max: maxX,
          border: { color: AXIS },
          grid: { color: "rgba(255,255,255,0.26)" },
          ticks: {
            color: TEXT,
            callback: (value) => labelTicks.find((tick) => Math.abs(tick.value - Number(value)) < 1e-6)?.label ?? ""
          },
          afterBuildTicks: (scale) => {
            scale.ticks = labelTicks.map((tick) => ({ value: tick.value }));
          }
        },
        y: {
          min: minY,
          max: maxY,
          border: { color: AXIS },
          grid: { color: GRID },
          ticks: {
            color: TEXT,
            precision: 0,
            stepSize: options.ratingBands ? ratingStep(minY, maxY) : undefined
          }
        }
      }
    },
    plugins: [pageBackgroundPlugin(), ...(options.ratingBands ? [atcoderBandsPlugin()] : [plotBackgroundPlugin()])]
  };
  const chart = new Chart(context as never, config);
  const buffer = canvas.toBuffer("image/png");
  chart.destroy();
  return buffer;
}

export function renderBarChart(title: string, labels: string[], values: number[], color = "#2563eb"): Promise<Buffer> {
  return renderStackedBarChart(title, labels, [{ label: title, color, values }], false);
}

export async function renderHistogramChart(title: string, labels: string[], values: number[], colors: string[]): Promise<Buffer> {
  return renderBarLikeChart(title, labels, [{
    label: title,
    data: values,
    backgroundColor: colors,
    borderColor: "rgba(255,255,255,0.75)",
    borderWidth: 1
  }], false, false);
}

export async function renderStackedBarChart(title: string, labels: string[], series: BarSeries[], showLegend = true): Promise<Buffer> {
  return renderBarLikeChart(
    title,
    labels,
    series.map((entry) => ({
      label: entry.label,
      data: entry.values,
      backgroundColor: entry.color,
      borderColor: "rgba(255,255,255,0.75)",
      borderWidth: 1
    })),
    showLegend,
    true
  );
}

async function renderBarLikeChart(
  title: string,
  labels: string[],
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string | string[];
    borderColor: string;
    borderWidth: number;
  }>,
  showLegend: boolean,
  stacked: boolean
): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const context = canvas.getContext("2d");
  const config: ChartConfiguration<"bar"> = {
    type: "bar",
    data: {
      labels,
      datasets
    },
    options: {
      devicePixelRatio: 2,
      layout: { padding: { left: 8, right: 16, top: 12, bottom: 8 } },
      plugins: {
        legend: showLegend ? legendOptions() : { display: false },
        title: titleOptions(title),
        tooltip: { enabled: false }
      },
      scales: {
        x: {
          stacked,
          border: { color: AXIS },
          grid: { color: "rgba(255,255,255,0.32)" },
          ticks: {
            color: TEXT,
            autoSkip: labels.length > 16,
            maxRotation: 45,
            minRotation: labels.length > 12 ? 45 : 0
          }
        },
        y: {
          stacked,
          beginAtZero: true,
          border: { color: AXIS },
          grid: { color: GRID },
          ticks: { color: TEXT, precision: 0 }
        }
      }
    },
    plugins: [pageBackgroundPlugin(), plotBackgroundPlugin()]
  };
  const chart = new Chart(context as never, config);
  const buffer = canvas.toBuffer("image/png");
  chart.destroy();
  return buffer;
}

function titleOptions(title: string) {
  return {
    display: true,
    text: title,
    align: "start" as const,
    color: TEXT,
    font: { size: 22, weight: "bold" as const },
    padding: { bottom: 28 }
  };
}

function legendOptions() {
  return {
    display: true,
    position: "bottom" as const,
    align: "start" as const,
    labels: {
      boxWidth: 13,
      boxHeight: 13,
      color: MUTED,
      font: { size: 15, weight: "bold" as const },
      padding: 26,
      usePointStyle: false
    }
  };
}

function pageBackgroundPlugin(): Plugin {
  return {
    id: "discordGraphPageBackground",
    beforeDraw(chart) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.fillStyle = PAGE;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  };
}

function plotBackgroundPlugin(): Plugin {
  return {
    id: "discordGraphPlotBackground",
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
      ctx.restore();
    }
  };
}

function atcoderBandsPlugin(): Plugin {
  return {
    id: "discordGraphAtCoderBands",
    beforeDatasetsDraw(chart) {
      const yScale = chart.scales.y;
      if (!yScale) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      for (const band of ATCODER_BANDS) {
        const topValue = Math.min(yScale.max, band.max);
        const bottomValue = Math.max(yScale.min, band.min);
        if (topValue <= bottomValue) continue;
        const top = yScale.getPixelForValue(topValue);
        const bottom = yScale.getPixelForValue(bottomValue);
        ctx.fillStyle = band.color;
        ctx.fillRect(chartArea.left, top, chartArea.width, bottom - top);
      }
      ctx.restore();
    }
  };
}

function ratingStep(min: number, max: number): number {
  const span = max - min;
  if (span <= 1000) return 250;
  if (span <= 1800) return 400;
  return 500;
}

function pickLabelTicks(labels: string[], count: number): Array<{ label: string; index: number }> {
  if (labels.length <= count) return labels.map((label, index) => ({ label, index }));
  const last = labels.length - 1;
  return Array.from({ length: count }, (_, index) => {
    const labelIndex = Math.round((index / (count - 1)) * last);
    return { label: labels[labelIndex] ?? "", index: labelIndex };
  });
}
