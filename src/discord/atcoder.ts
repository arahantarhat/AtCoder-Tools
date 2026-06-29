import { parseAtCoderSubmissions } from "../services/atcoder/submission-parser";
import { AtCoderDataService, type CacheStore } from "../services/atcoder/data-service";
import { fetchJson } from "../services/atcoder/kenkoooo";
import type { AtCoderDataset, OfficialRatingPoint, Submission } from "../types";

export class DiscordAtCoderService {
  private readonly dataService: AtCoderDataService;

  constructor(cache: CacheStore, private readonly fetchImpl: typeof fetch = fetch) {
    this.dataService = new AtCoderDataService(cache, fetchJson);
  }

  getDataset(username: string): Promise<AtCoderDataset> {
    return this.dataService.getDataset(username);
  }

  async getInitialRating(username: string): Promise<number> {
    const history = await this.dataService.getRatingHistory(username).catch((): OfficialRatingPoint[] => []);
    return Math.max(400, history.at(-1)?.rating ?? 400);
  }

  async getInitialDuelRating(username: string): Promise<number> {
    const history = await this.dataService.getRatingHistory(username).catch((): OfficialRatingPoint[] => []);
    return history.at(-1)?.rating ?? 1200;
  }

  getRatingHistory(username: string): Promise<OfficialRatingPoint[]> {
    return this.dataService.getRatingHistory(username);
  }

  async hasProfileVerificationCode(username: string, code: string): Promise<boolean> {
    if (!code) return false;
    const response = await this.fetchImpl(`https://atcoder.jp/users/${encodeURIComponent(username)}`);
    if (!response.ok) return false;
    const html = await response.text();
    if (html.includes("404 Not Found - AtCoder")) return false;
    return profileAffiliationHasVerificationCode(html, code);
  }

  async hasAcceptedSubmission(username: string, contestId: string, problemId: string, fromSecond: number): Promise<boolean> {
    return this.hasSubmissionResult(username, contestId, problemId, "AC", fromSecond);
  }

  async hasSubmissionResult(username: string, contestId: string, problemId: string, result: string, fromSecond: number): Promise<boolean> {
    const direct = await this.fetchContestSubmissions(username, contestId, result).catch((): Submission[] | null => null);
    if (direct?.some((submission) => isResultAfter(submission, problemId, result, fromSecond))) return true;
    const fallback = await this.dataService.getRecentSubmissions(username, fromSecond, [{ contestId, problemId }]).catch((): Submission[] => []);
    return fallback.some((submission) => isResultAfter(submission, problemId, result, fromSecond));
  }

  async getProblemSubmissions(username: string, contestId: string, problemId: string, fromSecond: number): Promise<Submission[]> {
    const direct = await this.fetchContestSubmissions(username, contestId, "").catch((): Submission[] | null => null);
    const fallback = await this.dataService.getRecentSubmissions(username, fromSecond, [{ contestId, problemId }]).catch((): Submission[] => []);
    return uniqueSubmissions([...(direct ?? []), ...fallback])
      .filter((submission) => submission.problem_id === problemId && submission.epoch_second >= fromSecond)
      .sort((a, b) => a.epoch_second - b.epoch_second || a.id - b.id);
  }

  private async fetchContestSubmissions(username: string, contestId: string, result: string): Promise<Submission[]> {
    const url = `https://atcoder.jp/contests/${encodeURIComponent(contestId)}/submissions?f.User=${encodeURIComponent(username)}&f.Task=&f.LanguageName=&f.Status=${encodeURIComponent(result)}`;
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`AtCoder submissions request failed: ${response.status} ${response.statusText}`);
    return parseAtCoderSubmissions(await response.text(), username, contestId);
  }
}

function isResultAfter(submission: Submission, problemId: string, result: string, fromSecond: number): boolean {
  return submission.problem_id === problemId && submission.result === result && submission.epoch_second >= fromSecond;
}

function uniqueSubmissions(submissions: Submission[]): Submission[] {
  const byId = new Map<number, Submission>();
  for (const submission of submissions) byId.set(submission.id, submission);
  return [...byId.values()];
}

export function profileAffiliationHasVerificationCode(html: string, code: string): boolean {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const cells = row.match(/<(?:th|td)[^>]*>[\s\S]*?<\/(?:th|td)>/g) ?? [];
    if (cells.length < 2) continue;
    const [labelCell, valueCell] = cells;
    if (!labelCell || !valueCell) continue;
    const label = decodeHtml(labelCell.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    if (label !== "Affiliation") continue;
    const value = decodeHtml(valueCell.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    return value.includes(code);
  }
  return false;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#43;/g, "+");
}
