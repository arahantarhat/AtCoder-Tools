export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatClock(epochSecond: number): string {
  return new Date(epochSecond * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(epochSecond: number): string {
  return new Date(epochSecond * 1000).toLocaleDateString();
}

export function formatShortDate(epochSecond: number): string {
  return new Date(epochSecond * 1000).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}

export function getDateTicks(minEpoch: number, maxEpoch: number, count: number): number[] {
  if (minEpoch === maxEpoch) return [minEpoch];
  return Array.from({ length: count }, (_, index) => Math.round(minEpoch + ((maxEpoch - minEpoch) * index) / (count - 1)));
}
