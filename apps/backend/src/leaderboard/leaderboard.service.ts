import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type LeaderboardPointReason =
  | 'challenge_win'
  | 'strike_survive'
  | 'strike_fail';

export type LeaderboardStatReason =
  | 'challenge_played'
  | 'playlist_completed';

export type LeaderboardProfile = {
  playerId: string;
  displayName: string;
  avatarColor: string;
  countryCode: string;
};

export type LeaderboardPointEventInput = LeaderboardProfile & {
  matchId: string;
  reason: LeaderboardPointReason;
  sourceId: string;
  points: 5 | 10 | -5;
};

export type LeaderboardStatEventInput = LeaderboardProfile & {
  matchId: string;
  reason: LeaderboardStatReason;
  sourceId: string;
};

export type LeaderboardRow = {
  rank: number;
  displayName: string;
  countryCode: string;
  avatarColor: string;
  totalPoints: number;
  challengesPlayed: number;
  playlistsCompleted: number;
};

/**
 * Quick Survival scoreboard: upsert profile, idempotent ledger, floored totals.
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(private readonly db: DatabaseService) {}

  private isValidPlayerId(playerId: string): boolean {
    return (
      playerId.length >= 8 &&
      playerId.length <= 128 &&
      /^[A-Za-z0-9._:-]+$/.test(playerId)
    );
  }

  private async upsertProfile(
    client: { query: DatabaseService['query'] },
    profile: LeaderboardProfile,
  ): Promise<void> {
    // Prefer updating/inserting the requested name; if another install owns it,
    // keep the existing name (update) or insert without stealing (new row uses a
    // suffix only when this player_id is brand new — claim API is the strict path).
    const taken = await client.query<{ player_id: string }>(
      `SELECT player_id
       FROM players
       WHERE lower(regexp_replace(btrim(display_name), '\\s+', ' ', 'g'))
           = lower(regexp_replace(btrim($1), '\\s+', ' ', 'g'))
         AND player_id <> $2
       LIMIT 1`,
      [profile.displayName, profile.playerId],
    );
    const nameTaken = (taken.rowCount ?? 0) > 0;

    if (!nameTaken) {
      await client.query(
        `INSERT INTO players (
           player_id, display_name, avatar_color, country_code, total_points, updated_at
         ) VALUES ($1, $2, $3, $4, 0, now())
         ON CONFLICT (player_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           avatar_color = EXCLUDED.avatar_color,
           country_code = EXCLUDED.country_code,
           updated_at = now()`,
        [
          profile.playerId,
          profile.displayName,
          profile.avatarColor,
          profile.countryCode,
        ],
      );
      return;
    }

    const existing = await client.query(
      `SELECT 1 FROM players WHERE player_id = $1 LIMIT 1`,
      [profile.playerId],
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE players
         SET avatar_color = $2,
             country_code = $3,
             updated_at = now()
         WHERE player_id = $1`,
        [profile.playerId, profile.avatarColor, profile.countryCode],
      );
      return;
    }

    await client.query(
      `INSERT INTO players (
         player_id, display_name, avatar_color, country_code, total_points, updated_at
       ) VALUES ($1, $2, $3, $4, 0, now())`,
      [
        profile.playerId,
        await this.allocateUniqueDisplayName(client, profile.displayName),
        profile.avatarColor,
        profile.countryCode,
      ],
    );
  }

  private async allocateUniqueDisplayName(
    client: { query: DatabaseService['query'] },
    preferred: string,
  ): Promise<string> {
    const base = preferred.trim().replace(/\s+/g, ' ').slice(0, 22);
    for (let i = 0; i < 26; i += 1) {
      const candidate = `${base} ${String.fromCharCode(65 + i)}`;
      const hit = await client.query(
        `SELECT 1
         FROM players
         WHERE lower(regexp_replace(btrim(display_name), '\\s+', ' ', 'g'))
             = lower(regexp_replace(btrim($1), '\\s+', ' ', 'g'))
         LIMIT 1`,
        [candidate],
      );
      if ((hit.rowCount ?? 0) === 0) {
        return candidate.slice(0, 24);
      }
    }
    return `${base} Z`.slice(0, 24);
  }

  /**
   * Strict profile claim for identity create/edit. Rejects names owned by
   * another install (case/whitespace-insensitive).
   */
  async claimProfile(
    profile: LeaderboardProfile,
  ): Promise<{ ok: true } | { ok: false; reason: 'DISPLAY_NAME_TAKEN' | 'INVALID' }> {
    if (!this.isValidPlayerId(profile.playerId)) {
      return { ok: false, reason: 'INVALID' };
    }
    try {
      await this.db.tx(async (client) => {
        const taken = await client.query(
          `SELECT 1
           FROM players
           WHERE lower(regexp_replace(btrim(display_name), '\\s+', ' ', 'g'))
               = lower(regexp_replace(btrim($1), '\\s+', ' ', 'g'))
             AND player_id <> $2
           LIMIT 1`,
          [profile.displayName, profile.playerId],
        );
        if ((taken.rowCount ?? 0) > 0) {
          throw Object.assign(new Error('DISPLAY_NAME_TAKEN'), {
            code: 'DISPLAY_NAME_TAKEN',
          });
        }
        await client.query(
          `INSERT INTO players (
             player_id, display_name, avatar_color, country_code, total_points, updated_at
           ) VALUES ($1, $2, $3, $4, 0, now())
           ON CONFLICT (player_id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             avatar_color = EXCLUDED.avatar_color,
             country_code = EXCLUDED.country_code,
             updated_at = now()`,
          [
            profile.playerId,
            profile.displayName,
            profile.avatarColor,
            profile.countryCode,
          ],
        );
      });
      return { ok: true };
    } catch (error) {
      if (
        error instanceof Error &&
        ((error as { code?: string }).code === 'DISPLAY_NAME_TAKEN' ||
          (error as { code?: string }).code === '23505')
      ) {
        return { ok: false, reason: 'DISPLAY_NAME_TAKEN' };
      }
      this.logger.warn({
        event: 'player_claim_failed',
        category: error instanceof Error ? error.name : 'UnknownError',
      });
      return { ok: false, reason: 'INVALID' };
    }
  }

  /**
   * Apply one point event. Returns true when the ledger row was newly inserted
   * (and total_points updated); false on idempotent conflict or validation skip.
   */
  async applyPointEvent(input: LeaderboardPointEventInput): Promise<boolean> {
    if (!this.isValidPlayerId(input.playerId)) {
      return false;
    }

    try {
      return await this.db.tx(async (client) => {
        await this.upsertProfile(client, input);

        const inserted = await client.query<{ id: string }>(
          `INSERT INTO player_point_events (
             player_id, match_id, reason, source_id, points, mode
           ) VALUES ($1, $2, $3, $4, $5, 'quick_survival')
           ON CONFLICT (player_id, match_id, reason, source_id) DO NOTHING
           RETURNING id`,
          [
            input.playerId,
            input.matchId,
            input.reason,
            input.sourceId,
            input.points,
          ],
        );

        if (inserted.rowCount !== 1) {
          return false;
        }

        await client.query(
          `UPDATE players
           SET total_points = GREATEST(0, total_points + $2::bigint),
               updated_at = now()
           WHERE player_id = $1`,
          [input.playerId, input.points],
        );
        return true;
      });
    } catch (error) {
      this.logger.warn({
        event: 'leaderboard_apply_failed',
        reason: input.reason,
        category: error instanceof Error ? error.name : 'UnknownError',
      });
      return false;
    }
  }

  /**
   * Apply one display-stat event. Returns true when newly inserted and counter
   * bumped; false on idempotent conflict or validation skip.
   */
  async applyStatEvent(input: LeaderboardStatEventInput): Promise<boolean> {
    if (!this.isValidPlayerId(input.playerId)) {
      return false;
    }

    const counterColumn =
      input.reason === 'challenge_played'
        ? 'challenges_played'
        : 'playlists_completed';

    try {
      return await this.db.tx(async (client) => {
        await this.upsertProfile(client, input);

        const inserted = await client.query<{ id: string }>(
          `INSERT INTO player_stat_events (
             player_id, match_id, reason, source_id, mode
           ) VALUES ($1, $2, $3, $4, 'quick_survival')
           ON CONFLICT (player_id, match_id, reason, source_id) DO NOTHING
           RETURNING id`,
          [input.playerId, input.matchId, input.reason, input.sourceId],
        );

        if (inserted.rowCount !== 1) {
          return false;
        }

        await client.query(
          `UPDATE players
           SET ${counterColumn} = ${counterColumn} + 1,
               updated_at = now()
           WHERE player_id = $1`,
          [input.playerId],
        );
        return true;
      });
    } catch (error) {
      this.logger.warn({
        event: 'leaderboard_stat_apply_failed',
        reason: input.reason,
        category: error instanceof Error ? error.name : 'UnknownError',
      });
      return false;
    }
  }

  async getTop(limit = 100): Promise<LeaderboardRow[]> {
    const clamped = Math.min(100, Math.max(1, Math.floor(limit)));
    const result = await this.db.query<{
      display_name: string;
      country_code: string;
      avatar_color: string;
      total_points: string;
      challenges_played: string;
      playlists_completed: string;
    }>(
      `SELECT display_name, country_code, avatar_color,
              total_points::text AS total_points,
              challenges_played::text AS challenges_played,
              playlists_completed::text AS playlists_completed
       FROM players
       ORDER BY total_points DESC, updated_at ASC, player_id ASC
       LIMIT $1`,
      [clamped],
    );

    return result.rows.map((row, index) => ({
      rank: index + 1,
      displayName: row.display_name,
      countryCode: row.country_code,
      avatarColor: row.avatar_color,
      totalPoints: Number(row.total_points),
      challengesPlayed: Number(row.challenges_played),
      playlistsCompleted: Number(row.playlists_completed),
    }));
  }
}
