import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/identity/data/display_name_moderation.dart';

void main() {
  test('format allows one or two letter parts only', () {
    expect(isValidDisplayNameFormat('Ahmad'), isTrue);
    expect(isValidDisplayNameFormat('Ahmad Khaled'), isTrue);
    expect(isValidDisplayNameFormat('أحمد خالد'), isTrue);
    expect(isValidDisplayNameFormat('Ahmad Khaled XF'), isFalse);
    expect(isValidDisplayNameFormat('Ahmad2'), isFalse);
    expect(isValidDisplayNameFormat('Ahmad-Khaled'), isFalse);
    expect(isValidDisplayNameFormat(r'$hit'), isFalse);
    expect(normalizeDisplayNameFormat('  Ahmad   Khaled '), 'Ahmad Khaled');
  });
}
