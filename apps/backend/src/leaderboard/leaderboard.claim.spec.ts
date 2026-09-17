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

describe('LeaderboardService.claimProfile', () => {
  it('rejects a display name owned by another install', async () => {
    const db = createFakeDb({
      tx: async (fn) =>
        fn({
          query: async (text: string) => {
            if (text.includes('SELECT 1') || text.includes('SELECT')) {
              return { rows: [{ '?column?': 1 }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          },
        } as never),
    });
    const service = new LeaderboardService(db);
    const result = await service.claimProfile({
      playerId: 'install-abcdef12',
      displayName: 'Wajdi',
      avatarColor: '#FF3045',
      countryCode: 'SA',
    });
    expect(result).toEqual({ ok: false, reason: 'DISPLAY_NAME_TAKEN' });
  });

  it('claims a free display name', async () => {
    const db = createFakeDb({
      tx: async (fn) =>
        fn({
          query: async (text: string) => {
            if (text.includes('SELECT')) {
              return { rows: [], rowCount: 0 };
            }
            return { rows: [], rowCount: 1 };
          },
        } as never),
    });
    const service = new LeaderboardService(db);
    const result = await service.claimProfile({
      playerId: 'install-abcdef12',
      displayName: 'Wajdi',
      avatarColor: '#FF3045',
      countryCode: 'SA',
    });
    expect(result).toEqual({ ok: true });
  });
});
