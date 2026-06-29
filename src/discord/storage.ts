import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from "node:sqlite";
import type { CacheStore } from "../services/atcoder/data-service";
import type {
  AssignmentMode,
  AssignmentStatus,
  BotAssignment,
  Duel,
  DuelProfile,
  LeaderboardEntry,
  LeaderboardTrendPoint,
  LinkedUser,
  MonthlyPoints,
  PendingLinkChallenge,
  ScoreReason,
  ReviewQueueItem,
  ReviewReason,
  TrainingRatingPoint
} from "./types";
import { calculateDuelElo, type DuelCompletion } from "./duels";

type Row = Record<string, unknown>;
const require = createRequire(`${process.cwd()}/package.json`);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

export class DiscordBotStore implements CacheStore {
  private readonly db: DatabaseSyncType;

  constructor(path = defaultDataPath()) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  async get<T>(key: string): Promise<T | undefined> {
    const row = this.db.prepare("SELECT data FROM cached_json WHERE cache_key = ?").get(key) as Row | undefined;
    return typeof row?.data === "string" ? JSON.parse(row.data) as T : undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.db.prepare(`
      INSERT INTO cached_json (cache_key, fetched_at, data)
      VALUES (?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data
    `).run(key, Date.now(), JSON.stringify(value));
  }

  async clearMatching(predicate: (key: string) => boolean): Promise<void> {
    const rows = this.db.prepare("SELECT cache_key FROM cached_json").all() as Row[];
    const deleteStatement = this.db.prepare("DELETE FROM cached_json WHERE cache_key = ?");
    for (const row of rows) {
      const key = String(row.cache_key);
      if (predicate(key)) deleteStatement.run(key);
    }
  }

  linkUser(guildId: string, discordUserId: string, atcoderUsername: string, initialRating: number, now: number): LinkedUser {
    const existing = this.getLinkedUser(guildId, discordUserId);
    const rating = existing?.trainingRating ?? initialRating;
    this.db.prepare(`
      INSERT INTO linked_users (guild_id, discord_user_id, atcoder_username, training_rating, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
        atcoder_username = excluded.atcoder_username,
        updated_at = excluded.updated_at
    `).run(guildId, discordUserId, atcoderUsername, rating, existing?.createdAt ?? now, now);
    return this.getLinkedUserOrThrow(guildId, discordUserId);
  }

  getLinkedUser(guildId: string, discordUserId: string): LinkedUser | null {
    const row = this.db.prepare("SELECT * FROM linked_users WHERE guild_id = ? AND discord_user_id = ?").get(guildId, discordUserId) as Row | undefined;
    return row ? linkedUserFromRow(row) : null;
  }

  getLinkedUserOrThrow(guildId: string, discordUserId: string): LinkedUser {
    const user = this.getLinkedUser(guildId, discordUserId);
    if (!user) throw new Error("AtCoder handle is not linked. Use /link username:<handle> first.");
    return user;
  }

  savePendingLinkChallenge(input: {
    guildId: string;
    discordUserId: string;
    atcoderUsername: string;
    verificationCode: string;
    issuedAt: number;
    updatedAt: number;
  }): PendingLinkChallenge {
    this.db.prepare(`
      INSERT INTO pending_link_challenges (
        guild_id, discord_user_id, atcoder_username, problem_id, contest_id,
        title, verification_type, verification_code, issued_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
        atcoder_username = excluded.atcoder_username,
        problem_id = excluded.problem_id,
        contest_id = excluded.contest_id,
        title = excluded.title,
        verification_type = excluded.verification_type,
        verification_code = excluded.verification_code,
        issued_at = excluded.issued_at,
        updated_at = excluded.updated_at
    `).run(
      input.guildId,
      input.discordUserId,
      input.atcoderUsername,
      "",
      "",
      "",
      "profile_code",
      input.verificationCode,
      input.issuedAt,
      input.updatedAt
    );
    return this.getPendingLinkChallenge(input.guildId, input.discordUserId)!;
  }

  getPendingLinkChallenge(guildId: string, discordUserId: string): PendingLinkChallenge | null {
    const row = this.db.prepare("SELECT * FROM pending_link_challenges WHERE guild_id = ? AND discord_user_id = ?")
      .get(guildId, discordUserId) as Row | undefined;
    return row ? pendingLinkChallengeFromRow(row) : null;
  }

