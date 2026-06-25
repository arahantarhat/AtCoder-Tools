export function getDifficultyBand(difficulty: number): string {
  const lower = Math.floor(difficulty / 100) * 100;
  return `${lower}-${lower + 99}`;
}

export function getDifficultyColor(difficulty: number): string {
  if (difficulty < 400) return "#808080";
  if (difficulty < 800) return "#804000";
  if (difficulty < 1200) return "#008000";
  if (difficulty < 1600) return "#00C0C0";
  if (difficulty < 2000) return "#0000FF";
  if (difficulty < 2400) return "#C0C000";
  if (difficulty < 2800) return "#FF8000";
  if (difficulty < 3200) return "#FF0000";
  if (difficulty < 3600) return "#965C2C";
  if (difficulty < 4000) return "#808080";
  return "#FFD700";
}

export function getDifficultyColorName(difficulty: number): string {
  if (difficulty < 400) return "Gray";
  if (difficulty < 800) return "Brown";
  if (difficulty < 1200) return "Green";
  if (difficulty < 1600) return "Cyan";
  if (difficulty < 2000) return "Blue";
  if (difficulty < 2400) return "Yellow";
  if (difficulty < 2800) return "Orange";
  if (difficulty < 3200) return "Red";
  if (difficulty < 3600) return "Bronze";
  if (difficulty < 4000) return "Silver";
  return "Gold";
}
