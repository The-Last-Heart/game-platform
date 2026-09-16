import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/identity/data/display_name_moderation.dart';

void main() {
  test('allows clean names', () {
    expect(isProhibitedDisplayName('وجدي'), isFalse);
    expect(isProhibitedDisplayName('Wajdi'), isFalse);
    expect(isProhibitedDisplayName('عكس'), isFalse);
  });

  test('blocks English obfuscation', () {
    expect(isProhibitedDisplayName(r'$hit'), isTrue);
    expect(isProhibitedDisplayName('@nal'), isTrue);
    expect(isProhibitedDisplayName('blow job'), isTrue);
  });

  test('blocks Arabic obfuscation', () {
    expect(isProhibitedDisplayName('كس'), isTrue);
    expect(isProhibitedDisplayName('طيز'), isTrue);
    expect(isProhibitedDisplayName('كسمك'), isTrue);
    expect(isProhibitedDisplayName('كوس اوماك'), isTrue);
  });

  test('format allows one or two letter parts only', () {
    expect(isValidDisplayNameFormat('Ahmad'), isTrue);
    expect(isValidDisplayNameFormat('Ahmad Khaled'), isTrue);
    expect(isValidDisplayNameFormat('أحمد خالد'), isTrue);
    expect(isValidDisplayNameFormat('Ahmad Khaled XF'), isFalse);
    expect(isValidDisplayNameFormat('Ahmad2'), isFalse);
    expect(isValidDisplayNameFormat('Ahmad-Khaled'), isFalse);
    expect(normalizeDisplayNameFormat('  Ahmad   Khaled '), 'Ahmad Khaled');
  });
}