  clearPendingLinkChallenge(guildId: string, discordUserId: string): void {
    this.db.prepare("DELETE FROM pending_link_challenges WHERE guild_id = ? AND discord_user_id = ?")
      .run(guildId, discordUserId);
  }

  updateTrainingRating(guildId: string, discordUserId: string, rating: number, now: number): void {
    this.db.prepare("UPDATE linked_users SET training_rating = ?, updated_at = ? WHERE guild_id = ? AND discord_user_id = ?")
      .run(rating, now, guildId, discordUserId);
  }

  recordTrainingRating(guildId: string, discordUserId: string, rating: number, occurredAt: number): void {
    const dayKey = getUtcDayKey(occurredAt);
    this.db.prepare(`
      INSERT INTO training_rating_events (guild_id, discord_user_id, day_key, rating, occurred_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, discord_user_id, day_key) DO UPDATE SET
        rating = excluded.rating,
        occurred_at = excluded.occurred_at
      WHERE excluded.occurred_at >= training_rating_events.occurred_at
    `).run(guildId, discordUserId, dayKey, rating, occurredAt);
  }

  createAssignment(input: {
    guildId: string;
    discordUserId: string;
    atcoderUsername: string;
    mode: AssignmentMode;
    problemId: string;
    contestId: string;
    title: string;
    difficulty: number;
    targetDelta: number;
    points: number;
    assignedAt: number;
  }): BotAssignment {
    if (this.getActiveAssignment(input.guildId, input.discordUserId)) {
      throw new Error("You already have an active assignment. Use /train current first.");
    }
    const result = this.db.prepare(`
      INSERT INTO assignments (
        guild_id, discord_user_id, atcoder_username, mode, problem_id, contest_id,
        title, difficulty, target_delta, points, status, assigned_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      input.guildId,
      input.discordUserId,
      input.atcoderUsername,
      input.mode,
      input.problemId,
      input.contestId,
      input.title,
      input.difficulty,
      input.targetDelta,
      input.points,
      input.assignedAt
    );
    return this.getAssignment(Number(result.lastInsertRowid))!;
  }

  getAssignment(id: number): BotAssignment | null {
    const row = this.db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) as Row | undefined;
    return row ? assignmentFromRow(row) : null;
  }

  getActiveAssignment(guildId: string, discordUserId: string): BotAssignment | null {
    const row = this.db.prepare(`
      SELECT * FROM assignments
      WHERE guild_id = ? AND discord_user_id = ? AND status = 'active'
      ORDER BY assigned_at DESC
      LIMIT 1
    `).get(guildId, discordUserId) as Row | undefined;
    return row ? assignmentFromRow(row) : null;
  }

  getLatestAssignment(guildId: string, discordUserId: string): BotAssignment | null {
    const row = this.db.prepare(`
      SELECT * FROM assignments
      WHERE guild_id = ? AND discord_user_id = ?
      ORDER BY assigned_at DESC, id DESC
      LIMIT 1
    `).get(guildId, discordUserId) as Row | undefined;
    return row ? assignmentFromRow(row) : null;
  }

  listPendingVerification(limit = 50): BotAssignment[] {
    const rows = this.db.prepare(`
      SELECT * FROM assignments
      WHERE status IN ('pending_completed', 'pending_assisted')
      ORDER BY resolved_at ASC, assigned_at ASC, id ASC
      LIMIT ?
    `).all(limit) as Row[];
    return rows.map(assignmentFromRow);
  }

  listPendingVerificationForUser(guildId: string, discordUserId: string, limit = 10): BotAssignment[] {
    const rows = this.db.prepare(`
      SELECT * FROM assignments
      WHERE guild_id = ? AND discord_user_id = ? AND status IN ('pending_completed', 'pending_assisted')
      ORDER BY resolved_at ASC, assigned_at ASC, id ASC
      LIMIT ?
    `).all(guildId, discordUserId, limit) as Row[];
    return rows.map(assignmentFromRow);
  }

  countPendingVerification(guildId: string, discordUserId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM assignments
      WHERE guild_id = ? AND discord_user_id = ? AND status IN ('pending_completed', 'pending_assisted')
    `).get(guildId, discordUserId) as Row | undefined;
    return Number(row?.count ?? 0);
  }

