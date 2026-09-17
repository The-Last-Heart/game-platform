import { createDevChallengeDefinition } from '../match/domain/dev-challenge.evaluator';
import { MatchService } from '../match/services/match.service';
import type { MatchState } from '../match/domain/types';
import { FakeClock } from '../match/domain/types';
import type { LeaderboardService } from './leaderboard.service';

describe('MatchService Quick Survival leaderboard awards', () => {
  function attachSpy(service: MatchService) {
    const pointEvents: Array<{
      reason: string;
      points: number;
      playerId: string;
      sourceId: string;
    }> = [];
    const statEvents: Array<{
      reason: string;
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
        pointEvents.push({
          reason: input.reason,
          points: input.points,
          playerId: input.playerId,
          sourceId: input.sourceId,
        });
        return true;
      },
      applyStatEvent: async (input: {
        reason: string;
        playerId: string;
        sourceId: string;
      }) => {
        statEvents.push({
          reason: input.reason,
          playerId: input.playerId,
          sourceId: input.sourceId,
        });
        return true;
      },
    } as unknown as LeaderboardService;
    return { pointEvents, statEvents };
  }

  it('awards +5 for QS human challenge success and skips bots/other modes', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const { pointEvents, statEvents } = attachSpy(service);

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
    match.roundNumber = 1;
    match.pinnedPlaylist = [definition, definition];
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

    expect(pointEvents).toEqual([
      {
        reason: 'challenge_win',
        points: 5,
        playerId: 'install-human-01',
        sourceId: 'chal-1',
      },
    ]);
    expect(statEvents).toEqual([
      {
        reason: 'challenge_played',
        playerId: 'install-human-01',
        sourceId: 'chal-1',
      },
    ]);
    expect(match.players.get(humanId)!.claimedPoints).toBe(5);
    expect(match.players.get(friendId)!.claimedPoints).toBe(0);

    match.mode = 'private';
    (
      service as unknown as {
        awardChallengeWinLeaderboardPoints: (m: MatchState) => void;
      }
    ).awardChallengeWinLeaderboardPoints(match);
    expect(pointEvents).toHaveLength(1);
    expect(statEvents).toHaveLength(1);
    expect(match.players.get(humanId)!.claimedPoints).toBe(5);

    service.onModuleDestroy();
  });

  it('records playlist_completed once on the last base-pack round', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const { pointEvents, statEvents } = attachSpy(service);

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
    const definition = createDevChallengeDefinition({
      durationMs: 3000,
      energyRewardOnSuccess: 0,
    });
    match.pinnedPlaylist = [definition, definition];
    match.roundNumber = 2;
    match.currentChallenge = {
      challengeInstanceId: 'chal-last',
      engineId: definition.engineId,
      definitionId: definition.definitionId,
      definitionVersion: definition.version,
      definition,
      participatingPlayerIds: [humanId],
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
          outcome: 'failure',
          heartsDelta: -1,
          energyDelta: 0,
          heartsAfter: 2,
          energyAfter: 0,
          statusAfter: 'active',
        },
      ],
    };
    match.players.get(humanId)!.status = 'active';

    (
      service as unknown as {
        awardChallengeWinLeaderboardPoints: (m: MatchState) => void;
      }
    ).awardChallengeWinLeaderboardPoints(match);

    expect(pointEvents).toEqual([]);
    expect(statEvents).toEqual([
      {
        reason: 'challenge_played',
        playerId: 'install-human-01',
        sourceId: 'chal-last',
      },
      {
        reason: 'playlist_completed',
        playerId: 'install-human-01',
        sourceId: match.matchId,
      },
    ]);

    // Sudden-death round after base pack: no second playlist_completed.
    match.roundNumber = 3;
    match.currentChallenge = {
      ...match.currentChallenge,
      challengeInstanceId: 'chal-sd',
      resolutions: [
        {
          playerId: humanId,
          outcome: 'success',
          heartsDelta: 0,
          energyDelta: 0,
          heartsAfter: 2,
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
    expect(
      statEvents.filter((e) => e.reason === 'playlist_completed'),
    ).toHaveLength(1);

    service.onModuleDestroy();
  });

  it('awards +10 survive and −5 fail for strike outcomes; reflect uses original attack id', async () => {
    const clock = new FakeClock(5_000_000);
    const service = MatchService.forTests({ clock, nodeEnv: 'test' });
    const { pointEvents } = attachSpy(service);

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

    expect(pointEvents).toEqual([
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
    // +10 shield, −5 hit, +10 reflect survive = 15
    expect(match.players.get(targetId)!.claimedPoints).toBe(15);

    // Match-local floor: another hit cannot push below 0.
    match.players.get(targetId)!.claimedPoints = 3;
    award(match, [
      {
        kind: 'power_resolved',
        sequence: 5,
        revision: 5,
        serverTimestampMs: clock.nowMs(),
        attackId: 'atk-floor',
        attackerId,
        targetId,
        outcome: 'hit',
        heartsDeltaTarget: -1,
        heartsAfterTarget: 0,
        statusAfterTarget: 'spectator',
      },
    ]);
    expect(match.players.get(targetId)!.claimedPoints).toBe(0);

    service.onModuleDestroy();
  });
});
