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