  getUsedProblemIds(guildId: string, discordUserId: string): Set<string> {
    const rows = this.db.prepare("SELECT problem_id FROM assignments WHERE guild_id = ? AND discord_user_id = ?").all(guildId, discordUserId) as Row[];
    return new Set(rows.map((row) => String(row.problem_id)));
  }

  resolveAssignment(assignment: BotAssignment, status: Exclude<AssignmentStatus, "active">, resolvedAt: number): void {
    this.db.prepare("UPDATE assignments SET status = ?, resolved_at = ? WHERE id = ? AND status = 'active'")
      .run(status, resolvedAt, assignment.id);
  }

  completePendingVerification(assignment: BotAssignment, status: "completed" | "assisted"): boolean {
    const result = this.db.prepare(`
      UPDATE assignments
      SET status = ?
      WHERE id = ? AND status = ?
    `).run(status, assignment.id, assignment.status);
    return result.changes > 0;
  }

  addScoreEvent(input: {
    guildId: string;
    discordUserId: string;
    assignmentId: number;
    points: number;
    reason: ScoreReason;
    occurredAt: number;
    monthKey: string;
  }): void {
    this.db.prepare(`
      INSERT INTO score_events (guild_id, discord_user_id, assignment_id, points, reason, occurred_at, month_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.guildId, input.discordUserId, input.assignmentId, input.points, input.reason, input.occurredAt, input.monthKey);
  }

  getPoints(guildId: string, discordUserId: string, monthKey?: string): number {
    const params: SQLInputValue[] = [guildId, discordUserId];
    const monthClause = monthKey ? " AND month_key = ?" : "";
    if (monthKey) params.push(monthKey);
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(points), 0) AS points
      FROM score_events
      WHERE guild_id = ? AND discord_user_id = ?${monthClause}
    `).get(...params) as Row | undefined;
    return Number(row?.points ?? 0);
  }

  getLeaderboard(guildId: string, monthKey?: string, limit = 10): LeaderboardEntry[] {
    const params: SQLInputValue[] = [guildId];
    const monthClause = monthKey ? " AND s.month_key = ?" : "";
    if (monthKey) params.push(monthKey);
    params.push(limit);
    const rows = this.db.prepare(`
      SELECT s.discord_user_id, u.atcoder_username, SUM(s.points) AS points
      FROM score_events s
      LEFT JOIN linked_users u ON u.guild_id = s.guild_id AND u.discord_user_id = s.discord_user_id
      WHERE s.guild_id = ?${monthClause}
      GROUP BY s.discord_user_id, u.atcoder_username
      HAVING points > 0
      ORDER BY points DESC, s.discord_user_id ASC
      LIMIT ?
    `).all(...params) as Row[];
    return rows.map((row) => ({
      discordUserId: String(row.discord_user_id),
      atcoderUsername: typeof row.atcoder_username === "string" ? row.atcoder_username : undefined,
      points: Number(row.points)
    }));
  }

  listAssignmentsForGraph(guildId: string, discordUserId: string, since: number): BotAssignment[] {
    const rows = this.db.prepare(`
      SELECT * FROM assignments
      WHERE guild_id = ? AND discord_user_id = ? AND assigned_at >= ?
      ORDER BY assigned_at ASC, id ASC
    `).all(guildId, discordUserId, since) as Row[];
    return rows.map(assignmentFromRow);
  }

  getMonthlyPointsSince(guildId: string, discordUserId: string, since: number): MonthlyPoints[] {
    const rows = this.db.prepare(`
      SELECT month_key, SUM(points) AS points
      FROM score_events
      WHERE guild_id = ? AND discord_user_id = ? AND occurred_at >= ?
      GROUP BY month_key
      ORDER BY month_key ASC
    `).all(guildId, discordUserId, since) as Row[];
    return rows.map((row) => ({
      monthKey: String(row.month_key),
      points: Number(row.points)
    }));
  }

