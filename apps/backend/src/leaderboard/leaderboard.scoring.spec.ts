import { createDevChallengeDefinition } from '../match/domain/dev-challenge.evaluator';
import { MatchService } from '../match/services/match.service';
import type { MatchState } from '../match/domain/types';
import { FakeClock } from '../match/domain/types';
import type { LeaderboardService } from './leaderboard.service';

describe('MatchService Quick Survival leaderboard awards', () => {
  function attachSpy(service: MatchService) {
    const events: Array<{
      reason: string;
      points: number;
      playerId: string;
      sourceId: string;
    }> = [];
    (service as unknown as { leaderboard: LeaderboardService }).leaderboard = {
      applyPointEvent: async (input: {
        reason: string;
        points: number;
        playerId: string;
        sourceId: string;
      }) => {
        events.push({
          reason: input.reason,
          points: input.points,
          playerId: input.playerId,
          sourceId: input.sourceId,
        });
        return true;
      },
    } as unknown as LeaderboardService;
    return events;
  }

  it('awards +5 for QS human challenge success and skips bots/other modes', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const events = attachSpy(service);

    const created = await service.createQuickSurvivalMatch([
      {
        displayName: 'Human',
        avatarColor: '#111111',
        countryCode: 'SA',
        playerId: 'install-human-01',
      },
      {
        displayName: 'Friend',
        avatarColor: '#222222',
        countryCode: 'SA',
        playerId: 'install-friend-01',
      },
    ]);
    const match = (await service
      .getStoreForTests()
      .get(created.matchId)) as MatchState;
    const humanId = created.assignments[0]!.playerId;
    const friendId = created.assignments[1]!.playerId;
    match.players.get(friendId)!.isBot = true;
    const definition = createDevChallengeDefinition({
      durationMs: 3000,
      energyRewardOnSuccess: 0,
    });
    match.currentChallenge = {
      challengeInstanceId: 'chal-1',
      engineId: definition.engineId,
      definitionId: definition.definitionId,
      definitionVersion: definition.version,
      definition,
      participatingPlayerIds: [humanId, friendId],
      startsAtMs: clock.nowMs(),
      deadlineAtMs: clock.nowMs() + 3000,
      deadlineMonoMs: clock.monoMs() + 3000,
      status: 'resolved',
      roundPhase: 'answer',
      signalToken: null,
      signaledAtMs: null,
      signalAtMonoMs: null,
      signalEndsAtMs: null,
      signalEndsAtMonoMs: null,
      submissions: new Map(),
      resolutions: [
        {
          playerId: humanId,
          outcome: 'success',
          heartsDelta: 0,
          energyDelta: 0,
          heartsAfter: 3,
          energyAfter: 0,
          statusAfter: 'active',
        },
        {
          playerId: friendId,
          outcome: 'success',
          heartsDelta: 0,
          energyDelta: 0,
          heartsAfter: 3,
          energyAfter: 0,
          statusAfter: 'active',
        },
      ],
    };

    (
      service as unknown as {
        awardChallengeWinLeaderboardPoints: (m: MatchState) => void;
      }
    ).awardChallengeWinLeaderboardPoints(match);

    expect(events).toEqual([
      {
        reason: 'challenge_win',
        points: 5,
        playerId: 'install-human-01',
        sourceId: 'chal-1',
      },
    ]);

    match.mode = 'private';
    (
      service as unknown as {
        awardChallengeWinLeaderboardPoints: (m: MatchState) => void;
      }
    ).awardChallengeWinLeaderboardPoints(match);
    expect(events).toHaveLength(1);

    service.onModuleDestroy();
  });

  it('awards +10 survive and −5 fail for strike outcomes; reflect uses original attack id', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const events = attachSpy(service);

    const created = await service.createQuickSurvivalMatch([
      {
        displayName: 'Alpha',
        avatarColor: '#111111',
        countryCode: 'SA',
        playerId: 'install-a-000001',
      },
      {
        displayName: 'Beta',
        avatarColor: '#222222',
        countryCode: 'SA',
        playerId: 'install-b-000001',
      },
    ]);
    const match = (await service
      .getStoreForTests()
      .get(created.matchId)) as MatchState;
    const targetId = created.assignments[0]!.playerId;
    const attackerId = created.assignments[1]!.playerId;

    const award = (
      service as unknown as {
        awardStrikeLeaderboardPoints: (
          m: MatchState,
          ev: unknown[],
          ctx?: unknown,
        ) => void;
      }
    ).awardStrikeLeaderboardPoints.bind(service);

    award(match, [
      {
        kind: 'power_resolved',
        sequence: 1,
        revision: 1,
        serverTimestampMs: clock.nowMs(),
        attackId: 'atk-shield',
        attackerId,
        targetId,
        outcome: 'shielded',
        heartsDeltaTarget: 0,
        heartsAfterTarget: 3,
        statusAfterTarget: 'active',
      },
      {
        kind: 'power_resolved',
        sequence: 2,
        revision: 2,
        serverTimestampMs: clock.nowMs(),
        attackId: 'atk-hit',
        attackerId,
        targetId,
        outcome: 'hit',
        heartsDeltaTarget: -1,
        heartsAfterTarget: 2,
        statusAfterTarget: 'active',
      },
      {
        kind: 'power_resolved',
        sequence: 3,
        revision: 3,
        serverTimestampMs: clock.nowMs(),
        attackId: 'atk-expired',
        attackerId,
        targetId,
        outcome: 'expired',
        heartsDeltaTarget: -1,
        heartsAfterTarget: 1,
        statusAfterTarget: 'active',
      },
    ]);

    award(
      match,
      [
        {
          kind: 'power_defense_required',
          sequence: 4,
          revision: 4,
          serverTimestampMs: clock.nowMs(),
          attackId: 'atk-flipped',
          attackerId: targetId,
          targetId: attackerId,
          reflected: true,
          defenseDeadlineAtMs: clock.nowMs() + 5000,
        },
      ],
      {
        defenderSeatId: targetId,
        originalAttackId: 'atk-original',
        choice: 'reflect',
      },
    );

    expect(events).toEqual([
      {
        reason: 'strike_survive',
        points: 10,
        playerId: 'install-a-000001',
        sourceId: 'atk-shield',
      },
      {
        reason: 'strike_fail',
        points: -5,
        playerId: 'install-a-000001',
        sourceId: 'atk-hit',
      },
      {
        reason: 'strike_survive',
        points: 10,
        playerId: 'install-a-000001',
        sourceId: 'atk-original',
      },
    ]);

    service.onModuleDestroy();
  });
});
