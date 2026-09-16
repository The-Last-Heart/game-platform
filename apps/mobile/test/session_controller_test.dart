import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/session/match_session_controller.dart';
import 'package:game/features/match/session/session_store.dart';
import 'package:game/features/match/state/match_snapshot.dart';
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
}

/// Controllable store that can block or fail saves (LH-003C race coverage).
class DelayedSessionStore implements SessionStore {
  Completer<void>? block;
  bool failNext = false;
  SessionData? data;

  @override
  Future<void> save(SessionData d) async {
    if (block != null) {
      await block!.future;
    }
    if (failNext) {
      failNext = false;
      throw Exception('storage failed');
    }
    data = d;
  }

  @override
  Future<SessionData?> load() async => data;

  @override
  Future<void> clear() async {
    data = null;
  }
}

Map<String, dynamic> makeSessionAccepted({
  String matchId = 'match-1',
  String playerId = 'player-1',
  String resumeToken = 'tok-1',
  String? role,
  String? commandId,
  bool includePlayer = true,
  bool includeCommandId = true,
}) {
  return <String, dynamic>{
    'schemaVersion': '1',
    'type': MessageTypes.sessionAccepted,
    'messageId': 'msg-sa-${commandId ?? '1'}',
    'matchId': matchId,
    if (includeCommandId && commandId != null) 'commandId': commandId,
    'payload': <String, dynamic>{
      'matchId': matchId,
      if (includePlayer) 'playerId': playerId,
      if (includePlayer) 'resumeToken': resumeToken,
      if (role != null) 'role': role,
    },
  };
}

Map<String, dynamic> makePlayer({
  String playerId = 'player-1',
  bool submitted = false,
  String status = 'active',
}) {
  return <String, dynamic>{
    'playerId': playerId,
    'hearts': 3,
    'energy': 0,
    'status': status,
    'presence': 'connected',
    'submittedForCurrentChallenge': submitted,
  };
}

Map<String, dynamic> makeSnapshot({
  String matchId = 'match-1',
  int sequence = 1,
  String phase = 'lobby',
  int serverNowMs = 1700000000000,
  List<Map<String, dynamic>>? players,
  bool localSubmitted = false,
  Map<String, dynamic>? currentChallenge,
  String? winnerId,
  int? serverSequence,
  String? commandId,
  String status = 'waiting',
}) {
  return <String, dynamic>{
    'schemaVersion': '1',
    'type': MessageTypes.matchSnapshot,
    'messageId': 'msg-snap-$sequence',
    'matchId': matchId,
    'serverSequence': serverSequence ?? sequence,
    if (commandId != null) 'commandId': commandId,
    'payload': <String, dynamic>{
      'matchId': matchId,
      'status': status,
      'phase': phase,
      'phaseDeadlineAtMs': null,
      'roundNumber': 1,
      'serverNowMs': serverNowMs,
      'lastRoundResult': null,
      'nextPhaseAtMs': null,
      'revision': sequence < 1 ? 1 : sequence,
      'sequence': sequence,
      'players':
          players ??
          <Map<String, dynamic>>[
            makePlayer(playerId: 'player-1', submitted: localSubmitted),
          ],
      'winnerId': winnerId,
      'currentChallenge': currentChallenge,
    },
  };
}

Map<String, dynamic> makeActiveChallenge({
  String challengeInstanceId = 'ch-1',
  String engineId = 'reaction.wait_for_signal',
  int startsAtMs = 1700000000000,
  int deadlineAtMs = 1700000008000,
  int serverNowMs = 1700000000000,
  Map<String, dynamic>? clientConfig,
}) {
  return <String, dynamic>{
    'challengeInstanceId': challengeInstanceId,
    'definitionId': 'def-1',
    'definitionVersion': 1,
    'engineId': engineId,
    'promptKey': 'challenge.wait_for_signal.waiting',
    'clientConfig': clientConfig ??
        <String, dynamic>{
          'categoryKey': 'challenge.category.reaction',
          'waitingPromptKey': 'challenge.wait_for_signal.waiting',
          'waitingHintKey': 'challenge.wait_for_signal.waiting_hint',
          'activePromptKey': 'challenge.wait_for_signal.active',
          'actionKey': 'challenge.wait_for_signal.action',
        },
    'serverNowMs': serverNowMs,
    'startsAtMs': startsAtMs,
    'deadlineAtMs': deadlineAtMs,
    'durationMs': 5000,
    'roundPhase': 'signal_active',
    'signalToken': 'tok-signal',
    'signaledAtMs': startsAtMs + 1500,
    'signalEndsAtMs': startsAtMs + 2500,
  };
}

Map<String, dynamic> makeAck({
  String commandId = 'cmd-1',
  bool accepted = true,
  bool duplicate = false,
  String matchId = 'match-1',
}) {
  return <String, dynamic>{
    'schemaVersion': '1',
    'type': MessageTypes.challengeSubmissionAck,
    'messageId': 'msg-ack-1',
    'matchId': matchId,
    'commandId': commandId,
    'payload': <String, dynamic>{'accepted': accepted, 'duplicate': duplicate},
  };
}

Map<String, dynamic> makeProtocolError({
  String code = 'CHALLENGE_NOT_ACTIVE',
  String messageKey = 'errors.match.challenge_not_active',
  String? commandId,
}) {
  return <String, dynamic>{
    'schemaVersion': '1',
    'type': MessageTypes.protocolError,
    'messageId': 'msg-err-1',
    'payload': <String, dynamic>{
      'code': code,
      'messageKey': messageKey,
      if (commandId != null) 'commandId': commandId,
    },
  };
}

Map<String, dynamic> makeChallengeStarted({
  String matchId = 'match-1',
  int serverSequence = 2,
  int serverNowMs = 1700000003000,
  String challengeInstanceId = 'ch-1',
}) {
  return <String, dynamic>{
    'schemaVersion': '1',
    'type': MessageTypes.challengeStarted,
    'messageId': 'msg-started-$serverSequence',
    'matchId': matchId,
    'serverSequence': serverSequence,
    'payload': makeActiveChallenge(
      challengeInstanceId: challengeInstanceId,
      serverNowMs: serverNowMs,
    ),
  };
}

Map<String, dynamic> makeChallengeSignal({
  String matchId = 'match-1',
  int serverSequence = 3,
  int serverNowMs = 1700000004500,
  String challengeInstanceId = 'ch-1',
}) {
  return <String, dynamic>{
    'schemaVersion': '1',
    'type': MessageTypes.challengeSignal,
    'messageId': 'msg-signal-$serverSequence',
    'matchId': matchId,
    'serverSequence': serverSequence,
    'payload': <String, dynamic>{
      'challengeInstanceId': challengeInstanceId,
      'signalToken': 'tok-signal',
      'signaledAtMs': serverNowMs,
      'signalEndsAtMs': serverNowMs + 1000,
      'serverNowMs': serverNowMs,
    },
  };
}

Map<String, dynamic> makePresence({
  String matchId = 'match-1',
  int serverSequence = 2,
  String playerId = 'player-2',
}) {
  return <String, dynamic>{
    'schemaVersion': '1',
    'type': MessageTypes.playerPresence,
    'messageId': 'msg-presence-$serverSequence',
    'matchId': matchId,
    'serverSequence': serverSequence,
    'payload': <String, dynamic>{
      'playerId': playerId,
      'presence': 'connected',
      'joined': true,
    },
  };
}

