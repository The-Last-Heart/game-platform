import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/session/match_session_controller.dart';
import 'package:game/features/match/session/session_store.dart';
import 'package:game/features/match/time/server_time_clock.dart';
import 'package:game/features/match/transport/fake_transport.dart';

/// Fake monotonic clock for deterministic tests.
class FakeMonotonicClock implements MonotonicClock {
  int _elapsed = 0;

  @override
  int elapsedMs() => _elapsed;

  void advance(int ms) {
    _elapsed += ms;
  }

  void set(int ms) {
    _elapsed = ms;
  }
}

void main() {
  group('ServerTimeClock', () {
    test('returns 0 before anchoring', () {
      final FakeMonotonicClock mono = FakeMonotonicClock();
      final ServerTimeClock clock = ServerTimeClock(clock: mono);
      expect(clock.estimateServerNowMs(), 0);
    });

    test('estimates server time using monotonic elapsed', () {
      final FakeMonotonicClock mono = FakeMonotonicClock();
      final ServerTimeClock clock = ServerTimeClock(clock: mono);

      mono.set(100);
      clock.anchor(1000000);
      expect(clock.estimateServerNowMs(), 1000000);

      mono.advance(500);
      expect(clock.estimateServerNowMs(), 1000500);

      mono.advance(1000);
      expect(clock.estimateServerNowMs(), 1001500);
    });

    test('re-anchoring updates estimate', () {
      final FakeMonotonicClock mono = FakeMonotonicClock();
      final ServerTimeClock clock = ServerTimeClock(clock: mono);

      mono.set(0);
      clock.anchor(1000000);
      mono.advance(100);
      expect(clock.estimateServerNowMs(), 1000100);

      // Re-anchor with a later server time.
      clock.anchor(1000200);
      expect(clock.estimateServerNowMs(), 1000200);

      mono.advance(50);
      expect(clock.estimateServerNowMs(), 1000250);
    });

    test('wall skew: monotonic clock is immune to system clock changes', () {
      final FakeMonotonicClock mono = FakeMonotonicClock();
      final ServerTimeClock clock = ServerTimeClock(clock: mono);

      mono.set(0);
      clock.anchor(5000);

      // Simulate 200ms passing monotonically — system clock does not matter.
      mono.advance(200);
      expect(clock.estimateServerNowMs(), 5200);
    });

    test(
      'backward-jump prevention: re-anchor does not increase remaining time',
      () {
        final FakeMonotonicClock mono = FakeMonotonicClock();
        final ServerTimeClock clock = ServerTimeClock(clock: mono);

        mono.set(0);
        clock.anchor(10000);
        clock.setActiveDeadline(15000);

        // After 3000ms, remaining = 15000 - 13000 = 2000.
        mono.advance(3000);
        expect(clock.estimateServerNowMs(), 13000);

        // Re-anchor with a server time that's behind (clock skew scenario).
        // If we anchored at 11000, remaining would be 15000 - 11000 = 4000,
        // which is more than the current 2000 → should be clamped.
        clock.anchor(11000);

        // Remaining should stay at 2000, not increase to 4000.
        final int estimated = clock.estimateServerNowMs();
        final int remaining = 15000 - estimated;
        expect(remaining, 2000);
      },
    );

    test('backward-jump allows decrease in remaining time', () {
      final FakeMonotonicClock mono = FakeMonotonicClock();
      final ServerTimeClock clock = ServerTimeClock(clock: mono);

      mono.set(0);
      clock.anchor(10000);
      clock.setActiveDeadline(15000);

      mono.advance(1000);
      // remaining = 15000 - 11000 = 4000
      expect(clock.estimateServerNowMs(), 11000);

      // Re-anchor with a time that's ahead (server corrects forward).
      // new remaining = 15000 - 13000 = 2000, which is less → OK.
      clock.anchor(13000);
      expect(clock.estimateServerNowMs(), 13000);
    });

    test('no active deadline: re-anchor always works', () {
      final FakeMonotonicClock mono = FakeMonotonicClock();
      final ServerTimeClock clock = ServerTimeClock(clock: mono);

      mono.set(0);
      clock.anchor(10000);

      mono.advance(3000);
      // Re-anchor with backward time — no deadline, so accepted.
      clock.anchor(11000);
      expect(clock.estimateServerNowMs(), 11000);
    });
  });

  group('ServerTimeClock via MatchSessionController', () {
    test('ACK does not re-anchor after snapshot anchor', () async {
      final FakeMonotonicClock mono = FakeMonotonicClock();
      final ServerTimeClock clock = ServerTimeClock(clock: mono);
      final FakeTransport transport = FakeTransport();
      final MemorySessionStore store = MemorySessionStore();
      final MatchSessionController controller = MatchSessionController(
        transport: transport,
        sessionStore: store,
        serverTimeClock: clock,
      );
      controller.init();

      await controller.startDevMatch();
      final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
      );
      transport.emitEvent(<String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.sessionAccepted,
        'messageId': 'sa-1',
        'matchId': 'match-1',
        'commandId': createCmd['commandId'],
        'payload': <String, dynamic>{'matchId': 'match-1', 'role': 'creator'},
      });
      await controller.idle;
      final Map<String, dynamic> joinCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchJoin,
      );
      transport.emitEvent(<String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.sessionAccepted,
        'messageId': 'sa-2',
        'matchId': 'match-1',
        'commandId': joinCmd['commandId'],
        'payload': <String, dynamic>{
          'matchId': 'match-1',
          'playerId': 'player-1',
          'resumeToken': 'tok-2',
        },
      });
      await controller.idle;
      transport.emitEvent(<String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.matchSnapshot,
        'messageId': 'snap-1',
        'matchId': 'match-1',
        'serverSequence': 1,
        'payload': <String, dynamic>{
          'matchId': 'match-1',
          'status': 'waiting',
          'phase': 'challenge_active',
          'phaseDeadlineAtMs': null,
          'roundNumber': 1,
          'serverNowMs': 9000000,
          'lastRoundResult': null,
          'nextPhaseAtMs': null,
          'revision': 1,
          'sequence': 1,
          'players': <Map<String, dynamic>>[
            <String, dynamic>{
              'playerId': 'player-1',
              'hearts': 3,
              'energy': 0,
              'status': 'active',
              'presence': 'connected',
              'submittedForCurrentChallenge': false,
            },
          ],
          'winnerId': null,
          'currentChallenge': <String, dynamic>{
            'challengeInstanceId': 'ch-1',
            'definitionId': 'def-1',
            'definitionVersion': 1,
            'engineId': 'reaction.wait_for_signal',
            'promptKey': 'challenge.wait_for_signal.waiting',
            'clientConfig': <String, dynamic>{},
            'serverNowMs': 9000000,
            'startsAtMs': 9000000,
            'deadlineAtMs': 9008000,
            'durationMs': 5000,
            'roundPhase': 'signal_active',
            'signalToken': 'tok',
            'signaledAtMs': 9001500,
          },
        },
      });
      await controller.idle;
      expect(clock.estimateServerNowMs(), 9000000);

      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      final String cmdId =
          transport.sentCommands.lastWhere(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchSubmitAnswer,
              )['commandId']
              as String;
      mono.advance(200);
      transport.emitEvent(<String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.challengeSubmissionAck,
        'messageId': 'ack-1',
        'matchId': 'match-1',
        'commandId': cmdId,
        'payload': <String, dynamic>{'accepted': true, 'duplicate': false},
      });
      await controller.idle;

      expect(clock.estimateServerNowMs(), 9000200);
      controller.dispose();
    });
  });
}