  getTopLeaderboardUsersSince(guildId: string, since: number, limit = 5): LeaderboardEntry[] {
    const rows = this.db.prepare(`
      SELECT s.discord_user_id, u.atcoder_username, SUM(s.points) AS points
      FROM score_events s
      LEFT JOIN linked_users u ON u.guild_id = s.guild_id AND u.discord_user_id = s.discord_user_id
      WHERE s.guild_id = ? AND s.occurred_at >= ?
      GROUP BY s.discord_user_id, u.atcoder_username
      HAVING points > 0
      ORDER BY points DESC, s.discord_user_id ASC
      LIMIT ?
    `).all(guildId, since, limit) as Row[];
    return rows.map((row) => ({
      discordUserId: String(row.discord_user_id),
      atcoderUsername: typeof row.atcoder_username === "string" ? row.atcoder_username : undefined,
      points: Number(row.points)
    }));
  }

  getLeaderboardTrendSince(guildId: string, discordUserIds: string[], since: number): LeaderboardTrendPoint[] {
    if (discordUserIds.length === 0) return [];
    const placeholders = discordUserIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`
      SELECT s.discord_user_id, u.atcoder_username, s.month_key, SUM(s.points) AS points
      FROM score_events s
      LEFT JOIN linked_users u ON u.guild_id = s.guild_id AND u.discord_user_id = s.discord_user_id
      WHERE s.guild_id = ? AND s.occurred_at >= ? AND s.discord_user_id IN (${placeholders})
      GROUP BY s.discord_user_id, u.atcoder_username, s.month_key
      ORDER BY s.month_key ASC, s.discord_user_id ASC
    `).all(guildId, since, ...discordUserIds) as Row[];
    return rows.map((row) => ({
      discordUserId: String(row.discord_user_id),
      atcoderUsername: typeof row.atcoder_username === "string" ? row.atcoder_username : undefined,
      monthKey: String(row.month_key),
      points: Number(row.points)
    }));
  }

  getTrainingRatingHistorySince(guildId: string, discordUserId: string, since: number): TrainingRatingPoint[] {
    const rows = this.db.prepare(`
      SELECT day_key, rating, occurred_at
      FROM training_rating_events
      WHERE guild_id = ? AND discord_user_id = ? AND occurred_at >= ?
      ORDER BY occurred_at ASC, day_key ASC
    `).all(guildId, discordUserId, since) as Row[];
    return rows.map((row) => ({
      dayKey: String(row.day_key),
      epochSecond: Number(row.occurred_at),
      rating: Number(row.rating)
    }));
  }

  enqueueReview(input: {
    guildId: string;
    discordUserId: string;
    problemId: string;
    contestId: string;
    title: string;
    difficulty: number;
    reason: ReviewReason;
    availableAfter: number;
    createdAt: number;
  }): void {
    this.db.prepare(`
      INSERT INTO review_queue (
        guild_id, discord_user_id, problem_id, contest_id, title, difficulty,
        reason, available_after, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.guildId,
      input.discordUserId,
      input.problemId,
      input.contestId,
      input.title,
      input.difficulty,
      input.reason,
      input.availableAfter,
      input.createdAt
    );
  }

  listReviewQueue(guildId: string, discordUserId: string, now?: number): ReviewQueueItem[] {
    const params: SQLInputValue[] = [guildId, discordUserId];
    const dueClause = now === undefined ? "" : " AND available_after <= ?";
    if (now !== undefined) params.push(now);
    const rows = this.db.prepare(`
      SELECT * FROM review_queue
      WHERE guild_id = ? AND discord_user_id = ? AND consumed_at IS NULL${dueClause}
      ORDER BY available_after ASC
      LIMIT 10
    `).all(...params) as Row[];
    return rows.map(reviewItemFromRow);
  }

  countQueued(guildId: string, discordUserId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM review_queue
      WHERE guild_id = ? AND discord_user_id = ? AND consumed_at IS NULL
    `).get(guildId, discordUserId) as Row | undefined;
    return Number(row?.count ?? 0);
  }

  consumeReviewItem(id: number, now: number): void {
    this.db.prepare("UPDATE review_queue SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").run(now, id);
  }

  getDuelProfile(guildId: string, discordUserId: string): DuelProfile | null {
    const row = this.db.prepare("SELECT * FROM duel_profiles WHERE guild_id = ? AND discord_user_id = ?")
      .get(guildId, discordUserId) as Row | undefined;
    return row ? duelProfileFromRow(row) : null;
  }

  upsertDuelProfile(input: {
    guildId: string;
    discordUserId: string;
    atcoderUsername: string;
    initialRating: number;
    now: number;
  }): DuelProfile {
    const existing = this.getDuelProfile(input.guildId, input.discordUserId);
    const rating = existing?.duelRating ?? input.initialRating;
    this.db.prepare(`
      INSERT INTO duel_profiles (guild_id, discord_user_id, atcoder_username, duel_rating, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
        atcoder_username = excluded.atcoder_username,
        updated_at = excluded.updated_at
    `).run(
      input.guildId,
      input.discordUserId,
      input.atcoderUsername,
      rating,
      existing?.createdAt ?? input.now,
      input.now
    );
    return this.getDuelProfile(input.guildId, input.discordUserId)!;
  }

  createPendingDuel(input: {
    guildId: string;
    challengerUserId: string;
    targetUserId: string;
    challengedAt: number;
    expiresAt: number;
  }): Duel {
    const result = this.db.prepare(`
      INSERT INTO duels (guild_id, challenger_user_id, target_user_id, status, challenged_at, expires_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(input.guildId, input.challengerUserId, input.targetUserId, input.challengedAt, input.expiresAt);
    return this.getDuel(Number(result.lastInsertRowid))!;
  }

  getDuel(id: number): Duel | null {
    const row = this.db.prepare("SELECT * FROM duels WHERE id = ?").get(id) as Row | undefined;
    return row ? duelFromRow(row) : null;
  }

  findDuplicatePendingDuel(guildId: string, firstUserId: string, secondUserId: string, now: number): Duel | null {
    const row = this.db.prepare(`
      SELECT * FROM duels
      WHERE guild_id = ?
        AND status = 'pending'
        AND expires_at > ?
        AND (
          (challenger_user_id = ? AND target_user_id = ?)
          OR (challenger_user_id = ? AND target_user_id = ?)
        )
      ORDER BY challenged_at ASC, id ASC
      LIMIT 1
    `).get(guildId, now, firstUserId, secondUserId, secondUserId, firstUserId) as Row | undefined;
    return row ? duelFromRow(row) : null;
  }

  getActiveDuelForUser(guildId: string, discordUserId: string): Duel | null {
    const row = this.db.prepare(`
      SELECT * FROM duels
      WHERE guild_id = ?
        AND status = 'active'
        AND (challenger_user_id = ? OR target_user_id = ?)
      ORDER BY accepted_at DESC, id DESC
      LIMIT 1
    `).get(guildId, discordUserId, discordUserId) as Row | undefined;
    return row ? duelFromRow(row) : null;
  }

  getActiveDuelConflict(guildId: string, firstUserId: string, secondUserId: string): Duel | null {
    const row = this.db.prepare(`
      SELECT * FROM duels
      WHERE guild_id = ?
        AND status = 'active'
        AND (
          challenger_user_id IN (?, ?)
          OR target_user_id IN (?, ?)
        )
      ORDER BY accepted_at DESC, id DESC
      LIMIT 1
    `).get(guildId, firstUserId, secondUserId, firstUserId, secondUserId) as Row | undefined;
    return row ? duelFromRow(row) : null;
  }

  listPendingDuelsForUser(guildId: string, discordUserId: string, now: number): { sent: Duel[]; received: Duel[] } {
    const rows = this.db.prepare(`
      SELECT * FROM duels
      WHERE guild_id = ?
        AND status = 'pending'
        AND expires_at > ?
        AND (challenger_user_id = ? OR target_user_id = ?)
      ORDER BY challenged_at ASC, id ASC
    `).all(guildId, now, discordUserId, discordUserId) as Row[];
    const duels = rows.map(duelFromRow);
    return {
      sent: duels.filter((duel) => duel.challengerUserId === discordUserId),
      received: duels.filter((duel) => duel.targetUserId === discordUserId)
    };
  }

  getOldestReceivedPendingDuel(guildId: string, discordUserId: string, now: number): Duel | null {
    const row = this.db.prepare(`
      SELECT * FROM duels
      WHERE guild_id = ?
        AND status = 'pending'
        AND target_user_id = ?
        AND expires_at > ?
      ORDER BY challenged_at ASC, id ASC
      LIMIT 1
    `).get(guildId, discordUserId, now) as Row | undefined;
    return row ? duelFromRow(row) : null;
  }

  expireStaleDuels(now: number): void {
    this.db.prepare("UPDATE duels SET status = 'expired', expired_at = ? WHERE status = 'pending' AND expires_at <= ?")
      .run(now, now);
  }

  acceptDuel(input: {
    duelId: number;
    challengerHandle: string;
    targetHandle: string;
    problemId: string;
    contestId: string;
    title: string;
    difficulty: number;
    challengerRating: number;
    targetRating: number;
    lowerRatedUserId: string;
    higherRatedUserId: string;
    handicapCoefficient: number;
    acceptedAt: number;
    expiresAt: number;
  }): Duel | null {
    const result = this.db.prepare(`
      UPDATE duels
      SET status = 'active',
        challenger_handle = ?,
        target_handle = ?,
        problem_id = ?,
        contest_id = ?,
        title = ?,
        difficulty = ?,
        accepted_at = ?,
        expires_at = ?,
        handicap_coefficient = ?,
        lower_rated_user_id = ?,
        higher_rated_user_id = ?,
        challenger_rating_before = ?,
        target_rating_before = ?
      WHERE id = ? AND status = 'pending'
    `).run(
      input.challengerHandle,
      input.targetHandle,
      input.problemId,
      input.contestId,
      input.title,
      input.difficulty,
      input.acceptedAt,
      input.expiresAt,
      input.handicapCoefficient,
      input.lowerRatedUserId,
      input.higherRatedUserId,
      input.challengerRating,
      input.targetRating,
      input.duelId
    );
    return result.changes > 0 ? this.getDuel(input.duelId) : null;
  }

  declineDuel(duelId: number, now: number): Duel | null {
    const result = this.db.prepare("UPDATE duels SET status = 'declined', declined_at = ? WHERE id = ? AND status = 'pending'")
      .run(now, duelId);
    return result.changes > 0 ? this.getDuel(duelId) : null;
  }

  completeDuel(input: {
    duel: Duel;
    completion: DuelCompletion;
    now: number;
  }): Duel | null {
    if (input.duel.challengerRatingBefore === undefined || input.duel.targetRatingBefore === undefined) {
      throw new Error("Duel rating snapshot is missing.");
    }
    const elo = calculateDuelElo(input.duel.challengerRatingBefore, input.duel.targetRatingBefore, input.completion.challengerScore);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.db.prepare(`
        UPDATE duels
        SET status = 'completed',
          completed_at = ?,
          result = ?,
          winner_user_id = ?,
          challenger_solved_at = ?,
          target_solved_at = ?,
          challenger_rating_after = ?,
          target_rating_after = ?,
          challenger_delta = ?,
          target_delta = ?
        WHERE id = ? AND status = 'active'
      `).run(
        input.now,
        input.completion.result,
        input.completion.winnerUserId ?? null,
        input.completion.challengerSolvedAt ?? null,
        input.completion.targetSolvedAt ?? null,
        elo.ratingAAfter,
        elo.ratingBAfter,
        elo.deltaA,
        elo.deltaB,
        input.duel.id
      );
      if (result.changes === 0) {
        this.db.exec("ROLLBACK");
        return this.getDuel(input.duel.id);
      }
      this.db.prepare("UPDATE duel_profiles SET duel_rating = ?, updated_at = ? WHERE guild_id = ? AND discord_user_id = ?")
        .run(elo.ratingAAfter, input.now, input.duel.guildId, input.duel.challengerUserId);
      this.db.prepare("UPDATE duel_profiles SET duel_rating = ?, updated_at = ? WHERE guild_id = ? AND discord_user_id = ?")
        .run(elo.ratingBAfter, input.now, input.duel.guildId, input.duel.targetUserId);
      this.db.exec("COMMIT");
      return this.getDuel(input.duel.id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  expireDuel(duelId: number, now: number): Duel | null {
    const result = this.db.prepare("UPDATE duels SET status = 'expired', expired_at = ?, result = 'expired' WHERE id = ? AND status IN ('pending', 'active')")
      .run(now, duelId);
    return result.changes > 0 ? this.getDuel(duelId) : this.getDuel(duelId);
  }

  listCompletedDuelsForUser(guildId: string, discordUserId: string, limit = 10): Duel[] {
    const rows = this.db.prepare(`
      SELECT * FROM duels
      WHERE guild_id = ?
        AND status = 'completed'
        AND (challenger_user_id = ? OR target_user_id = ?)
      ORDER BY completed_at DESC, id DESC
      LIMIT ?
    `).all(guildId, discordUserId, discordUserId, limit) as Row[];
    return rows.map(duelFromRow);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS linked_users (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        atcoder_username TEXT NOT NULL,
        training_rating INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        atcoder_username TEXT NOT NULL,
        mode TEXT NOT NULL,
        problem_id TEXT NOT NULL,
        contest_id TEXT NOT NULL,
        title TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        target_delta INTEGER NOT NULL,
        points INTEGER NOT NULL,
        status TEXT NOT NULL,
        assigned_at INTEGER NOT NULL,
        resolved_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS ix_assignments_active
      ON assignments (guild_id, discord_user_id, status);

      CREATE TABLE IF NOT EXISTS score_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        assignment_id INTEGER NOT NULL,
        points INTEGER NOT NULL,
        reason TEXT NOT NULL,
        occurred_at INTEGER NOT NULL,
        month_key TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS ix_score_events_leaderboard
      ON score_events (guild_id, month_key, discord_user_id);

      CREATE TABLE IF NOT EXISTS training_rating_events (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        day_key TEXT NOT NULL,
        rating INTEGER NOT NULL,
        occurred_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id, day_key)
      );

      CREATE INDEX IF NOT EXISTS ix_training_rating_events_history
      ON training_rating_events (guild_id, discord_user_id, occurred_at);

      CREATE TABLE IF NOT EXISTS duel_profiles (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        atcoder_username TEXT NOT NULL,
        duel_rating INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      );

      CREATE TABLE IF NOT EXISTS duels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        challenger_user_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        challenger_handle TEXT,
        target_handle TEXT,
        problem_id TEXT,
        contest_id TEXT,
        title TEXT,
        difficulty INTEGER,
        status TEXT NOT NULL,
        challenged_at INTEGER NOT NULL,
        accepted_at INTEGER,
        expires_at INTEGER,
        completed_at INTEGER,
        declined_at INTEGER,
        cancelled_at INTEGER,
        expired_at INTEGER,
        handicap_coefficient REAL,
        lower_rated_user_id TEXT,
        higher_rated_user_id TEXT,
        challenger_rating_before INTEGER,
        target_rating_before INTEGER,
        challenger_rating_after INTEGER,
        target_rating_after INTEGER,
        challenger_delta INTEGER,
        target_delta INTEGER,
        result TEXT,
        winner_user_id TEXT,
        challenger_solved_at INTEGER,
        target_solved_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS ix_duels_user_status
      ON duels (guild_id, status, challenger_user_id, target_user_id);

      CREATE INDEX IF NOT EXISTS ix_duels_history
      ON duels (guild_id, status, completed_at);

      CREATE TABLE IF NOT EXISTS pending_link_challenges (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        atcoder_username TEXT NOT NULL,
        problem_id TEXT NOT NULL,
        contest_id TEXT NOT NULL,
        title TEXT NOT NULL,
        verification_type TEXT NOT NULL DEFAULT 'profile_code',
        verification_code TEXT NOT NULL DEFAULT '',
        issued_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, discord_user_id)
      );

      CREATE TABLE IF NOT EXISTS review_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        problem_id TEXT NOT NULL,
        contest_id TEXT NOT NULL,
        title TEXT NOT NULL,
        difficulty INTEGER NOT NULL,
        reason TEXT NOT NULL,
        available_after INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        consumed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS ix_review_queue_due
      ON review_queue (guild_id, discord_user_id, consumed_at, available_after);

      CREATE TABLE IF NOT EXISTS cached_json (
        cache_key TEXT PRIMARY KEY,
        fetched_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);
    this.addColumnIfMissing("pending_link_challenges", "verification_type", "TEXT NOT NULL DEFAULT 'profile_code'");
    this.addColumnIfMissing("pending_link_challenges", "verification_code", "TEXT NOT NULL DEFAULT ''");
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Row[];
    if (rows.some((row) => row.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function defaultDataPath(): string {
  return process.env.DISCORD_DATA_PATH ?? "data/bot.sqlite";
}

function linkedUserFromRow(row: Row): LinkedUser {
  return {
    guildId: String(row.guild_id),
    discordUserId: String(row.discord_user_id),
    atcoderUsername: String(row.atcoder_username),
    trainingRating: Number(row.training_rating),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function pendingLinkChallengeFromRow(row: Row): PendingLinkChallenge {
  return {
    guildId: String(row.guild_id),
    discordUserId: String(row.discord_user_id),
    atcoderUsername: String(row.atcoder_username),
    verificationType: "profile_code",
    verificationCode: String(row.verification_code ?? ""),
    issuedAt: Number(row.issued_at),
    updatedAt: Number(row.updated_at)
  };
}

function assignmentFromRow(row: Row): BotAssignment {
  return {
    id: Number(row.id),
    guildId: String(row.guild_id),
    discordUserId: String(row.discord_user_id),
    atcoderUsername: String(row.atcoder_username),
    mode: String(row.mode) as AssignmentMode,
    problemId: String(row.problem_id),
    contestId: String(row.contest_id),
    title: String(row.title),
    difficulty: Number(row.difficulty),
    targetDelta: Number(row.target_delta),
    points: Number(row.points),
    status: String(row.status) as AssignmentStatus,
    assignedAt: Number(row.assigned_at),
    resolvedAt: row.resolved_at === null ? undefined : Number(row.resolved_at)
  };
}

function reviewItemFromRow(row: Row): ReviewQueueItem {
  return {
    id: Number(row.id),
    guildId: String(row.guild_id),
    discordUserId: String(row.discord_user_id),
    problemId: String(row.problem_id),
    contestId: String(row.contest_id),
    title: String(row.title),
    difficulty: Number(row.difficulty),
    reason: String(row.reason) as ReviewReason,
    availableAfter: Number(row.available_after),
    createdAt: Number(row.created_at),
    consumedAt: row.consumed_at === null ? undefined : Number(row.consumed_at)
  };
}

function duelProfileFromRow(row: Row): DuelProfile {
  return {
    guildId: String(row.guild_id),
    discordUserId: String(row.discord_user_id),
    atcoderUsername: String(row.atcoder_username),
    duelRating: Number(row.duel_rating),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

function duelFromRow(row: Row): Duel {
  return {
    id: Number(row.id),
    guildId: String(row.guild_id),
    challengerUserId: String(row.challenger_user_id),
    targetUserId: String(row.target_user_id),
    challengerHandle: optionalString(row.challenger_handle),
    targetHandle: optionalString(row.target_handle),
    problemId: optionalString(row.problem_id),
    contestId: optionalString(row.contest_id),
    title: optionalString(row.title),
    difficulty: optionalNumber(row.difficulty),
    status: String(row.status) as Duel["status"],
    challengedAt: Number(row.challenged_at),
    acceptedAt: optionalNumber(row.accepted_at),
    expiresAt: optionalNumber(row.expires_at),
    completedAt: optionalNumber(row.completed_at),
    declinedAt: optionalNumber(row.declined_at),
    cancelledAt: optionalNumber(row.cancelled_at),
    expiredAt: optionalNumber(row.expired_at),
    handicapCoefficient: optionalNumber(row.handicap_coefficient),
    lowerRatedUserId: optionalString(row.lower_rated_user_id),
    higherRatedUserId: optionalString(row.higher_rated_user_id),
    challengerRatingBefore: optionalNumber(row.challenger_rating_before),
    targetRatingBefore: optionalNumber(row.target_rating_before),
    challengerRatingAfter: optionalNumber(row.challenger_rating_after),
    targetRatingAfter: optionalNumber(row.target_rating_after),
    challengerDelta: optionalNumber(row.challenger_delta),
    targetDelta: optionalNumber(row.target_delta),
    result: optionalString(row.result) as Duel["result"],
    winnerUserId: optionalString(row.winner_user_id),
    challengerSolvedAt: optionalNumber(row.challenger_solved_at),
    targetSolvedAt: optionalNumber(row.target_solved_at)
  };
}

function getUtcDayKey(epochSecond: number): string {
  return new Date(epochSecond * 1000).toISOString().slice(0, 10);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}
