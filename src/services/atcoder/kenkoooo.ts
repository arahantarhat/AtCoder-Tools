export const KENKOOOO_API_BASE = "https://kenkoooo.com/atcoder";

export async function fetchJson<T>(url: string, errorPrefix = "Kenkoooo request failed"): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${errorPrefix}: ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}
