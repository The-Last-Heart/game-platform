import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/protocol/envelope_validation.dart';

void main() {
  test('accepts LH-005 training snapshot with mode and identity fields', () {
    final Map<String, dynamic> envelope = <String, dynamic>{
      'schemaVersion': '1',
      'type': 'match.snapshot',
      'messageId': 'a55545d6-c39e-43f2-bb01-a21702e930ef',
      'matchId': '68dec0f8-66fa-4e14-b27e-ad9b0dc3f89f',
      'commandId': '4a4bc6d4-6052-48ae-a9db-20165515ddcf',
      'serverSequence': 1,
      'serverTimestampMs': 1789143022724,
      'payload': <String, dynamic>{
        'matchId': '68dec0f8-66fa-4e14-b27e-ad9b0dc3f89f',
        'status': 'waiting',
        'phase': 'lobby',
        'phaseDeadlineAtMs': null,
        'roundNumber': 0,
        'serverNowMs': 1789143022724,
        'lastRoundResult': null,
        'nextPhaseAtMs': null,
        'revision': 2,
        'sequence': 1,
        'winnerId': null,
        'mode': 'training',
        'hostPlayerId': null,
        'roomCode': null,
        'players': <Map<String, dynamic>>[
          <String, dynamic>{
            'playerId': 'ed461ca6-d5d5-45e5-96a7-15294501d5dc',
            'hearts': 3,
            'energy': 0,
            'status': 'active',
            'presence': 'connected',
            'submittedForCurrentChallenge': false,
            'displayName': 'وجدي',
            'avatarColor': '#FF3045',
            'ready': true,
            'isHost': false,
          },
        ],
        'currentChallenge': null,
      },
    };

    final EnvelopeValidation result = validateServerEnvelope(envelope);
    expect(result.isValid, isTrue, reason: result.reason);
  });
}
