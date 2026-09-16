import { LeaderboardService } from './leaderboard.service';
import type { DatabaseService } from '../database/database.service';

type QueryFn = DatabaseService['query'];
type TxFn = DatabaseService['tx'];

function createFakeDb(handlers: {
  query?: QueryFn;
  tx?: TxFn;
}): DatabaseService {
  return {
    query: handlers.query ?? (async () => ({ rows: [], rowCount: 0 })),
    tx:
      handlers.tx ??
      (async (fn) =>
        fn({
          query: async () => ({ rows: [], rowCount: 0 }),
        } as never)),
    getPool: () => {
      throw new Error('unused');
    },
    onModuleDestroy: async () => undefined,
  } as unknown as DatabaseService;
}

describe('LeaderboardService', () => {
  it('applies a new point event and floors deductions at zero', async () => {
    const queries: Array<{ text: string; params: unknown[] }> = [];
    const db = createFakeDb({
      tx: async (fn) =>
        fn({
          query: async (text: string, params: unknown[] = []) => {
            queries.push({ text, params: [...params] });
            if (text.includes('ON CONFLICT (player_id, match_id, reason, source_id)')) {
              return { rows: [{ id: '1' }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          },
        } as never),
    });
    const service = new LeaderboardService(db);

    const applied = await service.applyPointEvent({
      playerId: 'install-abcdef12',
      displayName: 'Wajdi',
      avatarColor: '#FF3045',
      countryCode: 'SA',
      matchId: 'match-1',
      reason: 'strike_fail',
      sourceId: 'attack-1',
      points: -5,
    });

    expect(applied).toBe(true);
    const update = queries.find((q) =>
      q.text.includes('GREATEST(0, total_points +'),
    );
    expect(update?.params).toEqual(['install-abcdef12', -5]);
  });

  it('is idempotent when ledger conflict returns no row', async () => {
    const db = createFakeDb({
      tx: async (fn) =>
        fn({
          query: async (text: string) => {
            if (text.includes('ON CONFLICT (player_id, match_id, reason, source_id)')) {
              return { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 0 };
          },
        } as never),
    });
    const service = new LeaderboardService(db);
    const applied = await service.applyPointEvent({
      playerId: 'install-abcdef12',
      displayName: 'Wajdi',
      avatarColor: '#FF3045',
      countryCode: 'SA',
      matchId: 'match-1',
      reason: 'challenge_win',
      sourceId: 'challenge-1',
      points: 5,
    });
    expect(applied).toBe(false);
  });

  it('returns ranked top rows', async () => {
    const db = createFakeDb({
      query: async () =>
        ({
          rows: [
            {
              display_name: 'A',
              country_code: 'SA',
              avatar_color: '#111111',
              total_points: '20',
            },
            {
              display_name: 'B',
              country_code: 'EG',
              avatar_color: '#222222',
              total_points: '10',
            },
          ],
          rowCount: 2,
        }) as never,
    });
    const service = new LeaderboardService(db);
    const rows = await service.getTop(100);
    expect(rows).toEqual([
      {
        rank: 1,
        displayName: 'A',
        countryCode: 'SA',
        avatarColor: '#111111',
        totalPoints: 20,
      },
      {
        rank: 2,
        displayName: 'B',
        countryCode: 'EG',
        avatarColor: '#222222',
        totalPoints: 10,
      },
    ]);
  });
});
