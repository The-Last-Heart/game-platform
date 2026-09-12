import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/protocol/envelope_validation.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';

/// Tests that Flutter models correctly decode the canonical fixture envelopes
/// from test/fixtures/realtime_envelopes.json (hand-authored parity with
/// packages/contracts realtime v1).
void main() {
  late Map<String, dynamic> fixtures;

  setUpAll(() {
    final File file = File('test/fixtures/realtime_envelopes.json');
    fixtures = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  });

  group('Envelope decoding from fixtures', () {
    test('session_accepted player shape', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['session_accepted'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.sessionAccepted);
      expect(env.schemaVersion, '1');
      expect(env.matchId, 'match-abc');
      expect(env.commandId, 'cmd-001');

      final SessionAcceptedPayload payload = SessionAcceptedPayload.fromJson(
        env.payload!,
      );
      expect(payload.matchId, 'match-abc');
      expect(payload.playerId, 'player-1');
      expect(payload.resumeToken, 'tok-abc-123');
      expect(payload.role, isNull);
      expect(payload.isPlayer, isTrue);
      expect(payload.isCreator, isFalse);
    });

    test('session_accepted creator shape', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['session_accepted_creator'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.sessionAccepted);
      expect(env.commandId, 'cmd-001b');

      final SessionAcceptedPayload payload = SessionAcceptedPayload.fromJson(
        env.payload!,
      );
      expect(payload.matchId, 'match-abc');
      expect(payload.role, 'creator');
      expect(payload.playerId, isNull);
      expect(payload.resumeToken, isNull);
      expect(payload.isCreator, isTrue);
      expect(payload.isPlayer, isFalse);
    });

    test('session.accepted rejects mixed creator+credentials', () {
      expect(
        SessionAcceptedPayload.tryParse(<String, dynamic>{
          'matchId': 'match-abc',
          'playerId': 'player-1',
          'resumeToken': 'tok',
          'role': 'creator',
        }),
        isNull,
      );
    });

    test('session.accepted rejects partial player credentials', () {
      expect(
        SessionAcceptedPayload.tryParse(<String, dynamic>{
          'matchId': 'match-abc',
          'playerId': 'player-1',
        }),
        isNull,
      );
    });

    test('session.accepted rejects unknown extra fields', () {
      expect(
        SessionAcceptedPayload.tryParse(<String, dynamic>{
          'matchId': 'match-abc',
          'role': 'creator',
          'extra': true,
        }),
        isNull,
      );
    });

    test('match_snapshot_lobby', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['match_snapshot_lobby'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.matchSnapshot);
      expect(env.serverSequence, 3);

      final MatchSnapshotPayload snap = MatchSnapshotPayload.fromJson(
        env.payload!,
      );
      expect(snap.matchId, 'match-abc');
      expect(snap.phase, MatchPhase.lobby);
      expect(snap.players.length, 2);
      expect(snap.players[0].playerId, 'player-1');
      expect(snap.players[0].hearts, 3);
      expect(snap.winnerId, isNull);
      expect(snap.currentChallenge, isNull);
    });

    test('match_snapshot_challenge_active', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['match_snapshot_challenge_active'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      final MatchSnapshotPayload snap = MatchSnapshotPayload.fromJson(
        env.payload!,
      );
      expect(snap.phase, MatchPhase.challengeActive);
      expect(snap.currentChallenge, isNotNull);
      expect(snap.currentChallenge!.engineId, 'reaction.wait_for_signal');
      expect(snap.currentChallenge!.roundPhase, RoundPhase.waitingSignal);
      expect(snap.currentChallenge!.durationMs, 5000);
    });

    test('challenge_started', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['challenge_started'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.challengeStarted);
      final PublicChallenge challenge = PublicChallenge.fromJson(env.payload!);
      expect(challenge.engineId, 'reaction.wait_for_signal');
      expect(challenge.durationMs, 5000);
      expect(challenge.roundPhase, RoundPhase.waitingSignal);
    });

    test('challenge_signal', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['challenge_signal'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.challengeSignal);
      final ChallengeSignalPayload signal = ChallengeSignalPayload.fromJson(
        env.payload!,
      );
      expect(signal.signalToken, 'signal-tok-xyz');
      expect(signal.challengeInstanceId, 'ch-inst-1');
      expect(signal.signalEndsAtMs, 1700000012000);
    });

    test('challenge_signal_ended', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['challenge_signal_ended'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.challengeSignalEnded);
      final ChallengeSignalEndedPayload ended =
          ChallengeSignalEndedPayload.fromJson(env.payload!);
      expect(ended.challengeInstanceId, 'ch-inst-1');
      expect(ended.signalEndsAtMs, 1700000012000);
    });

    test('challenge_submission_ack', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['challenge_submission_ack'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.challengeSubmissionAck);
      final ChallengeSubmissionAckPayload ack =
          ChallengeSubmissionAckPayload.fromJson(env.payload!);
      expect(ack.accepted, isTrue);
      expect(ack.duplicate, isFalse);
    });

    test('challenge_resolved', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['challenge_resolved'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.challengeResolved);
      final ChallengeResolvedPayload resolved =
          ChallengeResolvedPayload.fromJson(env.payload!);
      expect(resolved.resolutions.length, 2);
      expect(resolved.resolutions[0].outcome, 'success');
      expect(resolved.resolutions[1].heartsDelta, -1);
    });

    test('match_state_changed', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['match_state_changed'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.matchStateChanged);
      final MatchStateChangedPayload changed =
          MatchStateChangedPayload.fromJson(env.payload!);
      expect(changed.status, 'completed');
      expect(changed.reasonKey, 'errors.match.unsafe_zero_survivors');
    });

    test('match_finished', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['match_finished'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.matchFinished);
      final MatchFinishedPayload finished = MatchFinishedPayload.fromJson(
        env.payload!,
      );
      expect(finished.winnerId, 'player-1');
    });

    test('protocol_error', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['protocol_error'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.protocolError);
      final ProtocolErrorPayload error = ProtocolErrorPayload.fromJson(
        env.payload!,
      );
      expect(error.code, 'MATCH_NOT_FOUND');
      expect(error.messageKey, 'errors.match.not_found');
    });

    test('player_presence', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['player_presence'] as Map,
      );
      final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
      expect(env.type, MessageTypes.playerPresence);
      final PlayerPresencePayload presence = PlayerPresencePayload.fromJson(
        env.payload!,
      );
      expect(presence.playerId, 'player-3');
      expect(presence.presence, Presence.connected);
      expect(presence.joined, isTrue);
    });

    test('all fixture envelopes decode without error', () {
      for (final MapEntry<String, dynamic> entry in fixtures.entries) {
        final Map<String, dynamic> raw = Map<String, dynamic>.from(
          entry.value as Map,
        );
        final RealtimeEnvelope env = RealtimeEnvelope.fromJson(raw);
        expect(env.schemaVersion, '1', reason: '${entry.key} schemaVersion');
        expect(env.type, isNotEmpty, reason: '${entry.key} type');
        expect(env.messageId, isNotEmpty, reason: '${entry.key} messageId');
      }
    });

    test('all fixture envelopes pass mobile validation', () {
      for (final MapEntry<String, dynamic> entry in fixtures.entries) {
        final Map<String, dynamic> raw = Map<String, dynamic>.from(
          entry.value as Map,
        );
        final EnvelopeValidation result = validateServerEnvelope(raw);
        expect(
          result.isValid,
          isTrue,
          reason: '${entry.key}: ${result.reason}',
        );
      }
    });

    test('unsupported schemaVersion is rejected before side effects', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['match_snapshot_lobby'] as Map,
      );
      raw['schemaVersion'] = '999';
      expect(validateServerEnvelope(raw).isValid, isFalse);
    });

    test('envelope/payload matchId disagreement is rejected', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['match_snapshot_lobby'] as Map,
      );
      raw['matchId'] = 'match-OTHER';
      expect(validateServerEnvelope(raw).isValid, isFalse);
    });

    test('negative serverSequence is rejected', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['player_presence'] as Map,
      );
      raw['serverSequence'] = -1;
      expect(validateServerEnvelope(raw).isValid, isFalse);
    });

    test('non-integer serverTimestampMs is rejected', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['player_presence'] as Map,
      );
      raw['serverTimestampMs'] = 'soon';
      expect(validateServerEnvelope(raw).isValid, isFalse);
    });

    test('protocol.error rejects non-contract code', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['protocol_error'] as Map,
      );
      (raw['payload'] as Map<String, dynamic>)['code'] = 'SESSION_EXPIRED';
      expect(validateServerEnvelope(raw).isValid, isFalse);
    });

    test('protocol.error accepts INTERNAL_ERROR', () {
      final Map<String, dynamic> raw = Map<String, dynamic>.from(
        fixtures['protocol_error'] as Map,
      );
      (raw['payload'] as Map<String, dynamic>)['code'] = 'INTERNAL_ERROR';
      expect(validateServerEnvelope(raw).isValid, isTrue);
    });

    test('malformed payloads from each event family are rejected', () {
      final Map<String, Map<String, dynamic>> malformed =
          <String, Map<String, dynamic>>{
            MessageTypes.sessionAccepted: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.sessionAccepted,
              'messageId': 'm1',
              'commandId': 'c1',
              'payload': <String, dynamic>{
                'matchId': 'm',
                'role': 'creator',
                'extra': 1,
              },
            },
            MessageTypes.matchSnapshot: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.matchSnapshot,
              'messageId': 'm2',
              'matchId': 'match-1',
              'serverSequence': 1,
              'payload': <String, dynamic>{'matchId': 'match-1', 'sequence': 1},
            },
            MessageTypes.playerPresence: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.playerPresence,
              'messageId': 'm3',
              'matchId': 'match-1',
              'serverSequence': 1,
              'payload': <String, dynamic>{
                'playerId': 'p1',
                'presence': 'online',
                'joined': true,
              },
            },
            MessageTypes.challengeStarted: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.challengeStarted,
              'messageId': 'm4',
              'matchId': 'match-1',
              'serverSequence': 1,
              'payload': <String, dynamic>{'challengeInstanceId': 'ch'},
            },
            MessageTypes.challengeSignal: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.challengeSignal,
              'messageId': 'm5',
              'matchId': 'match-1',
              'serverSequence': 1,
              'payload': <String, dynamic>{
                'challengeInstanceId': 'ch',
                'signalToken': '',
                'signaledAtMs': 1,
                'signalEndsAtMs': 2,
                'serverNowMs': 1,
              },
            },
            MessageTypes.challengeSignalEnded: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.challengeSignalEnded,
              'messageId': 'm5b',
              'matchId': 'match-1',
              'serverSequence': 1,
              'payload': <String, dynamic>{
                'challengeInstanceId': 'ch',
                'signalEndsAtMs': -1,
                'serverNowMs': 1,
              },
            },
            MessageTypes.challengeSubmissionAck: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.challengeSubmissionAck,
              'messageId': 'm6',
              'commandId': 'c6',
              'payload': <String, dynamic>{'accepted': 'yes'},
            },
            MessageTypes.challengeResolved: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.challengeResolved,
              'messageId': 'm7',
              'matchId': 'match-1',
              'serverSequence': 1,
              'payload': <String, dynamic>{
                'challengeInstanceId': 'ch',
                'resolutions': <Object?>['bad'],
              },
            },
            MessageTypes.matchStateChanged: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.matchStateChanged,
              'messageId': 'm8',
              'matchId': 'match-1',
              'serverSequence': 1,
              'payload': <String, dynamic>{'status': 'halted'},
            },
            MessageTypes.matchFinished: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.matchFinished,
              'messageId': 'm9',
              'matchId': 'match-1',
              'serverSequence': 1,
              'payload': <String, dynamic>{},
            },
            MessageTypes.protocolError: <String, dynamic>{
              'schemaVersion': '1',
              'type': MessageTypes.protocolError,
              'messageId': 'm10',
              'payload': <String, dynamic>{
                'code': 'NOT_A_REAL_CODE',
                'messageKey': 'errors.x',
              },
            },
          };

      for (final MapEntry<String, Map<String, dynamic>> entry
          in malformed.entries) {
        expect(
          validateServerEnvelope(entry.value).isValid,
          isFalse,
          reason: entry.key,
        );
      }
    });

    test('contract protocol error codes set matches Zod enum size', () {
      expect(protocolErrorCodes.length, 13);
      expect(protocolErrorCodes.contains('INTERNAL_ERROR'), isTrue);
      expect(protocolErrorCodes.contains('SESSION_EXPIRED'), isFalse);
      expect(protocolErrorCodes.contains('MATCH_COMPLETED'), isFalse);
    });
  });
}
