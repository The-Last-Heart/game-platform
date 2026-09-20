import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/identity/data/player_claim_client.dart';

void main() {
  group('claimErrorKeyFromBody', () {
    test('reads nested message.key (legacy Nest shape)', () {
      expect(
        claimErrorKeyFromBody(
          '{"message":{"code":"DISPLAY_NAME_PROHIBITED","key":"errors.identity.name_prohibited"}}',
        ),
        'errors.identity.name_prohibited',
      );
    });

    test('reads top-level key', () {
      expect(
        claimErrorKeyFromBody(
          '{"code":"DISPLAY_NAME_PROHIBITED","key":"errors.identity.name_prohibited"}',
        ),
        'errors.identity.name_prohibited',
      );
    });

    test('maps code when key missing', () {
      expect(
        claimErrorKeyFromBody('{"code":"DISPLAY_NAME_INVALID"}'),
        'errors.identity.name_invalid',
      );
    });
  });
}
