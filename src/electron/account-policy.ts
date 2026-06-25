export function hasStoredTrainingForUser(data: Record<string, unknown>, username: string): boolean {
  return Object.entries(data).some(([key, value]) =>
    key.startsWith(`atcoder-problemset:training:${username}:`) &&
    value !== null &&
    (!Array.isArray(value) || value.length > 0)
  );
}

export function isValidAtCoderUsername(username: string): boolean {
  return /^[A-Za-z0-9_]{1,32}$/.test(username);
}
