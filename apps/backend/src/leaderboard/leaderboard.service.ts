import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type LeaderboardPointReason =
  | 'challenge_win'
  | 'strike_survive'
  | 'strike_fail';

export type LeaderboardPointEventInput = {
  playerId: string;
  displayName: string;
  avatarColor: string;
  countryCode: string;
  matchId: string;
  reason: LeaderboardPointReason;
  sourceId: string;
  points: 5 | 10 | -5;
};

export type LeaderboardRow = {
  rank: number;
  displayName: string;
  countryCode: string;
  avatarColor: string;
  totalPoints: number;
};

/**
 * Quick Survival scoreboard: upsert profile, idempotent ledger, floored totals.
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Apply one point event. Returns true when the ledger row was newly inserted
   * (and total_points updated); false on idempotent conflict or validation skip.
   */
  async applyPointEvent(input: LeaderboardPointEventInput): Promise<boolean> {
    if (input.playerId.length < 8 || input.playerId.length > 128) {
      return false;
    }
    if (!/^[A-Za-z0-9._:-]+$/.test(input.playerId)) {
      return false;
    }

    try {
      return await this.db.tx(async (client) => {
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
            input.playerId,
            input.displayName,
            input.avatarColor,
            input.countryCode,
          ],
        );

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

  async getTop(limit = 100): Promise<LeaderboardRow[]> {
    const clamped = Math.min(100, Math.max(1, Math.floor(limit)));
    const result = await this.db.query<{
      display_name: string;
      country_code: string;
      avatar_color: string;
      total_points: string;
    }>(
      `SELECT display_name, country_code, avatar_color, total_points::text AS total_points
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
    }));
  }
}
