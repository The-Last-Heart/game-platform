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
      expect(result.state.players[0].energy, 30);
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
      expect(result.state.players[0].energy, 30);
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
      final PlayerPublic updated = presenceResult.state.players.firstWhere(
        (PlayerPublic p) => p.playerId == 'player-2',
      );
      expect(updated.presence, Presence.disconnected);
      expect(updated.hearts, 3);
      expect(updated.energy, 0);
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
