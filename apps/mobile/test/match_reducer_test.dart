import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_reducer.dart';
import 'package:game/features/match/state/match_snapshot.dart';

void main() {
  late Map<String, dynamic> fixtures;
  late MatchReducer reducer;

  setUpAll(() {
    final File file = File('test/fixtures/realtime_envelopes.json');
    fixtures = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  });

  setUp(() {
    reducer = MatchReducer();
  });

  MatchViewState initialState({
    int sequence = -1,
    String? playerId,
    String? matchId,
  }) {
    return MatchViewState(
      serverSequence: sequence,
      playerId: playerId,
      matchId: matchId,
    );
  }

  Map<String, dynamic> clone(Map<String, dynamic> source) {
    return Map<String, dynamic>.from(
      jsonDecode(jsonEncode(source)) as Map<dynamic, dynamic>,
    );
  }

  group('MatchReducer', () {
    test('session.accepted is a no-op for identity', () {
      final MatchViewState prior = initialState(
        sequence: 3,
        matchId: 'match-abc',
        playerId: 'player-prior',
      );
      final Map<String, dynamic> raw = clone(
        fixtures['session_accepted'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(prior, raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.matchId, 'match-abc');
      expect(result.state.playerId, 'player-prior');
      expect(result.state.serverSequence, 3);
    });

    test('session.accepted without prior identity does not set matchId', () {
      final Map<String, dynamic> raw = clone(
        fixtures['session_accepted'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(initialState(), raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.matchId, isNull);
      expect(result.state.playerId, isNull);
    });

    test('applies lobby snapshot correctly', () {
      final Map<String, dynamic> raw = clone(
        fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(initialState(), raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.phase, MatchPhase.lobby);
      expect(result.state.players.length, 2);
      expect(result.state.serverSequence, 3);
      expect(result.state.matchId, 'match-abc');
      expect(result.requestSnapshot, isFalse);
    });

    test('event N then snapshot N applies snapshot (equal seq)', () {
      final Map<String, dynamic> snapActive = clone(
        fixtures['match_snapshot_challenge_active'] as Map<String, dynamic>,
      );
      final ReducerResult first = reducer.reduce(initialState(), snapActive);
      expect(first.disposition, ReducerDisposition.applied);
      expect(first.state.serverSequence, 10);
      expect(first.state.phase, MatchPhase.challengeActive);

      final Map<String, dynamic> snapSameSeq = clone(
        fixtures['match_snapshot_completed_same_seq'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(first.state, snapSameSeq);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.serverSequence, 10);
      expect(result.state.phase, MatchPhase.completed);
      expect(result.state.winnerId, 'player-1');
      expect(result.state.players.length, 2);
      expect(result.state.players[0].hearts, 2);
      expect(result.state.players[0].energy, 3);
      expect(result.state.players[1].status, PlayerStatus.spectator);
      expect(result.requestSnapshot, isFalse);
    });

    test('N+2 with N+1 missing triggers snapshot recovery, does NOT apply', () {
      final MatchViewState stateAtSeq3 = initialState(sequence: 3);

      final Map<String, dynamic> raw = clone(
        fixtures['challenge_started'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq3, raw);
      expect(result.disposition, ReducerDisposition.recoveryRequired);
      expect(result.requestSnapshot, isTrue);
      expect(result.state.currentChallenge, isNull);
      expect(result.state.serverSequence, 3);
    });

    test('halted snapshot replaces round-result', () {
      const MatchViewState stateAtRoundResult = MatchViewState(
        serverSequence: 11,
        phase: MatchPhase.roundResult,
        matchId: 'match-abc',
      );

      final Map<String, dynamic> raw = clone(
        fixtures['match_snapshot_halted'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtRoundResult, raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.phase, MatchPhase.halted);
      expect(result.state.serverSequence, 15);
      expect(result.state.roundNumber, 3);
      expect(result.requestSnapshot, isFalse);
    });

    test('final snapshot same sequence updates hearts/energy/statuses', () {
      final Map<String, dynamic> snapActive = clone(
        fixtures['match_snapshot_challenge_active'] as Map<String, dynamic>,
      );
      final ReducerResult first = reducer.reduce(initialState(), snapActive);
      expect(first.disposition, ReducerDisposition.applied);
      expect(first.state.players[0].hearts, 3);
      expect(first.state.players[0].energy, 0);

      final Map<String, dynamic> snapSameSeq = clone(
        fixtures['match_snapshot_completed_same_seq'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(first.state, snapSameSeq);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.players[0].hearts, 2);
      expect(result.state.players[0].energy, 3);
      expect(result.state.players[1].status, PlayerStatus.spectator);
    });

    test('stale snapshot (lower seq) is ignored', () {
      final MatchViewState stateAtSeq5 = initialState(sequence: 5);
      final Map<String, dynamic> raw = clone(
        fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq5, raw);
      expect(result.disposition, ReducerDisposition.ignored);
      expect(result.state.serverSequence, 5);
      expect(result.state.players, isEmpty);
    });

    test('cross-match snapshot is ignored', () {
      final MatchViewState bound = initialState(
        sequence: 3,
        matchId: 'match-abc',
      );
      final Map<String, dynamic> raw = clone(
        fixtures['match_snapshot_cross_match'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(bound, raw);
      expect(result.disposition, ReducerDisposition.ignored);
      expect(result.state.serverSequence, 3);
      expect(result.state.matchId, 'match-abc');
    });

    test('cross-match event is ignored', () {
      final MatchViewState bound = initialState(
        sequence: 3,
        matchId: 'match-abc',
      );
      final Map<String, dynamic> raw = <String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.challengeStarted,
        'messageId': 'msg-x',
        'matchId': 'match-OTHER',
        'serverSequence': 4,
        'payload': clone(
          (fixtures['challenge_started'] as Map<String, dynamic>)['payload']
              as Map<String, dynamic>,
        ),
      };
      final ReducerResult result = reducer.reduce(bound, raw);
      expect(result.disposition, ReducerDisposition.ignored);
      expect(result.state.serverSequence, 3);
      expect(result.state.currentChallenge, isNull);
    });

    test('snapshot does NOT trigger gap request even with sequence jump', () {
      final MatchViewState stateAtSeq3 = initialState(sequence: 3);
      final Map<String, dynamic> raw = clone(
        fixtures['match_snapshot_challenge_active'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq3, raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.requestSnapshot, isFalse);
      expect(result.state.serverSequence, 10);
    });

    test('envelope/payload sequence mismatch triggers snapshot', () {
      final Map<String, dynamic> raw = clone(
        fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
      );
      raw['serverSequence'] = 999;
      final ReducerResult result = reducer.reduce(initialState(), raw);
      expect(result.disposition, ReducerDisposition.recoveryRequired);
      expect(result.requestSnapshot, isTrue);
      expect(result.state.serverSequence, -1);
    });

    test('challenge signal transitions round phase', () {
      final Map<String, dynamic> snapRaw = clone(
        fixtures['match_snapshot_challenge_active'] as Map<String, dynamic>,
      );
      final ReducerResult snapResult = reducer.reduce(initialState(), snapRaw);
      expect(snapResult.disposition, ReducerDisposition.applied);
      expect(
        snapResult.state.currentChallenge!.roundPhase,
        RoundPhase.waitingSignal,
      );

      final Map<String, dynamic> signalRaw = clone(
        fixtures['challenge_signal'] as Map<String, dynamic>,
      );
      signalRaw['serverSequence'] = 11;
      final ReducerResult signalResult = reducer.reduce(
        snapResult.state,
        signalRaw,
      );
      expect(signalResult.disposition, ReducerDisposition.applied);
      expect(
        signalResult.state.currentChallenge!.roundPhase,
        RoundPhase.signalActive,
      );
      expect(
        signalResult.state.currentChallenge!.signalToken,
        'signal-tok-xyz',
      );
      expect(
        signalResult.state.currentChallenge!.signalEndsAtMs,
        1700000012000,
      );

      final Map<String, dynamic> endedRaw = clone(
        fixtures['challenge_signal_ended'] as Map<String, dynamic>,
      );
      endedRaw['serverSequence'] = 12;
      final ReducerResult endedResult = reducer.reduce(
        signalResult.state,
        endedRaw,
      );
      expect(endedResult.disposition, ReducerDisposition.applied);
      expect(
        endedResult.state.currentChallenge!.roundPhase,
        RoundPhase.signalExpired,
      );
      expect(endedResult.state.currentChallenge!.signalToken, isNull);
    });

    test('seat-private signal for another player is ignored', () {
      final Map<String, dynamic> snapRaw = clone(
        fixtures['match_snapshot_challenge_active'] as Map<String, dynamic>,
      );
      final ReducerResult snapResult = reducer.reduce(
        initialState(playerId: 'player-local'),
        snapRaw,
      );

      final Map<String, dynamic> signalRaw = clone(
        fixtures['challenge_signal'] as Map<String, dynamic>,
      );
      // Seat-private signals are unsequenced on the wire.
      signalRaw.remove('serverSequence');
      (signalRaw['payload'] as Map<String, dynamic>)['playerId'] =
          'player-other';
      final ReducerResult ignored = reducer.reduce(snapResult.state, signalRaw);
      expect(ignored.disposition, ReducerDisposition.applied);
      expect(
        ignored.state.currentChallenge!.roundPhase,
        RoundPhase.waitingSignal,
      );
      expect(ignored.state.currentChallenge!.signalToken, isNull);

      (signalRaw['payload'] as Map<String, dynamic>)['playerId'] =
          'player-local';
      final ReducerResult applied = reducer.reduce(snapResult.state, signalRaw);
      expect(
        applied.state.currentChallenge!.roundPhase,
        RoundPhase.signalActive,
      );
      expect(applied.state.currentChallenge!.signalToken, 'signal-tok-xyz');
    });

    test('challenge resolved transitions to round_result phase', () {
      final MatchViewState stateAtSeq10 = initialState(
        sequence: 10,
        playerId: 'player-1',
      );
      final Map<String, dynamic> raw = clone(
        fixtures['challenge_resolved'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq10, raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.phase, MatchPhase.roundResult);
      expect(result.state.lastRoundResult, isNotNull);
      expect(result.state.lastRoundResult!.resolutions.length, 2);
    });

    test('challenge resolved merges per-seat energy; failures do not wipe others', () {
      final Map<String, dynamic> lobbyRaw = clone(
        fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
      );
      final MatchViewState lobby = reducer
          .reduce(
            initialState(playerId: 'player-1'),
            lobbyRaw,
          )
          .state;
      expect(lobby.players[0].energy, 0);
      expect(lobby.players[1].energy, 0);

      final Map<String, dynamic> resolvedRaw = clone(
        fixtures['challenge_resolved'] as Map<String, dynamic>,
      );
      // Consecutive after lobby snapshot sequence 3.
      resolvedRaw['serverSequence'] = 4;
      // Fixture: player-1 success energyAfter=1, player-2 failure energyAfter=0.
      final ReducerResult result = reducer.reduce(lobby, resolvedRaw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(
        result.state.players
            .firstWhere((PlayerPublic p) => p.playerId == 'player-1')
            .energy,
        1,
      );
      expect(
        result.state.players
            .firstWhere((PlayerPublic p) => p.playerId == 'player-1')
            .hearts,
        3,
      );
      expect(
        result.state.players
            .firstWhere((PlayerPublic p) => p.playerId == 'player-2')
            .energy,
        0,
      );
      expect(
        result.state.players
            .firstWhere((PlayerPublic p) => p.playerId == 'player-2')
            .hearts,
        2,
      );
    });

    test('power grants accumulate per seat across snapshot lastGrant overwrite', () {
      MatchViewState state = initialState(
        sequence: 10,
        playerId: 'player-1',
        matchId: 'match-abc',
      );
      state = state.copyWith(
        players: <PlayerPublic>[
          const PlayerPublic(
            playerId: 'player-1',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
          ),
          const PlayerPublic(
            playerId: 'player-2',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
          ),
        ],
      );

      final ReducerResult grant1 = reducer.reduce(state, <String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.powerGranted,
        'messageId': 'g1',
        'matchId': 'match-abc',
        'serverSequence': 11,
        'serverTimestampMs': 1,
        'payload': <String, dynamic>{
          'playerId': 'player-1',
          'powerId': PowerIds.dangerPulse,
          'energyAfter': 0,
        },
      });
      expect(grant1.disposition, ReducerDisposition.applied);
      expect(
        grant1.state.tactical?.grantFor('player-1')?.powerId,
        PowerIds.dangerPulse,
      );

      final ReducerResult grant2 = reducer.reduce(grant1.state, <String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.powerGranted,
        'messageId': 'g2',
        'matchId': 'match-abc',
        'serverSequence': 12,
        'serverTimestampMs': 2,
        'payload': <String, dynamic>{
          'playerId': 'player-2',
          'powerId': PowerIds.shield,
          'energyAfter': 0,
        },
      });
      expect(
        grant2.state.tactical?.grantFor('player-1')?.powerId,
        PowerIds.dangerPulse,
      );
      expect(
        grant2.state.tactical?.grantFor('player-2')?.powerId,
        PowerIds.shield,
      );

      // Snapshot only carries the room's lastGrant (player-2) — must not wipe
      // player-1's unlock feedback.
      final ReducerResult snap = reducer.reduce(grant2.state, <String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.matchSnapshot,
        'messageId': 's1',
        'matchId': 'match-abc',
        'serverSequence': 12,
        'serverTimestampMs': 3,
        'payload': <String, dynamic>{
          'matchId': 'match-abc',
          'status': 'waiting',
          'phase': 'round_result',
          'phaseDeadlineAtMs': null,
          'roundNumber': 1,
          'serverNowMs': 3,
          'lastRoundResult': null,
          'nextPhaseAtMs': null,
          'revision': 12,
          'sequence': 12,
          'players': <Map<String, dynamic>>[
            <String, dynamic>{
              'playerId': 'player-1',
              'hearts': 3,
              'energy': 0,
              'status': 'active',
              'presence': 'connected',
              'submittedForCurrentChallenge': false,
              'inventory': <String, dynamic>{
                'danger_pulse': 1,
                'shield': 0,
                'reflection': 0,
              },
            },
            <String, dynamic>{
              'playerId': 'player-2',
              'hearts': 3,
              'energy': 0,
              'status': 'active',
              'presence': 'connected',
              'submittedForCurrentChallenge': false,
              'inventory': <String, dynamic>{
                'danger_pulse': 0,
                'shield': 1,
                'reflection': 0,
              },
            },
          ],
          'winnerId': null,
          'currentChallenge': null,
          'tactical': <String, dynamic>{
            'pendingAttack': null,
            'eligibleTargetIds': <String>[],
            'actorsWithOffensiveCharge': <String>[],
            'lastGrant': <String, dynamic>{
              'playerId': 'player-2',
              'powerId': PowerIds.shield,
              'outcome': 'granted',
            },
          },
        },
      });
      expect(snap.disposition, ReducerDisposition.applied);
      expect(
        snap.state.tactical?.grantFor('player-1')?.powerId,
        PowerIds.dangerPulse,
      );
      expect(
        snap.state.localPlayer?.inventory?.dangerPulse,
        1,
      );
    });

    test('power strike narrative updates live for room including reverse', () {
      MatchViewState state = initialState(
        sequence: 20,
        playerId: 'player-3',
        matchId: 'match-abc',
      );
      state = state.copyWith(
        phase: MatchPhase.powerAction,
        players: <PlayerPublic>[
          const PlayerPublic(
            playerId: 'player-1',
            hearts: 3,
            energy: 4,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'A',
          ),
          const PlayerPublic(
            playerId: 'player-2',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'B',
          ),
          const PlayerPublic(
            playerId: 'player-3',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'C',
          ),
        ],
      );

      final ReducerResult used = reducer.reduce(state, <String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.powerUsed,
        'messageId': 'u1',
        'matchId': 'match-abc',
        'serverSequence': 21,
        'serverTimestampMs': 100,
        'payload': <String, dynamic>{
          'attackId': 'atk-1',
          'attackerId': 'player-1',
          'targetId': 'player-2',
          'powerId': PowerIds.dangerPulse,
        },
      });
      expect(used.disposition, ReducerDisposition.applied);
      expect(used.state.tactical?.lastNarrative?.kind, PowerNarrativeKind.struck);
      expect(used.state.tactical?.lastNarrative?.attackerId, 'player-1');
      expect(used.state.tactical?.lastNarrative?.targetId, 'player-2');

      final ReducerResult defense = reducer.reduce(used.state, <String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.powerDefenseRequired,
        'messageId': 'd1',
        'matchId': 'match-abc',
        'serverSequence': 22,
        'serverTimestampMs': 101,
        'payload': <String, dynamic>{
          'attackId': 'atk-1',
          'attackerId': 'player-1',
          'targetId': 'player-2',
          'reflected': false,
          'defenseDeadlineAtMs': 5100,
        },
      });
      expect(defense.disposition, ReducerDisposition.applied);
      expect(defense.state.phase, MatchPhase.powerDefense);
      // Struck narrative preserved until reverse/resolve.
      expect(
        defense.state.tactical?.lastNarrative?.kind,
        PowerNarrativeKind.struck,
      );

      final ReducerResult reversed = reducer.reduce(defense.state, <String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.powerDefenseRequired,
        'messageId': 'd2',
        'matchId': 'match-abc',
        'serverSequence': 23,
        'serverTimestampMs': 102,
        'payload': <String, dynamic>{
          'attackId': 'atk-2',
          'attackerId': 'player-2',
          'targetId': 'player-1',
          'reflected': true,
          'defenseDeadlineAtMs': 10100,
        },
      });
      expect(reversed.disposition, ReducerDisposition.applied);
      expect(
        reversed.state.tactical?.lastNarrative?.kind,
        PowerNarrativeKind.reversed,
      );

      final ReducerResult resolved = reducer.reduce(reversed.state, <String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.powerResolved,
        'messageId': 'r1',
        'matchId': 'match-abc',
        'serverSequence': 24,
        'serverTimestampMs': 103,
        'payload': <String, dynamic>{
          'attackId': 'atk-2',
          'attackerId': 'player-2',
          'targetId': 'player-1',
          'outcome': 'reflected_shielded',
          'heartsDeltaTarget': 0,
          'heartsAfterTarget': 3,
          'statusAfterTarget': 'active',
        },
      });
      expect(resolved.disposition, ReducerDisposition.applied);
      expect(resolved.state.phase, MatchPhase.roundResult);
      expect(
        resolved.state.tactical?.lastNarrative?.kind,
        PowerNarrativeKind.shielded,
      );
    });

    test('match finished transitions to completed phase', () {
      final MatchViewState stateAtSeq12 = initialState(
        sequence: 12,
        playerId: 'player-1',
      );
      final Map<String, dynamic> raw = clone(
        fixtures['match_finished'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq12, raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.phase, MatchPhase.completed);
      expect(result.state.winnerId, 'player-1');
    });

    test('ACK without sequence does not advance serverSequence', () {
      final MatchViewState stateAtSeq5 = initialState(sequence: 5);
      final Map<String, dynamic> raw = clone(
        fixtures['challenge_submission_ack'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq5, raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.serverSequence, 5);
    });

    test('protocol error sets connectionError', () {
      final Map<String, dynamic> raw = clone(
        fixtures['protocol_error'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(initialState(), raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.connectionError, 'errors.match.not_found');
    });

    test('protocol error with commandId parses correctly', () {
      final Map<String, dynamic> raw = clone(
        fixtures['protocol_error_with_command_id'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(initialState(), raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.connectionError, 'errors.match.challenge_not_active');
    });

    test(
      'player presence does not invent competitive state for unknown players',
      () {
        final Map<String, dynamic> lobbyRaw = clone(
          fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
        );
        final ReducerResult lobbyResult = reducer.reduce(
          initialState(),
          lobbyRaw,
        );
        expect(lobbyResult.disposition, ReducerDisposition.applied);
        expect(lobbyResult.state.players.length, 2);

        final Map<String, dynamic> presenceRaw = clone(
          fixtures['player_presence'] as Map<String, dynamic>,
        );
        final ReducerResult presenceResult = reducer.reduce(
          lobbyResult.state,
          presenceRaw,
        );
        expect(presenceResult.disposition, ReducerDisposition.applied);
        expect(presenceResult.state.players.length, 2);
        expect(
          presenceResult.state.players.any(
            (PlayerPublic p) => p.playerId == 'player-3',
          ),
          isFalse,
        );
      },
    );

    test('player presence updates existing player connectivity only', () {
      final Map<String, dynamic> lobbyRaw = clone(
        fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
      );
      final MatchViewState lobby = reducer
          .reduce(initialState(), lobbyRaw)
          .state;
      final Map<String, dynamic> presenceRaw = clone(
        fixtures['player_presence'] as Map<String, dynamic>,
      );
      (presenceRaw['payload'] as Map<String, dynamic>)['playerId'] = 'player-2';
      (presenceRaw['payload'] as Map<String, dynamic>)['presence'] =
          'disconnected';
      (presenceRaw['payload'] as Map<String, dynamic>)['joined'] = false;

      final ReducerResult presenceResult = reducer.reduce(lobby, presenceRaw);
      expect(presenceResult.disposition, ReducerDisposition.applied);
      // Lobby disconnect frees the seat — do not keep a ghost row.
      expect(presenceResult.state.players.length, 1);
      expect(
        presenceResult.state.players.any(
          (PlayerPublic p) => p.playerId == 'player-2',
        ),
        isFalse,
      );
    });

    test('mid-match disconnect presence keeps the seat on the roster', () {
      final Map<String, dynamic> lobbyRaw = clone(
        fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
      );
      // Advance into challenge_active while keeping the two-player roster.
      (lobbyRaw['payload'] as Map<String, dynamic>)['phase'] = 'challenge_active';
      (lobbyRaw['payload'] as Map<String, dynamic>)['status'] =
          'challenge_active';
      lobbyRaw['serverSequence'] = 10;
      (lobbyRaw['payload'] as Map<String, dynamic>)['sequence'] = 10;
      (lobbyRaw['payload'] as Map<String, dynamic>)['revision'] = 10;

      final MatchViewState active = reducer
          .reduce(initialState(), lobbyRaw)
          .state;
      expect(active.phase, MatchPhase.challengeActive);
      expect(active.players.length, 2);

      final Map<String, dynamic> presenceRaw = clone(
        fixtures['player_presence'] as Map<String, dynamic>,
      );
      (presenceRaw['payload'] as Map<String, dynamic>)['playerId'] = 'player-2';
      (presenceRaw['payload'] as Map<String, dynamic>)['presence'] =
          'disconnected';
      (presenceRaw['payload'] as Map<String, dynamic>)['joined'] = false;
      presenceRaw['serverSequence'] = active.serverSequence + 1;

      final ReducerResult presenceResult = reducer.reduce(active, presenceRaw);
      expect(presenceResult.disposition, ReducerDisposition.applied);
      expect(presenceResult.state.players.length, 2);
      final PlayerPublic updated = presenceResult.state.players.firstWhere(
        (PlayerPublic p) => p.playerId == 'player-2',
      );
      expect(updated.presence, Presence.disconnected);
      expect(updated.status, PlayerStatus.active);
    });

    test('never rolls back sequence on older event', () {
      const MatchViewState stateAtSeq10 = MatchViewState(
        serverSequence: 10,
        phase: MatchPhase.challengeActive,
      );
      final Map<String, dynamic> raw = clone(
        fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq10, raw);
      expect(result.disposition, ReducerDisposition.ignored);
      expect(result.state.serverSequence, 10);
      expect(result.state.phase, MatchPhase.challengeActive);
    });

    test('consecutive sequenced event applies normally', () {
      final MatchViewState stateAtSeq10 = initialState(
        sequence: 10,
        playerId: 'player-1',
      );
      final Map<String, dynamic> raw = clone(
        fixtures['challenge_resolved'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq10, raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.requestSnapshot, isFalse);
      expect(result.state.serverSequence, 11);
      expect(result.state.phase, MatchPhase.roundResult);
    });

    test('duplicate sequenced event (equal) is ignored for non-snapshot', () {
      final MatchViewState stateAtSeq11 = initialState(
        sequence: 11,
        playerId: 'player-1',
      );
      final Map<String, dynamic> raw = clone(
        fixtures['challenge_resolved'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(stateAtSeq11, raw);
      expect(result.disposition, ReducerDisposition.ignored);
      expect(result.state.serverSequence, 11);
      expect(result.state.phase, MatchPhase.lobby);
    });

    test('unbound state accepts any matchId envelope', () {
      final MatchViewState unbound = initialState(sequence: -1);
      final Map<String, dynamic> raw = clone(
        fixtures['match_snapshot_lobby'] as Map<String, dynamic>,
      );
      final ReducerResult result = reducer.reduce(unbound, raw);
      expect(result.disposition, ReducerDisposition.applied);
      expect(result.state.matchId, 'match-abc');
      expect(result.state.serverSequence, 3);
    });

    test('bound match-scoped envelope without matchId is ignored', () {
      final MatchViewState bound = initialState(
        sequence: 3,
        matchId: 'match-abc',
      );
      final Map<String, dynamic> raw = clone(
        fixtures['challenge_started'] as Map<String, dynamic>,
      );
      raw.remove('matchId');
      raw['serverSequence'] = 4;
      final ReducerResult result = reducer.reduce(bound, raw);
      expect(result.disposition, ReducerDisposition.ignored);
      expect(result.state.serverSequence, 3);
      expect(result.state.currentChallenge, isNull);
    });

    test('wasApplied mirrors disposition', () {
      final ReducerResult applied = reducer.reduce(
        initialState(),
        clone(fixtures['match_snapshot_lobby'] as Map<String, dynamic>),
      );
      expect(applied.wasApplied, isTrue);

      final ReducerResult ignored = reducer.reduce(
        initialState(sequence: 5, matchId: 'match-abc'),
        clone(fixtures['match_snapshot_cross_match'] as Map<String, dynamic>),
      );
      expect(ignored.wasApplied, isFalse);
      expect(ignored.disposition, ReducerDisposition.ignored);
    });
  });
}