Future<void> completeJoinHandshake(
  MatchSessionController c,
  FakeTransport t, {
  String matchId = 'match-1',
  String playerId = 'player-1',
  int snapshotSequence = 1,
  int serverNowMs = 1700000000000,
  String phase = 'lobby',
  Map<String, dynamic>? currentChallenge,
  bool localSubmitted = false,
}) async {
  await c.startDevMatch();
  await c.idle;
  final Map<String, dynamic> createCmd = t.sentCommands.lastWhere(
    (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
  );
  t.emitEvent(
    makeSessionAccepted(
      role: 'creator',
      matchId: matchId,
      commandId: createCmd['commandId'] as String,
      includePlayer: false,
    ),
  );
  await c.idle;
  final Map<String, dynamic> joinCmd = t.sentCommands.lastWhere(
    (Map<String, dynamic> e) => e['type'] == MessageTypes.matchJoin,
  );
  t.emitEvent(
    makeSessionAccepted(
      matchId: matchId,
      playerId: playerId,
      resumeToken: 'tok-2',
      commandId: joinCmd['commandId'] as String,
    ),
  );
  await c.idle;
  t.emitEvent(
    makeSnapshot(
      matchId: matchId,
      sequence: snapshotSequence,
      serverNowMs: serverNowMs,
      phase: phase,
      currentChallenge: currentChallenge,
      localSubmitted: localSubmitted,
      players: <Map<String, dynamic>>[
        makePlayer(playerId: playerId, submitted: localSubmitted),
      ],
    ),
  );
  await c.idle;
}

Future<void> completeResumeHandshake(
  MatchSessionController c,
  FakeTransport t, {
  String matchId = 'match-1',
  String playerId = 'player-1',
  String resumeToken = 'tok-rotated',
  int snapshotSequence = 5,
  int serverNowMs = 1700000002000,
  String phase = 'lobby',
  Map<String, dynamic>? currentChallenge,
  bool localSubmitted = false,
}) async {
  await c.idle;
  final Map<String, dynamic> resumeCmd = t.sentCommands.lastWhere(
    (Map<String, dynamic> e) => e['type'] == MessageTypes.matchResume,
  );
  t.emitEvent(
    makeSessionAccepted(
      matchId: matchId,
      playerId: playerId,
      resumeToken: resumeToken,
      commandId: resumeCmd['commandId'] as String,
    ),
  );
  await c.idle;
  t.emitEvent(
    makeSnapshot(
      matchId: matchId,
      sequence: snapshotSequence,
      serverNowMs: serverNowMs,
      phase: phase,
      currentChallenge: currentChallenge,
      localSubmitted: localSubmitted,
      players: <Map<String, dynamic>>[
        makePlayer(playerId: playerId, submitted: localSubmitted),
      ],
    ),
  );
  await c.idle;
}

void main() {
  late FakeTransport transport;
  late MemorySessionStore store;
  late MatchSessionController controller;

  setUp(() {
    transport = FakeTransport();
    store = MemorySessionStore();
    controller = MatchSessionController(
      transport: transport,
      sessionStore: store,
    );
    controller.init();
  });

  tearDown(() {
    controller.dispose();
  });

  group('MatchSessionController LH-003C', () {
    test('init() is guarded against re-entry', () {
      controller.init();
    });

    test('startDevMatch connects and sends create_dev', () async {
      await controller.startDevMatch();
      expect(transport.isConnected, isTrue);
      expect(transport.sentCommands.first['type'], MessageTypes.matchCreateDev);
      expect(controller.state.value.lifecycle, SessionLifecycle.connecting);
      expect(controller.state.value.inMatch, isFalse);
    });

    test('startDevMatch sets lifecycle to disconnected on failure', () async {
      transport.connectShouldFail = true;
      await controller.startDevMatch();
      expect(controller.state.value.lifecycle, SessionLifecycle.disconnected);
      expect(controller.state.value.connectionError, isNotNull);
    });

    test(
      'join handshake: creator accept → join → player accept → snapshot binds',
      () async {
        await completeJoinHandshake(controller, transport);
        expect(controller.state.value.lifecycle, SessionLifecycle.bound);
        expect(controller.state.value.inMatch, isTrue);
        expect(controller.state.value.playerId, 'player-1');
        expect(controller.state.value.matchId, 'match-1');
        final SessionData? data = await store.load();
        expect(data!.resumeToken, 'tok-2');
        expect(data.pendingResumeCommandId, isNull);
        expect(
          transport.sentCommands.any(
            (Map<String, dynamic> c) =>
                c['type'] == MessageTypes.matchFillDevBots,
          ),
          isTrue,
        );
      },
    );

    test(
      'creator accept without credentials does not persist session',
      () async {
        await controller.startDevMatch();
        final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
          (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
        );
        transport.emitEvent(
          makeSessionAccepted(
            role: 'creator',
            commandId: createCmd['commandId'] as String,
            includePlayer: false,
          ),
        );
        await controller.idle;
        expect(await store.load(), isNull);
        expect(controller.state.value.lifecycle, SessionLifecycle.connecting);
        expect(controller.state.value.inMatch, isFalse);
        expect(controller.state.value.playerId, isNull);
        expect(controller.state.value.matchId, isNull);
        expect(
          transport.sentCommands.any(
            (Map<String, dynamic> c) => c['type'] == MessageTypes.matchJoin,
          ),
          isTrue,
        );
      },
    );

    test('mismatched create commandId does not advance handshake', () async {
      await controller.startDevMatch();
      transport.emitEvent(
        makeSessionAccepted(
          role: 'creator',
          commandId: 'wrong-command',
          includePlayer: false,
        ),
      );
      await controller.idle;
      expect(
        transport.sentCommands.any(
          (Map<String, dynamic> c) => c['type'] == MessageTypes.matchJoin,
        ),
        isFalse,
      );
      expect(await store.load(), isNull);
      expect(controller.state.value.matchId, isNull);
    });

    test('missing commandId cannot mutate identity', () async {
      await controller.startDevMatch();
      final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
      );
      transport.emitEvent(
        makeSessionAccepted(
          role: 'creator',
          commandId: createCmd['commandId'] as String,
          includePlayer: false,
          includeCommandId: false,
        ),
      );
      await controller.idle;
      expect(
        transport.sentCommands.any(
          (Map<String, dynamic> c) => c['type'] == MessageTypes.matchJoin,
        ),
        isFalse,
      );
      expect(controller.state.value.matchId, isNull);
      expect(controller.state.value.playerId, isNull);

      // Later valid acceptance still works (not poisoned).
      transport.emitEvent(
        makeSessionAccepted(
          role: 'creator',
          commandId: createCmd['commandId'] as String,
          includePlayer: false,
        ),
      );
      await controller.idle;
      expect(
        transport.sentCommands.any(
          (Map<String, dynamic> c) => c['type'] == MessageTypes.matchJoin,
        ),
        isTrue,
      );
    });

    test('wrong join commandId cannot mutate identity', () async {
      await controller.startDevMatch();
      final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
      );
      transport.emitEvent(
        makeSessionAccepted(
          role: 'creator',
          commandId: createCmd['commandId'] as String,
          includePlayer: false,
        ),
      );
      await controller.idle;
      transport.emitEvent(
        makeSessionAccepted(
          playerId: 'evil-player',
          resumeToken: 'evil-tok',
          commandId: 'wrong-join-cmd',
        ),
      );
      await controller.idle;
      expect(await store.load(), isNull);
      expect(controller.state.value.playerId, isNull);
      expect(controller.state.value.matchId, isNull);
      expect(controller.state.value.lifecycle, isNot(SessionLifecycle.bound));
    });

    test(
      'snapshot before player accept does not bind or set identity',
      () async {
        await controller.startDevMatch();
        final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
          (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
        );
        transport.emitEvent(
          makeSessionAccepted(
            role: 'creator',
            commandId: createCmd['commandId'] as String,
            includePlayer: false,
          ),
        );
        await controller.idle;
        transport.emitEvent(makeSnapshot());
        await controller.idle;
        expect(controller.state.value.lifecycle, isNot(SessionLifecycle.bound));
        expect(controller.state.value.inMatch, isFalse);
        expect(controller.state.value.matchId, isNull);
        expect(controller.state.value.playerId, isNull);
      },
    );

    test('snapshot without local player does not bind', () async {
      await controller.startDevMatch();
      final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
      );
      transport.emitEvent(
        makeSessionAccepted(
          role: 'creator',
          commandId: createCmd['commandId'] as String,
          includePlayer: false,
        ),
      );
      await controller.idle;
      final Map<String, dynamic> joinCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchJoin,
      );
      transport.emitEvent(
        makeSessionAccepted(
          playerId: 'player-1',
          resumeToken: 'tok-2',
          commandId: joinCmd['commandId'] as String,
        ),
      );
      await controller.idle;
      transport.emitEvent(
        makeSnapshot(
          players: <Map<String, dynamic>>[makePlayer(playerId: 'other-player')],
        ),
      );
      await controller.idle;
      expect(controller.state.value.lifecycle, isNot(SessionLifecycle.bound));
      expect(controller.state.value.inMatch, isFalse);
    });

    test(
      'DelayedSessionStore: back-to-back accepted+snapshot binds after unblock',
      () async {
        final DelayedSessionStore delayed = DelayedSessionStore();
        final FakeTransport t = FakeTransport();
        final MatchSessionController c = MatchSessionController(
          transport: t,
          sessionStore: delayed,
        );
        c.init();

        await c.startDevMatch();
        await c.idle;
        final Map<String, dynamic> createCmd = t.sentCommands.lastWhere(
          (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
        );
        t.emitEvent(
          makeSessionAccepted(
            role: 'creator',
            commandId: createCmd['commandId'] as String,
            includePlayer: false,
          ),
        );
        await c.idle;
        final Map<String, dynamic> joinCmd = t.sentCommands.lastWhere(
          (Map<String, dynamic> e) => e['type'] == MessageTypes.matchJoin,
        );

        delayed.block = Completer<void>();
        // Back-to-back — no Duration.zero between accept and snapshot.
        t.emitEvent(
          makeSessionAccepted(
            playerId: 'player-1',
            resumeToken: 'tok-2',
            commandId: joinCmd['commandId'] as String,
          ),
        );
        t.emitEvent(makeSnapshot());

        // Snapshot must not bind while save is blocked.
        await Future<void>.delayed(Duration.zero);
        expect(c.state.value.lifecycle, isNot(SessionLifecycle.bound));
        expect(c.state.value.playerId, isNull);

        delayed.block!.complete();
        await c.idle;

        expect(c.state.value.lifecycle, SessionLifecycle.bound);
        expect(c.state.value.inMatch, isTrue);
        expect(c.state.value.playerId, 'player-1');
        expect(delayed.data!.resumeToken, 'tok-2');
        c.dispose();
      },
    );

    test('DelayedSessionStore: snapshot while blocked cannot bind', () async {
      final DelayedSessionStore delayed = DelayedSessionStore();
      final FakeTransport t = FakeTransport();
      final MatchSessionController c = MatchSessionController(
        transport: t,
        sessionStore: delayed,
      );
      c.init();

      await c.startDevMatch();
      await c.idle;
      final Map<String, dynamic> createCmd = t.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
      );
      t.emitEvent(
        makeSessionAccepted(
          role: 'creator',
          commandId: createCmd['commandId'] as String,
          includePlayer: false,
        ),
      );
      await c.idle;
      final Map<String, dynamic> joinCmd = t.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchJoin,
      );

      delayed.block = Completer<void>();
      t.emitEvent(
        makeSessionAccepted(
          playerId: 'player-1',
          resumeToken: 'tok-2',
          commandId: joinCmd['commandId'] as String,
        ),
      );
      t.emitEvent(makeSnapshot());
      await Future<void>.delayed(const Duration(milliseconds: 5));
      expect(c.state.value.lifecycle, isNot(SessionLifecycle.bound));
      expect(delayed.data, isNull);

      // Cancel without completing: leave blocked, dispose cleanly.
      delayed.block!.complete();
      await c.idle;
      c.dispose();
    });

    test('DelayedSessionStore: storage failure is handled safely', () async {
      final DelayedSessionStore delayed = DelayedSessionStore();
      final FakeTransport t = FakeTransport();
      final MatchSessionController c = MatchSessionController(
        transport: t,
        sessionStore: delayed,
      );
      c.init();

      await c.startDevMatch();
      await c.idle;
      final Map<String, dynamic> createCmd = t.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
      );
      t.emitEvent(
        makeSessionAccepted(
          role: 'creator',
          commandId: createCmd['commandId'] as String,
          includePlayer: false,
        ),
      );
      await c.idle;
      final Map<String, dynamic> joinCmd = t.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchJoin,
      );

      delayed.failNext = true;
      t.emitEvent(
        makeSessionAccepted(
          playerId: 'player-1',
          resumeToken: 'tok-2',
          commandId: joinCmd['commandId'] as String,
        ),
      );
      t.emitEvent(makeSnapshot());
      await c.idle;

      expect(c.state.value.lifecycle, isNot(SessionLifecycle.bound));
      expect(c.state.value.playerId, isNull);
      expect(c.state.value.matchId, isNull);
      expect(c.state.value.inMatch, isFalse);
      expect(c.state.value.connectionError, contains('storage failed'));
      expect(delayed.data, isNull);
      c.dispose();
    });

    test('commands use unique secure random IDs', () async {
      await completeJoinHandshake(controller, transport);
      final Set<String> commandIds = <String>{};
      final Set<String> messageIds = <String>{};
      for (final Map<String, dynamic> cmd in transport.sentCommands) {
        final String cmdId = cmd['commandId'] as String;
        final String msgId = cmd['messageId'] as String;
        expect(cmdId.length, 32);
        expect(msgId.length, 32);
        commandIds.add(cmdId);
        messageIds.add(msgId);
      }
      expect(commandIds.length, transport.sentCommands.length);
      expect(messageIds.length, transport.sentCommands.length);
    });

    test('UUID uniqueness across generators', () {
      expect(generateSecureId(), isNot(equals(generateSecureId())));
    });

    test('cold resume: bootstrap loads store and resumes once', () async {
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'tok-resume',
        ),
      );
      await controller.tryResume();
      await controller.idle;
      expect(transport.isConnected, isTrue);
      expect(controller.state.value.lifecycle, SessionLifecycle.resuming);
      final List<Map<String, dynamic>> resumes = transport.sentCommands
          .where(
            (Map<String, dynamic> c) => c['type'] == MessageTypes.matchResume,
          )
          .toList();
      expect(resumes, hasLength(1));
      expect(
        (resumes.first['payload'] as Map<String, dynamic>)['resumeToken'],
        'tok-resume',
      );
      final SessionData? data = await store.load();
      expect(data!.pendingResumeCommandId, resumes.first['commandId']);
    });

    test('cold start bootstrap clears prior match session', () async {
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'tok-resume',
        ),
      );
      await controller.bootstrap();
      await controller.idle;
      expect(await store.load(), isNull);
      expect(controller.state.value.inMatch, isFalse);
      expect(
        transport.sentCommands.any(
          (Map<String, dynamic> c) => c['type'] == MessageTypes.matchResume,
        ),
        isFalse,
      );
    });

    test(
      'cold resume: accepted + snapshot → bound and clears pending command',
      () async {
        await store.save(
          const SessionData(
            matchId: 'match-1',
            playerId: 'player-1',
            resumeToken: 'tok-resume',
          ),
        );
        await controller.tryResume();
        await controller.idle;
        await completeResumeHandshake(controller, transport);
        expect(controller.state.value.lifecycle, SessionLifecycle.bound);
        expect(controller.state.value.inMatch, isTrue);
        final SessionData? data = await store.load();
        expect(data!.resumeToken, 'tok-rotated');
        expect(data.pendingResumeCommandId, isNull);
      },
    );

    test('rejected resume clears session only when correlated', () async {
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'tok-expired',
        ),
      );
      await controller.tryResume();
      await controller.idle;
      final Map<String, dynamic> resumeCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> c) => c['type'] == MessageTypes.matchResume,
      );
      transport.emitEvent(
        makeProtocolError(
          code: 'UNAUTHORIZED',
          messageKey: 'errors.protocol.unauthorized',
          commandId: resumeCmd['commandId'] as String,
        ),
      );
      await controller.idle;
      expect(controller.state.value.lifecycle, SessionLifecycle.disconnected);
      expect(controller.state.value.matchId, isNull);
      expect(controller.state.value.inMatch, isFalse);
      expect(await store.load(), isNull);
    });

    test(
      'fill_dev_bots only during initial dev start, never on resume',
      () async {
        await store.save(
          const SessionData(
            matchId: 'match-1',
            playerId: 'player-1',
            resumeToken: 'tok-1',
          ),
        );
        await controller.tryResume();
        await controller.idle;
        await completeResumeHandshake(controller, transport);
        expect(
          transport.sentCommands.any(
            (Map<String, dynamic> c) =>
                c['type'] == MessageTypes.matchFillDevBots,
          ),
          isFalse,
        );
      },
    );

    test(
      'exactly one match.resume per connect; same commandId on reconnect',
      () async {
        await completeJoinHandshake(controller, transport);
        transport.simulateDisconnect();
        await controller.idle;
        expect(controller.state.value.lifecycle, SessionLifecycle.resuming);
        expect(controller.state.value.inMatch, isTrue);

        transport.simulateReconnect();
        await controller.idle;
        final List<Map<String, dynamic>> firstWave = transport.sentCommands
            .where(
              (Map<String, dynamic> c) => c['type'] == MessageTypes.matchResume,
            )
            .toList();
        expect(firstWave, hasLength(1));
        final String cmdId = firstWave.first['commandId'] as String;
        expect((await store.load())!.pendingResumeCommandId, cmdId);

        // Extra connection-state true must not send a second resume.
        transport.simulateReconnect();
        await controller.idle;
        expect(
          transport.sentCommands
              .where(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchResume,
              )
              .length,
          1,
        );

        transport.simulateDisconnect();
        await controller.idle;
        transport.simulateReconnect();
        await controller.idle;
        final List<Map<String, dynamic>> resumes = transport.sentCommands
            .where(
              (Map<String, dynamic> c) => c['type'] == MessageTypes.matchResume,
            )
            .toList();
        expect(resumes, hasLength(2));
        expect(resumes[0]['commandId'], cmdId);
        expect(resumes[1]['commandId'], cmdId);
      },
    );

    test(
      'disconnect during create clears _devMatchStarting for retry',
      () async {
        await controller.startDevMatch();
        expect(controller.state.value.lifecycle, SessionLifecycle.connecting);
        transport.simulateDisconnect();
        await controller.idle;
        expect(controller.state.value.lifecycle, SessionLifecycle.disconnected);
        expect(controller.state.value.canRetry, isTrue);
        expect(controller.state.value.inMatch, isFalse);

        transport.sentCommands.clear();
        await controller.startDevMatch();
        expect(
          transport.sentCommands.first['type'],
          MessageTypes.matchCreateDev,
        );
        expect(controller.state.value.lifecycle, SessionLifecycle.connecting);
      },
    );

    test('disconnect during join before credentials is retryable', () async {
      await controller.startDevMatch();
      final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
      );
      transport.emitEvent(
        makeSessionAccepted(
          role: 'creator',
          commandId: createCmd['commandId'] as String,
          includePlayer: false,
        ),
      );
      await controller.idle;
      transport.simulateDisconnect();
      await controller.idle;
      expect(controller.state.value.lifecycle, SessionLifecycle.disconnected);
      expect(controller.state.value.canRetry, isTrue);
      expect(await store.load(), isNull);

      transport.sentCommands.clear();
      await controller.startDevMatch();
      expect(transport.sentCommands.first['type'], MessageTypes.matchCreateDev);
    });

    test(
      'disconnect after token persistence before snapshot enters resuming',
      () async {
        await controller.startDevMatch();
        await controller.idle;
        final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
          (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
        );
        transport.emitEvent(
          makeSessionAccepted(
            role: 'creator',
            commandId: createCmd['commandId'] as String,
            includePlayer: false,
          ),
        );
        await controller.idle;
        final Map<String, dynamic> joinCmd = transport.sentCommands.lastWhere(
          (Map<String, dynamic> e) => e['type'] == MessageTypes.matchJoin,
        );
        transport.emitEvent(
          makeSessionAccepted(
            playerId: 'player-1',
            resumeToken: 'tok-2',
            commandId: joinCmd['commandId'] as String,
          ),
        );
        await controller.idle;
        expect(await store.load(), isNotNull);
        expect(controller.state.value.lifecycle, isNot(SessionLifecycle.bound));

        transport.simulateDisconnect();
        await controller.idle;
        expect(controller.state.value.lifecycle, SessionLifecycle.resuming);
        expect(controller.state.value.inMatch, isFalse);

        transport.simulateReconnect();
        await controller.idle;
        expect(
          transport.sentCommands
              .where(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchResume,
              )
              .length,
          1,
        );
      },
    );

    test(
      'stale snapshot after bind does not re-bind or request side effects',
      () async {
        final FakeMonotonicClock mono = FakeMonotonicClock();
        final ServerTimeClock clock = ServerTimeClock(clock: mono);
        final FakeTransport localTransport = FakeTransport();
        final MemorySessionStore localStore = MemorySessionStore();
        final MatchSessionController c = MatchSessionController(
          transport: localTransport,
          sessionStore: localStore,
          serverTimeClock: clock,
        );
        c.init();
        await completeJoinHandshake(
          c,
          localTransport,
          snapshotSequence: 5,
          serverNowMs: 1700000005000,
        );
        final int estimatedBefore = clock.estimateServerNowMs();
        localTransport.emitEvent(
          makeSnapshot(sequence: 2, serverNowMs: 1700000009999),
        );
        await c.idle;
        expect(c.state.value.serverSequence, 5);
        expect(clock.estimateServerNowMs(), estimatedBefore);
        expect(c.state.value.lifecycle, SessionLifecycle.bound);
        c.dispose();
      },
    );

    test(
      'cross-match snapshot is ignored and does not change binding',
      () async {
        await completeJoinHandshake(controller, transport);
        transport.emitEvent(makeSnapshot(matchId: 'match-OTHER', sequence: 99));
        await controller.idle;
        expect(controller.state.value.matchId, 'match-1');
        expect(controller.state.value.lifecycle, SessionLifecycle.bound);
      },
    );

    test('sequence gap requests snapshot without applying event', () async {
      final FakeMonotonicClock mono = FakeMonotonicClock();
      final ServerTimeClock clock = ServerTimeClock(clock: mono);
      final FakeTransport localTransport = FakeTransport();
      final MemorySessionStore localStore = MemorySessionStore();
      final MatchSessionController c = MatchSessionController(
        transport: localTransport,
        sessionStore: localStore,
        serverTimeClock: clock,
      );
      c.init();

      await completeJoinHandshake(
        c,
        localTransport,
        snapshotSequence: 1,
        serverNowMs: 1700000000000,
      );
      final int estimatedBefore = clock.estimateServerNowMs();
      localTransport.sentCommands.clear();
      localTransport.emitEvent(
        makeChallengeStarted(serverSequence: 5, serverNowMs: 999999999),
      );
      await c.idle;
      expect(c.state.value.currentChallenge, isNull);
      expect(c.state.value.serverSequence, 1);
      expect(
        localTransport.sentCommands.any(
          (Map<String, dynamic> cmd) =>
              cmd['type'] == MessageTypes.matchRequestSnapshot,
        ),
        isTrue,
      );
      expect(clock.estimateServerNowMs(), estimatedBefore);
      c.dispose();
    });

    test('snapshot gap: controlled recovery retries with backoff', () async {
      final FakeTransport t = FakeTransport();
      final MemorySessionStore s = MemorySessionStore();
      final MatchSessionController c = MatchSessionController(
        transport: t,
        sessionStore: s,
        snapshotRetryDelay: const Duration(milliseconds: 30),
        snapshotRetryDelayForAttempt: (_) => const Duration(milliseconds: 30),
      );
      c.init();

      await completeJoinHandshake(c, t, snapshotSequence: 1);
      t.sentCommands.clear();
      t.emitEvent(makeChallengeStarted(serverSequence: 5));
      await c.idle;
      t.emitEvent(makeChallengeStarted(serverSequence: 6));
      await c.idle;

      final List<Map<String, dynamic>> snapReqs = t.sentCommands
          .where(
            (Map<String, dynamic> cmd) =>
                cmd['type'] == MessageTypes.matchRequestSnapshot,
          )
          .toList();
      expect(snapReqs, hasLength(1));
      final String firstId = snapReqs.first['commandId'] as String;

      // Unrelated ACK must not clear recovery.
      t.emitEvent(makeAck(commandId: 'unrelated'));
      await c.idle;
      expect(
        t.sentCommands
            .where(
              (Map<String, dynamic> cmd) =>
                  cmd['type'] == MessageTypes.matchRequestSnapshot,
            )
            .length,
        1,
      );

      await Future<void>.delayed(const Duration(milliseconds: 45));
      await c.idle;

      final List<Map<String, dynamic>> afterRetry = t.sentCommands
          .where(
            (Map<String, dynamic> cmd) =>
                cmd['type'] == MessageTypes.matchRequestSnapshot,
          )
          .toList();
      expect(afterRetry, hasLength(2));
      expect(afterRetry[1]['commandId'], isNot(equals(firstId)));

      // Convergent snapshot clears further retries.
      t.emitEvent(makeSnapshot(sequence: 6));
      await c.idle;
      await Future<void>.delayed(const Duration(milliseconds: 45));
      await c.idle;
      expect(
        t.sentCommands
            .where(
              (Map<String, dynamic> cmd) =>
                  cmd['type'] == MessageTypes.matchRequestSnapshot,
            )
            .length,
        2,
      );
      expect(c.state.value.needsSnapshot, isFalse);

      c.dispose();
    });

    test(
      'correlated protocol error clears snapshot in-flight for retry',
      () async {
        final FakeTransport t = FakeTransport();
        final MemorySessionStore s = MemorySessionStore();
        final MatchSessionController c = MatchSessionController(
          transport: t,
          sessionStore: s,
          snapshotRetryDelayForAttempt: (_) => const Duration(milliseconds: 25),
        );
        c.init();
        await completeJoinHandshake(c, t);
        t.sentCommands.clear();
        t.emitEvent(makeChallengeStarted(serverSequence: 5));
        await c.idle;
        final Map<String, dynamic> snapReq = t.sentCommands.lastWhere(
          (Map<String, dynamic> cmd) =>
              cmd['type'] == MessageTypes.matchRequestSnapshot,
        );
        final String snapCmdId = snapReq['commandId'] as String;

        t.sentCommands.clear();
        t.emitEvent(
          makeProtocolError(code: 'INTERNAL_ERROR', commandId: snapCmdId),
        );
        await c.idle;
        expect(c.state.value.needsSnapshot, isTrue);
        expect(c.snapshotRequestCommandIdForTest, isNull);

        // Transient error re-arms recovery without another server event.
        await Future<void>.delayed(const Duration(milliseconds: 40));
        await c.idle;
        expect(
          t.sentCommands.any(
            (Map<String, dynamic> cmd) =>
                cmd['type'] == MessageTypes.matchRequestSnapshot,
          ),
          isTrue,
        );
        c.dispose();
      },
    );

    test('completed snapshot enters terminal lifecycle', () async {
      await completeJoinHandshake(controller, transport);
      transport.emitEvent(
        makeSnapshot(sequence: 10, phase: 'completed', winnerId: 'player-1'),
      );
      await controller.idle;
      expect(controller.state.value.lifecycle, SessionLifecycle.terminal);
      expect(controller.state.value.phase, MatchPhase.completed);
      expect(controller.state.value.inMatch, isTrue);

      transport.simulateDisconnect();
      await controller.idle;
      expect(controller.state.value.lifecycle, SessionLifecycle.terminal);
      expect(
        transport.sentCommands.any(
          (Map<String, dynamic> c) => c['type'] == MessageTypes.matchResume,
        ),
        isFalse,
      );
    });

    test('halted snapshot enters terminal lifecycle', () async {
      await completeJoinHandshake(controller, transport);
      transport.emitEvent(makeSnapshot(sequence: 8, phase: 'halted'));
      await controller.idle;
      expect(controller.state.value.lifecycle, SessionLifecycle.terminal);
      expect(controller.state.value.phase, MatchPhase.halted);
    });

    test(
      'training.retry after round_result applies low-seq snapshot for new match',
      () async {
        await completeJoinHandshake(controller, transport);
        transport.emitEvent(
          makeSnapshot(
            sequence: 8,
            phase: 'round_result',
            players: <Map<String, dynamic>>[
              makePlayer(playerId: 'player-1'),
            ],
          ),
        );
        await controller.idle;
        // Force training mode + failure chrome the way a live fail ends.
        controller.state.value = controller.state.value.copyWith(
          mode: () => MatchMode.training,
          phase: MatchPhase.roundResult,
          lifecycle: SessionLifecycle.bound,
          lastRoundResult: () => const LastRoundResult(
            challengeInstanceId: 'ch-fail',
            resolutions: <PlayerChallengeResolution>[
              PlayerChallengeResolution(
                playerId: 'player-1',
                outcome: 'timeout',
                heartsDelta: -1,
                energyDelta: 0,
                heartsAfter: 2,
                energyAfter: 0,
                statusAfter: PlayerStatus.active,
              ),
            ],
          ),
          serverSequence: 8,
        );
        expect(controller.state.value.phase, MatchPhase.roundResult);
        expect(controller.state.value.lastRoundResult, isNotNull);

        await controller.retryTraining();
        await controller.idle;
        expect(controller.state.value.phase, MatchPhase.lobby);
        expect(controller.state.value.lastRoundResult, isNull);

        final Map<String, dynamic> retryCmd = transport.sentCommands.lastWhere(
          (Map<String, dynamic> c) => c['type'] == MessageTypes.trainingRetry,
        );
        transport.emitEvent(
          makeSessionAccepted(
            matchId: 'match-retry',
            playerId: 'player-retry',
            resumeToken: 'tok-round-retry',
            commandId: retryCmd['commandId'] as String,
          ),
        );
        await controller.idle;
        expect(controller.state.value.matchId, 'match-retry');
        expect(controller.state.value.serverSequence, -1);

        transport.emitEvent(
          makeSnapshot(
            matchId: 'match-retry',
            sequence: 1,
            phase: 'ready_countdown',
            players: <Map<String, dynamic>>[
              makePlayer(playerId: 'player-retry'),
            ],
          ),
        );
        await controller.idle;

        expect(controller.state.value.phase, MatchPhase.readyCountdown);
        expect(controller.state.value.lifecycle, SessionLifecycle.bound);
        expect(controller.state.value.lastRoundResult, isNull);
      },
    );

    test(
      'training.retry after completed applies low-seq snapshot for new match',
      () async {
        await completeJoinHandshake(controller, transport);
        transport.emitEvent(
          makeSnapshot(
            sequence: 12,
            phase: 'completed',
            winnerId: 'player-1',
          ),
        );
        await controller.idle;
        expect(controller.state.value.lifecycle, SessionLifecycle.terminal);
        expect(controller.state.value.serverSequence, 12);

        await controller.retryTraining();
        await controller.idle;
        final Map<String, dynamic> retryCmd = transport.sentCommands.lastWhere(
          (Map<String, dynamic> c) => c['type'] == MessageTypes.trainingRetry,
        );

        transport.emitEvent(
          makeSessionAccepted(
            matchId: 'match-2',
            playerId: 'player-2',
            resumeToken: 'tok-retry',
            commandId: retryCmd['commandId'] as String,
          ),
        );
        await controller.idle;
        expect(controller.state.value.matchId, 'match-2');
        expect(controller.state.value.serverSequence, -1);

        transport.emitEvent(
          makeSnapshot(
            matchId: 'match-2',
            sequence: 1,
            phase: 'ready_countdown',
            players: <Map<String, dynamic>>[
              makePlayer(playerId: 'player-2'),
            ],
          ),
        );
        await controller.idle;

        expect(controller.state.value.phase, MatchPhase.readyCountdown);
        expect(controller.state.value.lifecycle, SessionLifecycle.bound);
        expect(controller.state.value.serverSequence, 1);
        expect(controller.state.value.inMatch, isTrue);
        expect(controller.state.value.winnerId, isNull);
      },
    );

    test(
      'training.restart after round_result sends restart command',
      () async {
        await completeJoinHandshake(controller, transport);
        controller.state.value = controller.state.value.copyWith(
          mode: () => MatchMode.training,
          phase: MatchPhase.roundResult,
          lifecycle: SessionLifecycle.bound,
          lastRoundResult: () => const LastRoundResult(
            challengeInstanceId: 'ch-fail',
            resolutions: <PlayerChallengeResolution>[
              PlayerChallengeResolution(
                playerId: 'player-1',
                outcome: 'timeout',
                heartsDelta: -1,
                energyDelta: 0,
                heartsAfter: 0,
                energyAfter: 0,
                statusAfter: PlayerStatus.spectator,
              ),
            ],
          ),
          serverSequence: 8,
        );

        await controller.restartTraining();
        await controller.idle;
        expect(controller.state.value.phase, MatchPhase.lobby);
        expect(
          transport.sentCommands.any(
            (Map<String, dynamic> c) =>
                c['type'] == MessageTypes.trainingRestart,
          ),
          isTrue,
        );
      },
    );

    test('terminal resume: completed snapshot after reconnect', () async {
      await completeJoinHandshake(controller, transport);
      transport.simulateDisconnect();
      await controller.idle;
      transport.simulateReconnect();
      await controller.idle;
      await completeResumeHandshake(
        controller,
        transport,
        phase: 'completed',
        snapshotSequence: 20,
      );
      expect(controller.state.value.phase, MatchPhase.completed);
      expect(controller.state.value.lifecycle, SessionLifecycle.terminal);
      transport.simulateDisconnect();
      await controller.idle;
      expect(controller.state.value.lifecycle, SessionLifecycle.terminal);
      expect(
        transport.sentCommands
            .where(
              (Map<String, dynamic> c) => c['type'] == MessageTypes.matchResume,
            )
            .length,
        1,
      );
    });

    test('submitAnswer blocked until bound', () async {
      await controller.startDevMatch();
      controller.submitAnswer('ch-1', <String, dynamic>{'x': 1});
      expect(
        transport.sentCommands.any(
          (Map<String, dynamic> c) =>
              c['type'] == MessageTypes.matchSubmitAnswer,
        ),
        isFalse,
      );
    });

    test('submitAnswer pending → confirmed on accepted ACK', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
      );
      expect(controller.state.value.answerStatus, AnswerSubmissionStatus.idle);

      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.pending,
      );
      expect(controller.state.value.answerSubmittedEarly, isFalse);

      final String cmdId =
          transport.sentCommands.lastWhere(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchSubmitAnswer,
              )['commandId']
              as String;
      transport.emitEvent(makeAck(commandId: cmdId, accepted: true));
      await controller.idle;
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.confirmed,
      );

      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok2'});
      expect(
        transport.sentCommands
            .where(
              (Map<String, dynamic> c) =>
                  c['type'] == MessageTypes.matchSubmitAnswer,
            )
            .length,
        1,
      );
    });

    test('empty early submit marks answerSubmittedEarly', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
      );
      controller.submitAnswer('ch-1', <String, dynamic>{});
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.pending,
      );
      expect(controller.state.value.answerSubmittedEarly, isTrue);
    });

    test('non-wait engine empty submit is not early miss', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(engineId: 'trap.no_touch'),
      );
      controller.submitAnswer('ch-1', <String, dynamic>{'touched': false});
      expect(controller.state.value.answerSubmittedEarly, isFalse);
    });

    test('hold progress final:false stays idle and unlocked', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(engineId: 'hold.multitouch'),
      );
      controller.submitAnswer('ch-1', <String, dynamic>{
        'contacts': 2,
        'heldMs': 200,
        'final': false,
      });
      expect(controller.state.value.answerStatus, AnswerSubmissionStatus.idle);
      expect(controller.state.value.answerSubmittedEarly, isFalse);

      controller.submitAnswer('ch-1', <String, dynamic>{
        'contacts': 2,
        'heldMs': 400,
        'final': false,
      });
      expect(
        transport.sentCommands
            .where(
              (Map<String, dynamic> c) =>
                  c['type'] == MessageTypes.matchSubmitAnswer,
            )
            .length,
        2,
      );
    });

    test('rejected ACK restores idle while deadline open', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
        serverNowMs: 1700000001000,
      );
      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      final String cmdId =
          transport.sentCommands.lastWhere(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchSubmitAnswer,
              )['commandId']
              as String;
      transport.emitEvent(makeAck(commandId: cmdId, accepted: false));
      await controller.idle;
      expect(controller.state.value.answerStatus, AnswerSubmissionStatus.idle);

      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok2'});
      expect(
        transport.sentCommands
            .where(
              (Map<String, dynamic> c) =>
                  c['type'] == MessageTypes.matchSubmitAnswer,
            )
            .length,
        2,
      );
    });

    test(
      'inclusive deadline equality still allows retry after reject',
      () async {
        // Anchored at exact deadline — inclusive boundary still open.
        const int deadline = 1700000008000;
        final FakeMonotonicClock mono = FakeMonotonicClock();
        final ServerTimeClock clock = ServerTimeClock(clock: mono);
        final FakeTransport t = FakeTransport();
        final MemorySessionStore s = MemorySessionStore();
        final MatchSessionController c = MatchSessionController(
          transport: t,
          sessionStore: s,
          serverTimeClock: clock,
        );
        c.init();

        await completeJoinHandshake(
          c,
          t,
          phase: 'challenge_active',
          currentChallenge: makeActiveChallenge(
            deadlineAtMs: deadline,
            serverNowMs: deadline,
          ),
          serverNowMs: deadline,
        );
        expect(clock.estimateServerNowMs(), deadline);
        c.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
        final String cmdId =
            t.sentCommands.lastWhere(
                  (Map<String, dynamic> cmd) =>
                      cmd['type'] == MessageTypes.matchSubmitAnswer,
                )['commandId']
                as String;
        t.emitEvent(makeAck(commandId: cmdId, accepted: false));
        await c.idle;
        expect(c.state.value.answerStatus, AnswerSubmissionStatus.idle);
        c.dispose();
      },
    );

    test('mismatched ACK commandId leaves pending intact', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
      );
      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      transport.emitEvent(makeAck(commandId: 'wrong-cmd'));
      await controller.idle;
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.pending,
      );
      controller.submitAnswer('ch-1', <String, dynamic>{
        'signalToken': 'other',
      });
      expect(
        transport.sentCommands
            .where(
              (Map<String, dynamic> c) =>
                  c['type'] == MessageTypes.matchSubmitAnswer,
            )
            .length,
        1,
      );
    });

    test('snapshot with local submitted confirms answer', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
      );
      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      transport.emitEvent(
        makeSnapshot(
          sequence: 2,
          phase: 'challenge_active',
          currentChallenge: makeActiveChallenge(),
          localSubmitted: true,
        ),
      );
      await controller.idle;
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.confirmed,
      );
    });

    test('lost ACK then resume resends same submit commandId', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
        serverNowMs: 1700000001000,
      );
      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      final String originalCmdId =
          transport.sentCommands.lastWhere(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchSubmitAnswer,
              )['commandId']
              as String;

      transport.simulateDisconnect();
      await controller.idle;
      transport.simulateReconnect();
      await controller.idle;
      await completeResumeHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
        localSubmitted: false,
        serverNowMs: 1700000002000,
      );

      final List<Map<String, dynamic>> submits = transport.sentCommands
          .where(
            (Map<String, dynamic> c) =>
                c['type'] == MessageTypes.matchSubmitAnswer,
          )
          .toList();
      expect(submits.length, 2);
      expect(submits[0]['commandId'], originalCmdId);
      expect(submits[1]['commandId'], originalCmdId);
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.pending,
      );
    });

    test(
      'resume with snapshot already submitted clears pending without resend',
      () async {
        await completeJoinHandshake(
          controller,
          transport,
          phase: 'challenge_active',
          currentChallenge: makeActiveChallenge(),
        );
        controller.submitAnswer('ch-1', <String, dynamic>{
          'signalToken': 'tok',
        });
        transport.simulateDisconnect();
        await controller.idle;
        transport.simulateReconnect();
        await controller.idle;
        await completeResumeHandshake(
          controller,
          transport,
          phase: 'challenge_active',
          currentChallenge: makeActiveChallenge(),
          localSubmitted: true,
        );
        expect(
          transport.sentCommands
              .where(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchSubmitAnswer,
              )
              .length,
          1,
        );
        expect(
          controller.state.value.answerStatus,
          AnswerSubmissionStatus.confirmed,
        );
      },
    );

    test('protocol error with matching commandId restores idle', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
        serverNowMs: 1700000001000,
      );
      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      final String cmdId =
          transport.sentCommands.lastWhere(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchSubmitAnswer,
              )['commandId']
              as String;
      transport.emitEvent(
        makeProtocolError(code: 'CHALLENGE_NOT_ACTIVE', commandId: cmdId),
      );
      await controller.idle;
      expect(controller.state.value.answerStatus, AnswerSubmissionStatus.idle);
      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok2'});
      expect(
        transport.sentCommands
            .where(
              (Map<String, dynamic> c) =>
                  c['type'] == MessageTypes.matchSubmitAnswer,
            )
            .length,
        2,
      );
    });

    test('clearSessionAndDisconnect resets everything', () async {
      await completeJoinHandshake(controller, transport);
      await controller.clearSessionAndDisconnect();
      expect(controller.state.value.matchId, isNull);
      expect(controller.state.value.playerId, isNull);
      expect(controller.state.value.lifecycle, SessionLifecycle.disconnected);
      expect(controller.state.value.inMatch, isFalse);
      expect(transport.isConnected, isFalse);
      expect(await store.load(), isNull);
    });

    test('play again: clear then fresh create is not blocked', () async {
      await completeJoinHandshake(controller, transport);
      await controller.clearSessionAndDisconnect();
      transport.sentCommands.clear();

      await completeJoinHandshake(
        controller,
        transport,
        matchId: 'match-2',
        playerId: 'player-9',
      );
      expect(transport.sentCommands.first['type'], MessageTypes.matchCreateDev);
      expect(controller.state.value.matchId, 'match-2');
      expect(controller.state.value.playerId, 'player-9');
      expect(controller.state.value.lifecycle, SessionLifecycle.bound);
    });

    test(
      'clock anchors from snapshot and challenge timing events only',
      () async {
        final FakeMonotonicClock mono = FakeMonotonicClock();
        final ServerTimeClock clock = ServerTimeClock(clock: mono);
        final FakeTransport localTransport = FakeTransport();
        final MemorySessionStore localStore = MemorySessionStore();
        final MatchSessionController c = MatchSessionController(
          transport: localTransport,
          sessionStore: localStore,
          serverTimeClock: clock,
        );
        c.init();

        await completeJoinHandshake(
          c,
          localTransport,
          serverNowMs: 5000000,
          snapshotSequence: 1,
          phase: 'challenge_active',
          currentChallenge: makeActiveChallenge(serverNowMs: 5000000),
        );
        expect(clock.estimateServerNowMs(), 5000000);

        mono.advance(100);
        expect(clock.estimateServerNowMs(), 5000100);

        localTransport.emitEvent(makePresence(serverSequence: 2));
        await c.idle;
        expect(clock.estimateServerNowMs(), 5000100);

        c.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
        final String cmdId =
            localTransport.sentCommands.lastWhere(
                  (Map<String, dynamic> cmd) =>
                      cmd['type'] == MessageTypes.matchSubmitAnswer,
                )['commandId']
                as String;
        localTransport.emitEvent(makeAck(commandId: cmdId));
        await c.idle;
        expect(clock.estimateServerNowMs(), 5000100);

        localTransport.emitEvent(
          makeChallengeStarted(
            serverSequence: 3,
            serverNowMs: 5000500,
            challengeInstanceId: 'ch-2',
          ),
        );
        await c.idle;
        expect(clock.estimateServerNowMs(), 5000500);

        localTransport.emitEvent(
          makeChallengeSignal(
            serverSequence: 4,
            serverNowMs: 5000800,
            challengeInstanceId: 'ch-2',
          ),
        );
        await c.idle;
        expect(clock.estimateServerNowMs(), 5000800);

        c.dispose();
      },
    );

    test('new challenge resets answer status to idle', () async {
      await completeJoinHandshake(
        controller,
        transport,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(challengeInstanceId: 'ch-1'),
        snapshotSequence: 1,
      );
      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      final String cmdId =
          transport.sentCommands.lastWhere(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchSubmitAnswer,
              )['commandId']
              as String;
      transport.emitEvent(makeAck(commandId: cmdId, accepted: true));
      await controller.idle;
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.confirmed,
      );

      transport.emitEvent(
        makeChallengeStarted(
          serverSequence: 2,
          challengeInstanceId: 'ch-2',
          serverNowMs: 1700000010000,
        ),
      );
      await controller.idle;
      expect(controller.state.value.answerStatus, AnswerSubmissionStatus.idle);
    });
  });

  group('MatchSessionController LH-003D', () {
    test('copyWith can force-preserve null identity over reducer values', () {
      const MatchViewState prior = MatchViewState();
      const MatchViewState fromReducer = MatchViewState(
        matchId: 'poison',
        playerId: 'poison-player',
        phase: MatchPhase.lobby,
        serverSequence: 3,
      );
      final MatchViewState merged = fromReducer.copyWith(
        matchId: () => prior.matchId,
        playerId: () => prior.playerId,
      );
      expect(merged.matchId, isNull);
      expect(merged.playerId, isNull);
      expect(merged.serverSequence, 3);
      expect(merged.phase, MatchPhase.lobby);
    });

    test(
      'cross-match snapshot before player accept cannot poison identity',
      () async {
        await controller.startDevMatch();
        await controller.idle;
        final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
          (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
        );
        transport.emitEvent(
          makeSessionAccepted(
            role: 'creator',
            commandId: createCmd['commandId'] as String,
            includePlayer: false,
          ),
        );
        await controller.idle;
        transport.emitEvent(makeSnapshot(matchId: 'match-OTHER', sequence: 9));
        await controller.idle;
        expect(controller.state.value.matchId, isNull);
        expect(controller.state.value.playerId, isNull);
        expect(controller.state.value.lifecycle, SessionLifecycle.connecting);
        expect(controller.state.value.inMatch, isFalse);
      },
    );

    test(
      'disconnect after poisoned snapshot before credentials is clean retryable',
      () async {
        await controller.startDevMatch();
        await controller.idle;
        final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
          (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
        );
        transport.emitEvent(
          makeSessionAccepted(
            role: 'creator',
            commandId: createCmd['commandId'] as String,
            includePlayer: false,
          ),
        );
        await controller.idle;
        transport.emitEvent(makeSnapshot(sequence: 4));
        await controller.idle;
        expect(controller.state.value.matchId, isNull);

        transport.simulateDisconnect();
        await controller.idle;
        expect(controller.state.value.lifecycle, SessionLifecycle.disconnected);
        expect(controller.state.value.canRetry, isTrue);
        expect(controller.state.value.matchId, isNull);
        expect(controller.state.value.playerId, isNull);
        expect(await store.load(), isNull);

        transport.sentCommands.clear();
        await completeJoinHandshake(controller, transport, matchId: 'match-9');
        expect(controller.state.value.lifecycle, SessionLifecycle.bound);
        expect(controller.state.value.matchId, 'match-9');
        expect(controller.state.value.playerId, 'player-1');
      },
    );

    test('seq1 → gap5 → snap1 applies but recovery remains', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 1);
      transport.sentCommands.clear();
      transport.emitEvent(makeChallengeStarted(serverSequence: 5));
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.recoveryWatermarkForTest, 5);

      transport.emitEvent(makeSnapshot(sequence: 1));
      await controller.idle;
      expect(controller.state.value.serverSequence, 1);
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.recoveryWatermarkForTest, 5);
    });

    test('gap5 then gap7 then snap5 keeps watermark 7', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 1);
      transport.emitEvent(makeChallengeStarted(serverSequence: 5));
      await controller.idle;
      transport.emitEvent(makeChallengeStarted(serverSequence: 7));
      await controller.idle;
      expect(controller.recoveryWatermarkForTest, 7);

      transport.emitEvent(makeSnapshot(sequence: 5));
      await controller.idle;
      expect(controller.state.value.serverSequence, 5);
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.recoveryWatermarkForTest, 7);
    });

    test(
      'snap at/above watermark clears recovery and cancels retries',
      () async {
        final FakeTransport t = FakeTransport();
        final MemorySessionStore s = MemorySessionStore();
        final MatchSessionController c = MatchSessionController(
          transport: t,
          sessionStore: s,
          snapshotRetryDelayForAttempt: (_) => const Duration(milliseconds: 30),
        );
        c.init();
        await completeJoinHandshake(c, t, snapshotSequence: 1);
        t.sentCommands.clear();
        t.emitEvent(makeChallengeStarted(serverSequence: 5));
        await c.idle;
        t.emitEvent(makeChallengeStarted(serverSequence: 7));
        await c.idle;
        expect(c.recoveryWatermarkForTest, 7);

        t.emitEvent(makeSnapshot(sequence: 7));
        await c.idle;
        expect(c.state.value.needsSnapshot, isFalse);
        expect(c.recoveryWatermarkForTest, isNull);
        expect(c.snapshotRequestCommandIdForTest, isNull);

        final int reqCount = t.sentCommands
            .where(
              (Map<String, dynamic> cmd) =>
                  cmd['type'] == MessageTypes.matchRequestSnapshot,
            )
            .length;
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await c.idle;
        expect(
          t.sentCommands
              .where(
                (Map<String, dynamic> cmd) =>
                    cmd['type'] == MessageTypes.matchRequestSnapshot,
              )
              .length,
          reqCount,
        );
        c.dispose();
      },
    );

    test('stale/cross-match snapshot never clears recovery', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 3);
      transport.emitEvent(makeChallengeStarted(serverSequence: 8));
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isTrue);

      transport.emitEvent(makeSnapshot(sequence: 1));
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.recoveryWatermarkForTest, 8);

      transport.emitEvent(makeSnapshot(matchId: 'match-OTHER', sequence: 99));
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.state.value.matchId, 'match-1');
      expect(controller.recoveryWatermarkForTest, 8);
    });

    test('unrelated ACK/error does not clear recovery request', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 1);
      transport.sentCommands.clear();
      transport.emitEvent(makeChallengeStarted(serverSequence: 5));
      await controller.idle;
      final String snapCmdId =
          transport.sentCommands.lastWhere(
                (Map<String, dynamic> c) =>
                    c['type'] == MessageTypes.matchRequestSnapshot,
              )['commandId']
              as String;

      transport.emitEvent(makeAck(commandId: 'other-ack'));
      await controller.idle;
      transport.emitEvent(
        makeProtocolError(code: 'INTERNAL_ERROR', commandId: 'other-err'),
      );
      await controller.idle;

      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.snapshotRequestCommandIdForTest, snapCmdId);
    });

    test('repeated timeouts never create more than one in-flight', () async {
      final FakeTransport t = FakeTransport();
      final MemorySessionStore s = MemorySessionStore();
      final MatchSessionController c = MatchSessionController(
        transport: t,
        sessionStore: s,
        snapshotRetryDelayForAttempt: (_) => const Duration(milliseconds: 20),
      );
      c.init();
      await completeJoinHandshake(c, t, snapshotSequence: 1);
      t.sentCommands.clear();
      t.emitEvent(makeChallengeStarted(serverSequence: 9));
      await c.idle;

      for (int i = 0; i < 3; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 35));
        await c.idle;
        final List<Map<String, dynamic>> inflight = t.sentCommands
            .where(
              (Map<String, dynamic> cmd) =>
                  cmd['type'] == MessageTypes.matchRequestSnapshot,
            )
            .toList();
        // Each timeout finishes prior request then starts exactly one new one.
        expect(c.snapshotRequestCommandIdForTest, isNotNull);
        expect(
          inflight.where(
            (Map<String, dynamic> cmd) =>
                cmd['commandId'] == c.snapshotRequestCommandIdForTest,
          ),
          hasLength(1),
        );
      }
      c.dispose();
    });

    test('disconnect cancels recovery timers; dispose cancels too', () async {
      final FakeTransport t = FakeTransport();
      final MemorySessionStore s = MemorySessionStore();
      final MatchSessionController c = MatchSessionController(
        transport: t,
        sessionStore: s,
        snapshotRetryDelayForAttempt: (_) => const Duration(milliseconds: 40),
      );
      c.init();
      await completeJoinHandshake(c, t, snapshotSequence: 1);
      t.sentCommands.clear();
      t.emitEvent(makeChallengeStarted(serverSequence: 6));
      await c.idle;
      expect(c.state.value.needsSnapshot, isTrue);
      final int before = t.sentCommands
          .where(
            (Map<String, dynamic> cmd) =>
                cmd['type'] == MessageTypes.matchRequestSnapshot,
          )
          .length;

      t.simulateDisconnect();
      await c.idle;
      expect(c.snapshotRequestCommandIdForTest, isNull);
      // Watermark survives disconnect for later resume convergence.
      expect(c.recoveryWatermarkForTest, 6);
      expect(c.state.value.needsSnapshot, isTrue);

      await Future<void>.delayed(const Duration(milliseconds: 60));
      await c.idle;
      expect(
        t.sentCommands
            .where(
              (Map<String, dynamic> cmd) =>
                  cmd['type'] == MessageTypes.matchRequestSnapshot,
            )
            .length,
        before,
      );

      c.dispose();
    });

    test('resume snapshot at/above watermark converges', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 1);
      transport.emitEvent(makeChallengeStarted(serverSequence: 8));
      await controller.idle;
      expect(controller.recoveryWatermarkForTest, 8);

      transport.simulateDisconnect();
      await controller.idle;
      transport.simulateReconnect();
      await controller.idle;
      await completeResumeHandshake(controller, transport, snapshotSequence: 8);
      expect(controller.state.value.lifecycle, SessionLifecycle.bound);
      expect(controller.state.value.needsSnapshot, isFalse);
      expect(controller.recoveryWatermarkForTest, isNull);
    });

    test('stale R1 UNAUTHORIZED while resuming R2 does not clear', () async {
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'tok-1',
          pendingResumeCommandId: 'R2',
        ),
      );
      await controller.tryResume();
      await controller.idle;
      expect(controller.state.value.lifecycle, SessionLifecycle.resuming);
      final Map<String, dynamic> resumeCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> c) => c['type'] == MessageTypes.matchResume,
      );
      expect(resumeCmd['commandId'], 'R2');

      transport.emitEvent(
        makeProtocolError(
          code: 'UNAUTHORIZED',
          messageKey: 'errors.protocol.unauthorized',
          commandId: 'R1',
        ),
      );
      await controller.idle;
      expect(await store.load(), isNotNull);
      expect(controller.state.value.lifecycle, SessionLifecycle.resuming);
      expect(controller.state.value.matchId, 'match-1');
      expect(controller.state.value.playerId, 'player-1');
    });

    test(
      'uncorrelated UNAUTHORIZED without commandId does not clear',
      () async {
        await store.save(
          const SessionData(
            matchId: 'match-1',
            playerId: 'player-1',
            resumeToken: 'tok-1',
            pendingResumeCommandId: 'R2',
          ),
        );
        await controller.tryResume();
        await controller.idle;

        transport.emitEvent(
          makeProtocolError(
            code: 'UNAUTHORIZED',
            messageKey: 'errors.protocol.unauthorized',
          ),
        );
        await controller.idle;
        expect(await store.load(), isNotNull);
        expect(controller.state.value.lifecycle, SessionLifecycle.resuming);
        expect(controller.state.value.matchId, 'match-1');
      },
    );

    test('stale snapshot-request error during resume does not clear', () async {
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'tok-1',
          pendingResumeCommandId: 'R2',
        ),
      );
      await controller.tryResume();
      await controller.idle;

      transport.emitEvent(
        makeProtocolError(
          code: 'UNAUTHORIZED',
          messageKey: 'errors.protocol.unauthorized',
          commandId: 'old-snap-req',
        ),
      );
      await controller.idle;
      expect(await store.load(), isNotNull);
      expect(controller.state.value.lifecycle, SessionLifecycle.resuming);
    });

    test('valid accept/snap after unrelated stale error still binds', () async {
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'tok-1',
          pendingResumeCommandId: 'R2',
        ),
      );
      await controller.tryResume();
      await controller.idle;

      transport.emitEvent(
        makeProtocolError(
          code: 'UNAUTHORIZED',
          messageKey: 'errors.protocol.unauthorized',
          commandId: 'R1',
        ),
      );
      await controller.idle;
      expect(await store.load(), isNotNull);

      await completeResumeHandshake(controller, transport);
      expect(controller.state.value.lifecycle, SessionLifecycle.bound);
      expect(controller.state.value.inMatch, isTrue);
      expect((await store.load())!.resumeToken, 'tok-rotated');
    });

    test(
      'malformed envelope does not mutate identity or stall queue',
      () async {
        await completeJoinHandshake(controller, transport);
        final String? matchId = controller.state.value.matchId;
        final int seq = controller.state.value.serverSequence;

        transport.emitEvent(<String, dynamic>{
          'schemaVersion': '999',
          'type': MessageTypes.matchSnapshot,
          'messageId': 'bad',
          'matchId': 'evil',
          'payload': <String, dynamic>{'matchId': 'evil', 'sequence': 99},
        });
        await controller.idle;
        expect(controller.state.value.matchId, matchId);
        expect(controller.state.value.serverSequence, seq);

        transport.emitEvent(makePresence(serverSequence: seq + 1));
        await controller.idle;
        expect(controller.state.value.serverSequence, seq + 1);
      },
    );

    test('mixed session.accepted shape is rejected without binding', () async {
      await controller.startDevMatch();
      await controller.idle;
      final Map<String, dynamic> createCmd = transport.sentCommands.lastWhere(
        (Map<String, dynamic> e) => e['type'] == MessageTypes.matchCreateDev,
      );
      transport.emitEvent(<String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.sessionAccepted,
        'messageId': 'msg-mixed',
        'matchId': 'match-1',
        'commandId': createCmd['commandId'],
        'payload': <String, dynamic>{
          'matchId': 'match-1',
          'playerId': 'player-1',
          'resumeToken': 'tok',
          'role': 'creator',
        },
      });
      await controller.idle;
      expect(controller.state.value.matchId, isNull);
      expect(controller.state.value.playerId, isNull);
      expect(await store.load(), isNull);
      expect(
        transport.sentCommands.any(
          (Map<String, dynamic> c) => c['type'] == MessageTypes.matchJoin,
        ),
        isFalse,
      );
    });
  });

  group('MatchSessionController LH-003E', () {
    test('sequence gap sets needsSnapshot and blocks gameplay input', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 1);
      expect(controller.state.value.blocksGameplayInput, isFalse);

      transport.emitEvent(makeChallengeStarted(serverSequence: 5));
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.state.value.blocksGameplayInput, isTrue);
      expect(controller.recoveryWatermarkForTest, 5);
    });

    test('submitAnswer during recovery emits no answer command', () async {
      await completeJoinHandshake(
        controller,
        transport,
        snapshotSequence: 1,
        currentChallenge: makeActiveChallenge(),
        phase: 'challenge_active',
      );
      transport.sentCommands.clear();
      transport.emitEvent(makeChallengeStarted(serverSequence: 5));
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isTrue);

      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      await controller.idle;
      expect(
        transport.sentCommands.any(
          (Map<String, dynamic> c) =>
              c['type'] == MessageTypes.matchSubmitAnswer,
        ),
        isFalse,
      );
      expect(controller.state.value.answerStatus, AnswerSubmissionStatus.idle);
    });

    test(
      'below-watermark resume snapshot binds but stays gameplay-blocked',
      () async {
        await completeJoinHandshake(controller, transport, snapshotSequence: 1);
        transport.emitEvent(makeChallengeStarted(serverSequence: 8));
        await controller.idle;
        expect(controller.recoveryWatermarkForTest, 8);

        transport.simulateDisconnect();
        await controller.idle;
        transport.simulateReconnect();
        await controller.idle;
        await completeResumeHandshake(
          controller,
          transport,
          snapshotSequence: 3,
        );
        expect(controller.state.value.lifecycle, SessionLifecycle.bound);
        expect(controller.state.value.needsSnapshot, isTrue);
        expect(controller.state.value.blocksGameplayInput, isTrue);
        expect(controller.recoveryWatermarkForTest, 8);
      },
    );

    test(
      'convergent snapshot clears recovery and restores input eligibility',
      () async {
        await completeJoinHandshake(
          controller,
          transport,
          snapshotSequence: 1,
          currentChallenge: makeActiveChallenge(),
          phase: 'challenge_active',
        );
        transport.emitEvent(makeChallengeStarted(serverSequence: 5));
        await controller.idle;
        expect(controller.state.value.blocksGameplayInput, isTrue);

        transport.emitEvent(
          makeSnapshot(
            sequence: 5,
            phase: 'challenge_active',
            currentChallenge: makeActiveChallenge(),
          ),
        );
        await controller.idle;
        expect(controller.state.value.needsSnapshot, isFalse);
        expect(controller.recoveryWatermarkForTest, isNull);
        expect(controller.state.value.blocksGameplayInput, isFalse);
      },
    );

    test(
      'below-watermark halted snap keeps recovery; later convergent enters terminal',
      () async {
        await completeJoinHandshake(controller, transport, snapshotSequence: 1);
        transport.sentCommands.clear();
        transport.emitEvent(makeChallengeStarted(serverSequence: 5));
        await controller.idle;
        expect(controller.recoveryWatermarkForTest, 5);

        transport.emitEvent(
          makeSnapshot(
            sequence: 1,
            phase: 'halted',
            status: 'completed',
            commandId: controller.snapshotRequestCommandIdForTest,
          ),
        );
        await controller.idle;
        expect(controller.state.value.needsSnapshot, isTrue);
        expect(
          controller.state.value.lifecycle,
          isNot(SessionLifecycle.terminal),
        );
        expect(controller.recoveryWatermarkForTest, 5);
        expect(controller.state.value.phase, MatchPhase.halted);

        // Retries continue after terminal-looking below-watermark snap.
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await controller.idle;
        // Default delay may be long; request explicitly if timer not yet fired.
        if (controller.snapshotRequestCommandIdForTest == null) {
          controller.requestSnapshot();
          await controller.idle;
        }
        expect(controller.state.value.needsSnapshot, isTrue);

        transport.emitEvent(
          makeSnapshot(sequence: 5, phase: 'halted', status: 'completed'),
        );
        await controller.idle;
        expect(controller.state.value.needsSnapshot, isFalse);
        expect(controller.state.value.lifecycle, SessionLifecycle.terminal);
        expect(controller.recoveryWatermarkForTest, isNull);
      },
    );

    test('below-watermark completed snap does not enter terminal', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 1);
      transport.emitEvent(makeChallengeStarted(serverSequence: 5));
      await controller.idle;

      transport.emitEvent(
        makeSnapshot(
          sequence: 1,
          phase: 'completed',
          status: 'completed',
          winnerId: 'player-1',
        ),
      );
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.state.value.lifecycle, SessionLifecycle.bound);
      expect(controller.recoveryWatermarkForTest, 5);

      transport.emitEvent(
        makeSnapshot(
          sequence: 5,
          phase: 'completed',
          status: 'completed',
          winnerId: 'player-1',
        ),
      );
      await controller.idle;
      expect(controller.state.value.lifecycle, SessionLifecycle.terminal);
    });

    test(
      'mismatched snapshot sequences do not poison trusted watermark',
      () async {
        await completeJoinHandshake(controller, transport, snapshotSequence: 5);
        expect(controller.state.value.serverSequence, 5);

        transport.emitEvent(makeSnapshot(sequence: 6, serverSequence: 100));
        await controller.idle;
        expect(controller.state.value.needsSnapshot, isTrue);
        // Must not raise watermark to the contradictory envelope value.
        expect(controller.recoveryWatermarkForTest, isNot(100));
        expect(
          controller.recoveryWatermarkForTest == null ||
              controller.recoveryWatermarkForTest! < 100,
          isTrue,
        );

        transport.emitEvent(makeSnapshot(sequence: 6));
        await controller.idle;
        expect(controller.state.value.needsSnapshot, isFalse);
        expect(controller.state.value.serverSequence, 6);
        expect(controller.recoveryWatermarkForTest, isNull);
      },
    );

    test('legitimate gap still requires snap at or above watermark', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 5);
      transport.emitEvent(makeChallengeStarted(serverSequence: 9));
      await controller.idle;
      expect(controller.recoveryWatermarkForTest, 9);

      transport.emitEvent(makeSnapshot(sequence: 6));
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.recoveryWatermarkForTest, 9);

      transport.emitEvent(makeSnapshot(sequence: 9));
      await controller.idle;
      expect(controller.state.value.needsSnapshot, isFalse);
      expect(controller.recoveryWatermarkForTest, isNull);
    });

    test(
      'unsolicited below-watermark snap does not cancel in-flight request',
      () async {
        final FakeTransport t = FakeTransport();
        final MemorySessionStore s = MemorySessionStore();
        final MatchSessionController c = MatchSessionController(
          transport: t,
          sessionStore: s,
          snapshotRetryDelayForAttempt: (_) => const Duration(seconds: 30),
        );
        c.init();
        await completeJoinHandshake(c, t, snapshotSequence: 1);
        t.sentCommands.clear();
        t.emitEvent(makeChallengeStarted(serverSequence: 5));
        await c.idle;
        final String? inFlight = c.snapshotRequestCommandIdForTest;
        expect(inFlight, isNotNull);

        t.emitEvent(makeSnapshot(sequence: 1));
        await c.idle;
        expect(c.snapshotRequestCommandIdForTest, inFlight);
        expect(c.state.value.needsSnapshot, isTrue);
        c.dispose();
      },
    );

    test(
      'correlated below-watermark response retires request and schedules one retry',
      () async {
        final FakeTransport t = FakeTransport();
        final MemorySessionStore s = MemorySessionStore();
        final MatchSessionController c = MatchSessionController(
          transport: t,
          sessionStore: s,
          snapshotRetryDelayForAttempt: (_) => const Duration(milliseconds: 25),
        );
        c.init();
        await completeJoinHandshake(c, t, snapshotSequence: 1);
        t.sentCommands.clear();
        t.emitEvent(makeChallengeStarted(serverSequence: 5));
        await c.idle;
        final String inFlight = c.snapshotRequestCommandIdForTest!;

        t.emitEvent(makeSnapshot(sequence: 1, commandId: inFlight));
        await c.idle;
        expect(c.snapshotRequestCommandIdForTest, isNull);

        final int beforeRetry = t.sentCommands
            .where(
              (Map<String, dynamic> cmd) =>
                  cmd['type'] == MessageTypes.matchRequestSnapshot,
            )
            .length;

        await Future<void>.delayed(const Duration(milliseconds: 40));
        await c.idle;
        final int afterRetry = t.sentCommands
            .where(
              (Map<String, dynamic> cmd) =>
                  cmd['type'] == MessageTypes.matchRequestSnapshot,
            )
            .length;
        expect(afterRetry, beforeRetry + 1);
        expect(c.snapshotRequestCommandIdForTest, isNotNull);
        c.dispose();
      },
    );

    test('at/above-watermark snap cancels further retries', () async {
      final FakeTransport t = FakeTransport();
      final MemorySessionStore s = MemorySessionStore();
      final MatchSessionController c = MatchSessionController(
        transport: t,
        sessionStore: s,
        snapshotRetryDelayForAttempt: (_) => const Duration(milliseconds: 25),
      );
      c.init();
      await completeJoinHandshake(c, t, snapshotSequence: 1);
      t.sentCommands.clear();
      t.emitEvent(makeChallengeStarted(serverSequence: 5));
      await c.idle;
      t.emitEvent(makeSnapshot(sequence: 5));
      await c.idle;
      expect(c.state.value.needsSnapshot, isFalse);
      final int count = t.sentCommands
          .where(
            (Map<String, dynamic> cmd) =>
                cmd['type'] == MessageTypes.matchRequestSnapshot,
          )
          .length;
      await Future<void>.delayed(const Duration(milliseconds: 50));
      await c.idle;
      expect(
        t.sentCommands
            .where(
              (Map<String, dynamic> cmd) =>
                  cmd['type'] == MessageTypes.matchRequestSnapshot,
            )
            .length,
        count,
      );
      c.dispose();
    });

    test(
      'fakeAsync: correlated below-watermark schedules exactly one retry',
      () {
        fakeAsync((FakeAsync async) {
          final FakeTransport t = FakeTransport();
          final MemorySessionStore s = MemorySessionStore();
          final MatchSessionController c = MatchSessionController(
            transport: t,
            sessionStore: s,
            snapshotRetryDelayForAttempt: (_) =>
                const Duration(milliseconds: 30),
          );
          c.init();

          int phase = 0;
          int beforeRetry = 0;
          Object? failure;

          completeJoinHandshake(c, t, snapshotSequence: 1)
              .then((_) async {
                t.sentCommands.clear();
                t.emitEvent(makeChallengeStarted(serverSequence: 5));
                await c.idle;
                final String inFlight = c.snapshotRequestCommandIdForTest!;
                t.emitEvent(makeSnapshot(sequence: 1, commandId: inFlight));
                await c.idle;
                expect(c.snapshotRequestCommandIdForTest, isNull);
                beforeRetry = t.sentCommands
                    .where(
                      (Map<String, dynamic> cmd) =>
                          cmd['type'] == MessageTypes.matchRequestSnapshot,
                    )
                    .length;
                phase = 1;
              })
              .catchError((Object e, StackTrace st) {
                failure = e;
              });

          // Drive handshake / recovery application: only zero-duration timers
          // (idle yields), never the recovery backoff.
          for (int i = 0; i < 500 && phase < 1 && failure == null; i++) {
            async.flushMicrotasks();
            async.elapse(Duration.zero);
          }
          if (failure != null) {
            fail('setup failed: $failure');
          }
          expect(phase, 1);

          // Exactly one backoff timer should be pending for the retry.
          expect(async.pendingTimers, isNotEmpty);
          async.elapse(const Duration(milliseconds: 30));
          for (int i = 0; i < 50; i++) {
            async.flushMicrotasks();
            async.elapse(Duration.zero);
          }

          expect(
            t.sentCommands
                .where(
                  (Map<String, dynamic> cmd) =>
                      cmd['type'] == MessageTypes.matchRequestSnapshot,
                )
                .length,
            beforeRetry + 1,
          );
          expect(c.snapshotRequestCommandIdForTest, isNotNull);
          c.dispose();
        });
      },
    );

    test(
      'non-contract protocol.error code cannot clear resume credentials',
      () async {
        await store.save(
          const SessionData(
            matchId: 'match-1',
            playerId: 'player-1',
            resumeToken: 'tok-1',
            pendingResumeCommandId: 'R2',
          ),
        );
        await controller.tryResume();
        await controller.idle;
        expect(controller.state.value.lifecycle, SessionLifecycle.resuming);

        transport.emitEvent(
          makeProtocolError(
            code: 'SESSION_EXPIRED',
            messageKey: 'errors.protocol.session_expired',
            commandId: 'R2',
          ),
        );
        await controller.idle;
        expect(await store.load(), isNotNull);
        expect(controller.state.value.lifecycle, SessionLifecycle.resuming);
        expect(controller.state.value.matchId, 'match-1');
      },
    );

    test('negative serverSequence is rejected without mutation', () async {
      await completeJoinHandshake(controller, transport, snapshotSequence: 2);
      final int seq = controller.state.value.serverSequence;
      transport.emitEvent(<String, dynamic>{
        'schemaVersion': '1',
        'type': MessageTypes.playerPresence,
        'messageId': 'msg-neg',
        'matchId': 'match-1',
        'serverSequence': -1,
        'payload': <String, dynamic>{
          'playerId': 'player-2',
          'presence': 'connected',
          'joined': true,
        },
      });
      await controller.idle;
      expect(controller.state.value.serverSequence, seq);

      transport.emitEvent(makePresence(serverSequence: seq + 1));
      await controller.idle;
      expect(controller.state.value.serverSequence, seq + 1);
    });
  });

  group('MatchSessionController LH-003F', () {
    List<Map<String, dynamic>> submitCommands() => transport.sentCommands
        .where(
          (Map<String, dynamic> c) =>
              c['type'] == MessageTypes.matchSubmitAnswer,
        )
        .toList();

    Future<String> submitPendingAnswer() async {
      await completeJoinHandshake(
        controller,
        transport,
        snapshotSequence: 1,
        phase: 'challenge_active',
        currentChallenge: makeActiveChallenge(),
        serverNowMs: 1700000001000,
      );
      controller.submitAnswer('ch-1', <String, dynamic>{'signalToken': 'tok'});
      await controller.idle;
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.pending,
      );
      return submitCommands().single['commandId'] as String;
    }

    Future<void> disconnectAndResumeBelowWatermark({
      required int watermark,
      bool localSubmitted = false,
      Map<String, dynamic>? currentChallenge,
      int serverNowMs = 1700000002000,
    }) async {
      transport.emitEvent(makeChallengeStarted(serverSequence: watermark));
      await controller.idle;
      expect(controller.recoveryWatermarkForTest, watermark);
      expect(controller.state.value.needsSnapshot, isTrue);

      transport.simulateDisconnect();
      await controller.idle;
      transport.simulateReconnect();
      await controller.idle;
      await completeResumeHandshake(
        controller,
        transport,
        snapshotSequence: watermark - 1,
        phase: 'challenge_active',
        currentChallenge: currentChallenge ?? makeActiveChallenge(),
        localSubmitted: localSubmitted,
        serverNowMs: serverNowMs,
      );
      expect(controller.state.value.lifecycle, SessionLifecycle.bound);
      expect(controller.state.value.needsSnapshot, isTrue);
      expect(controller.state.value.blocksGameplayInput, isTrue);
    }

    test(
      'below-watermark resume keeps pending; convergent snap retries once',
      () async {
        final String originalCmdId = await submitPendingAnswer();
        expect(submitCommands(), hasLength(1));

        await disconnectAndResumeBelowWatermark(watermark: 5);
        // Still blocked; no retry while recovery unresolved.
        expect(
          controller.state.value.answerStatus,
          AnswerSubmissionStatus.pending,
        );
        expect(submitCommands(), hasLength(1));

        transport.emitEvent(
          makeSnapshot(
            sequence: 5,
            phase: 'challenge_active',
            currentChallenge: makeActiveChallenge(),
            localSubmitted: false,
            serverNowMs: 1700000003000,
          ),
        );
        await controller.idle;

        expect(controller.state.value.needsSnapshot, isFalse);
        expect(controller.recoveryWatermarkForTest, isNull);
        // Pending retry still blocks new input; recovery itself is cleared.
        expect(
          controller.state.value.answerStatus,
          AnswerSubmissionStatus.pending,
        );

        final List<Map<String, dynamic>> submits = submitCommands();
        expect(submits, hasLength(2));
        expect(submits[1]['commandId'], originalCmdId);
        expect(
          (submits[1]['payload']
              as Map<String, dynamic>)['challengeInstanceId'],
          'ch-1',
        );
        expect(
          (submits[1]['payload'] as Map<String, dynamic>)['answer'],
          <String, dynamic>{'signalToken': 'tok'},
        );
      },
    );

    test(
      'convergent snap with submitted=true confirms pending without retry',
      () async {
        await submitPendingAnswer();
        await disconnectAndResumeBelowWatermark(watermark: 5);

        transport.emitEvent(
          makeSnapshot(
            sequence: 5,
            phase: 'challenge_active',
            currentChallenge: makeActiveChallenge(),
            localSubmitted: true,
            serverNowMs: 1700000003000,
          ),
        );
        await controller.idle;

        expect(controller.state.value.needsSnapshot, isFalse);
        expect(
          controller.state.value.answerStatus,
          AnswerSubmissionStatus.confirmed,
        );
        expect(submitCommands(), hasLength(1));
      },
    );

    test(
      'deadline expired before convergence rejects pending without retry',
      () async {
        await submitPendingAnswer();
        await disconnectAndResumeBelowWatermark(watermark: 5);

        // Inclusive deadline: only estimatedNow > deadlineAtMs is late.
        transport.emitEvent(
          makeSnapshot(
            sequence: 5,
            phase: 'challenge_active',
            currentChallenge: makeActiveChallenge(deadlineAtMs: 1700000008000),
            localSubmitted: false,
            serverNowMs: 1700000008001,
          ),
        );
        await controller.idle;

        expect(controller.state.value.needsSnapshot, isFalse);
        expect(
          controller.state.value.answerStatus,
          AnswerSubmissionStatus.rejected,
        );
        expect(submitCommands(), hasLength(1));
      },
    );

    test(
      'challenge changed on convergent snap clears obsolete pending',
      () async {
        await submitPendingAnswer();
        await disconnectAndResumeBelowWatermark(watermark: 5);

        transport.emitEvent(
          makeSnapshot(
            sequence: 5,
            phase: 'challenge_active',
            currentChallenge: makeActiveChallenge(challengeInstanceId: 'ch-2'),
            localSubmitted: false,
            serverNowMs: 1700000003000,
          ),
        );
        await controller.idle;

        expect(controller.state.value.needsSnapshot, isFalse);
        expect(
          controller.state.value.answerStatus,
          AnswerSubmissionStatus.idle,
        );
        expect(submitCommands(), hasLength(1));
      },
    );

    test('repeated convergent snaps do not spam pending retries', () async {
      final String originalCmdId = await submitPendingAnswer();
      await disconnectAndResumeBelowWatermark(watermark: 5);

      transport.emitEvent(
        makeSnapshot(
          sequence: 5,
          phase: 'challenge_active',
          currentChallenge: makeActiveChallenge(),
          localSubmitted: false,
          serverNowMs: 1700000003000,
        ),
      );
      await controller.idle;
      expect(submitCommands(), hasLength(2));
      expect(submitCommands().last['commandId'], originalCmdId);

      transport.emitEvent(
        makeSnapshot(
          sequence: 5,
          phase: 'challenge_active',
          currentChallenge: makeActiveChallenge(),
          localSubmitted: false,
          serverNowMs: 1700000003100,
        ),
      );
      await controller.idle;
      transport.emitEvent(
        makeSnapshot(
          sequence: 6,
          phase: 'challenge_active',
          currentChallenge: makeActiveChallenge(),
          localSubmitted: false,
          serverNowMs: 1700000003200,
        ),
      );
      await controller.idle;

      expect(submitCommands(), hasLength(2));
      expect(
        controller.state.value.answerStatus,
        AnswerSubmissionStatus.pending,
      );
    });

    test(
      'ACK after recovery retry still correlates to original commandId',
      () async {
        final String originalCmdId = await submitPendingAnswer();
        await disconnectAndResumeBelowWatermark(watermark: 5);

        transport.emitEvent(
          makeSnapshot(
            sequence: 5,
            phase: 'challenge_active',
            currentChallenge: makeActiveChallenge(),
            localSubmitted: false,
            serverNowMs: 1700000003000,
          ),
        );
        await controller.idle;
        expect(submitCommands(), hasLength(2));
        expect(submitCommands().last['commandId'], originalCmdId);
        expect(
          controller.state.value.answerStatus,
          AnswerSubmissionStatus.pending,
        );

        transport.emitEvent(makeAck(commandId: originalCmdId, accepted: true));
        await controller.idle;
        expect(
          controller.state.value.answerStatus,
          AnswerSubmissionStatus.confirmed,
        );
      },
    );
  });
}
