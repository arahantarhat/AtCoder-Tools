export function getUtcMonthKey(epochSecond: number): string {
  const date = new Date(epochSecond * 1000);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

export function parseDateToEpochSecond(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? Math.floor(time / 1000) : undefined;
}

export function formatDate(epochSecond: number): string {
  return new Date(epochSecond * 1000).toISOString().slice(0, 10);
}
