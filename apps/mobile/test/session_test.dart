import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/session/session_store.dart';

void main() {
  group('MemorySessionStore', () {
    test('save and load round-trips', () async {
      final MemorySessionStore store = MemorySessionStore();
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'token-abc',
        ),
      );
      final SessionData? data = await store.load();
      expect(data, isNotNull);
      expect(data!.matchId, 'match-1');
      expect(data.playerId, 'player-1');
      expect(data.resumeToken, 'token-abc');
      expect(data.pendingResumeCommandId, isNull);
    });

    test('save persists pendingResumeCommandId', () async {
      final MemorySessionStore store = MemorySessionStore();
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'token-abc',
          pendingResumeCommandId: 'cmd-resume-1',
        ),
      );
      final SessionData? data = await store.load();
      expect(data!.pendingResumeCommandId, 'cmd-resume-1');
    });

    test('clear removes data', () async {
      final MemorySessionStore store = MemorySessionStore();
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'token-abc',
        ),
      );
      await store.clear();
      final SessionData? data = await store.load();
      expect(data, isNull);
    });

    test('load returns null when empty', () async {
      final MemorySessionStore store = MemorySessionStore();
      final SessionData? data = await store.load();
      expect(data, isNull);
    });

    test('reconnect rotated token replaces old token', () async {
      final MemorySessionStore store = MemorySessionStore();
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'token-v1',
        ),
      );
      await store.save(
        const SessionData(
          matchId: 'match-1',
          playerId: 'player-1',
          resumeToken: 'token-v2',
        ),
      );
      final SessionData? data = await store.load();
      expect(data!.resumeToken, 'token-v2');
    });

    test('copyWith can clear pendingResumeCommandId', () {
      const SessionData original = SessionData(
        matchId: 'match-1',
        playerId: 'player-1',
        resumeToken: 'tok',
        pendingResumeCommandId: 'cmd-1',
      );
      final SessionData cleared = original.copyWith(
        pendingResumeCommandId: () => null,
      );
      expect(cleared.pendingResumeCommandId, isNull);
      expect(cleared.resumeToken, 'tok');
    });

    test('toJson / fromJson round-trip includes pending command', () {
      const SessionData original = SessionData(
        matchId: 'm',
        playerId: 'p',
        resumeToken: 't',
        pendingResumeCommandId: 'c',
      );
      final SessionData restored = SessionData.fromJson(original.toJson());
      expect(restored.matchId, 'm');
      expect(restored.playerId, 'p');
      expect(restored.resumeToken, 't');
      expect(restored.pendingResumeCommandId, 'c');
    });
  });
}
