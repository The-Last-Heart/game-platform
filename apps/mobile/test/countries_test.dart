import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/identity/data/countries.dart';

void main() {
  test('country list is unique ISO codes with flags', () {
    final Set<String> codes = <String>{};
    for (final PlayerCountry country in kPlayerCountries) {
      expect(country.code.length, 2);
      expect(country.code, country.code.toUpperCase());
      expect(codes.add(country.code), isTrue, reason: country.code);
      expect(country.flagEmoji.isNotEmpty, isTrue);
      expect(country.nameAr.isNotEmpty, isTrue);
      expect(country.nameEn.isNotEmpty, isTrue);
    }
    expect(kPlayerCountries, isNotEmpty);
    expect(isPlayerCountryCode('SA'), isTrue);
    expect(isPlayerCountryCode('XX'), isFalse);
    expect(playerCountryByCode('EG')?.nameEn, 'Egypt');
  });
}
