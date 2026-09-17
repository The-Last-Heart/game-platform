import { Pool } from 'pg';
import { LeaderboardService } from './leaderboard.service';
import type { DatabaseService } from '../database/database.service';

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('LeaderboardService integration', () => {
  if (!databaseUrl) {
    it('skipped because DATABASE_URL is unset', () => {
      expect(databaseUrl).toBeTruthy();
    });
    return;
  }

  let pool: Pool;
  let service: LeaderboardService;
  const suffix = `lb${Date.now().toString(36)}`;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    const db = {
      query: (text: string, params: readonly unknown[] = []) =>
        pool.query(text, [...params]),
      tx: async <T>(
        fn: (client: { query: typeof pool.query }) => Promise<T>,
      ) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
    } as unknown as DatabaseService;
    service = new LeaderboardService(db);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM players WHERE player_id LIKE $1`, [
      `install-${suffix}%`,
    ]);
    await pool.end();
  });

  it('awards QS points into total_points and returns ordered top rows', async () => {
    const p1 = `install-${suffix}-a`;
    const p2 = `install-${suffix}-b`;
    const matchId = `m-${suffix}`;

    const first = await service.applyPointEvent({
      playerId: p1,
      displayName: 'Alpha',
      avatarColor: '#111111',
      countryCode: 'SA',
      matchId,
      reason: 'challenge_win',
      sourceId: 'c1',
      points: 5,
    });
    const dup = await service.applyPointEvent({
      playerId: p1,
      displayName: 'Alpha',
      avatarColor: '#111111',
      countryCode: 'SA',
      matchId,
      reason: 'challenge_win',
      sourceId: 'c1',
      points: 5,
    });
    expect(first).toBe(true);
    expect(dup).toBe(false);

    await service.applyPointEvent({
      playerId: p1,
      displayName: 'Alpha',
      avatarColor: '#111111',
      countryCode: 'SA',
      matchId,
      reason: 'strike_survive',
      sourceId: 'a1',
      points: 10,
    });
    await service.applyPointEvent({
      playerId: p2,
      displayName: 'Beta',
      avatarColor: '#222222',
      countryCode: 'EG',
      matchId,
      reason: 'strike_fail',
      sourceId: 'a2',
      points: -5,
    });

    const played = await service.applyStatEvent({
      playerId: p1,
      displayName: 'Alpha',
      avatarColor: '#111111',
      countryCode: 'SA',
      matchId,
      reason: 'challenge_played',
      sourceId: 'c1',
    });
    const playedDup = await service.applyStatEvent({
      playerId: p1,
      displayName: 'Alpha',
      avatarColor: '#111111',
      countryCode: 'SA',
      matchId,
      reason: 'challenge_played',
      sourceId: 'c1',
    });
    const playlist = await service.applyStatEvent({
      playerId: p1,
      displayName: 'Alpha',
      avatarColor: '#111111',
      countryCode: 'SA',
      matchId,
      reason: 'playlist_completed',
      sourceId: matchId,
    });
    expect(played).toBe(true);
    expect(playedDup).toBe(false);
    expect(playlist).toBe(true);

    const totals = await pool.query<{
      player_id: string;
      total_points: string;
      challenges_played: string;
      playlists_completed: string;
    }>(
      `SELECT player_id,
              total_points::text AS total_points,
              challenges_played::text AS challenges_played,
              playlists_completed::text AS playlists_completed
       FROM players WHERE player_id = ANY($1::text[])`,
      [[p1, p2]],
    );
    const byId = Object.fromEntries(
      totals.rows.map((r) => [
        r.player_id,
        {
          points: r.total_points,
          challenges: r.challenges_played,
          playlists: r.playlists_completed,
        },
      ]),
    );
    expect(byId[p1]).toEqual({
      points: '15',
      challenges: '1',
      playlists: '1',
    });
    expect(byId[p2]).toEqual({
      points: '0',
      challenges: '0',
      playlists: '0',
    });

    const top = await service.getTop(100);
    const alpha = top.find(
      (r) => r.displayName === 'Alpha' && r.totalPoints === 15,
    );
    expect(alpha).toBeTruthy();
    expect(alpha!.countryCode).toBe('SA');
    expect(alpha!.challengesPlayed).toBe(1);
    expect(alpha!.playlistsCompleted).toBe(1);
    expect(alpha!.rank).toBeGreaterThanOrEqual(1);
  });
});
