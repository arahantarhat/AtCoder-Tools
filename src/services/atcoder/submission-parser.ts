import type { Submission } from "../../types";

export function parseAtCoderSubmissions(html: string, username: string, fallbackContestId: string): Submission[] {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  const submissions: Submission[] = [];
  for (const row of rows) {
    const id = Number(row.match(/\/submissions\/(\d+)/)?.[1]);
    const problemId = row.match(/\/tasks\/([^"?#]+)/)?.[1];
    const contestId = row.match(/\/contests\/([^/]+)\/submissions\//)?.[1] ?? fallbackContestId;
    const timeText = decodeHtml(row.match(/<time[^>]*>([^<]+)<\/time>/)?.[1] ?? "");
    const cells = row.match(/<td[\s\S]*?<\/td>/g) ?? [];
    const result = extractSubmissionResult(cells[6] ?? row);
    const epochSecond = Math.floor(Date.parse(timeText.replace(" ", "T")) / 1000);
    if (!Number.isFinite(id) || !problemId || !result || !Number.isFinite(epochSecond)) continue;
    submissions.push({
      id,
      epoch_second: epochSecond,
      problem_id: problemId,
      contest_id: contestId,
      user_id: username,
      result
    });
  }
  return submissions;
}

function extractSubmissionResult(html: string): string | undefined {
  const text = decodeHtml(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return ["AC", "WA", "TLE", "MLE", "RE", "CE", "OLE", "IE", "WJ", "Judging"]
    .find((status) => new RegExp(`(^|\\s)${status}(\\s|$)`).test(text));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
