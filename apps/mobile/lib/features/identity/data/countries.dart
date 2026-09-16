import 'package:flutter/foundation.dart';

/// Predefined ISO 3166-1 alpha-2 countries for player identity.
/// Keep codes in sync with packages/contracts/src/identity/v1/countries.ts.
@immutable
class PlayerCountry {
  const PlayerCountry({
    required this.code,
    required this.nameAr,
    required this.nameEn,
  });

  final String code;
  final String nameAr;
  final String nameEn;

  /// Regional-indicator flag emoji derived from the ISO code.
  String get flagEmoji {
    final String upper = code.toUpperCase();
    if (upper.length != 2) {
      return '🏳️';
    }
    final int first = upper.codeUnitAt(0) - 0x41 + 0x1F1E6;
    final int second = upper.codeUnitAt(1) - 0x41 + 0x1F1E6;
    return String.fromCharCodes(<int>[first, second]);
  }

  String localizedName(String localeCode) =>
      localeCode.toLowerCase().startsWith('ar') ? nameAr : nameEn;
}

const List<PlayerCountry> kPlayerCountries = <PlayerCountry>[
  PlayerCountry(code: 'AE', nameAr: 'الإمارات', nameEn: 'United Arab Emirates'),
  PlayerCountry(code: 'AR', nameAr: 'الأرجنتين', nameEn: 'Argentina'),
  PlayerCountry(code: 'AT', nameAr: 'النمسا', nameEn: 'Austria'),
  PlayerCountry(code: 'AU', nameAr: 'أستراليا', nameEn: 'Australia'),
  PlayerCountry(code: 'AZ', nameAr: 'أذربيجان', nameEn: 'Azerbaijan'),
  PlayerCountry(code: 'BA', nameAr: 'البوسنة والهرسك', nameEn: 'Bosnia and Herzegovina'),
  PlayerCountry(code: 'BD', nameAr: 'بنغلاديش', nameEn: 'Bangladesh'),
  PlayerCountry(code: 'BE', nameAr: 'بلجيكا', nameEn: 'Belgium'),
  PlayerCountry(code: 'BH', nameAr: 'البحرين', nameEn: 'Bahrain'),
  PlayerCountry(code: 'BR', nameAr: 'البرازيل', nameEn: 'Brazil'),
  PlayerCountry(code: 'CA', nameAr: 'كندا', nameEn: 'Canada'),
  PlayerCountry(code: 'CH', nameAr: 'سويسرا', nameEn: 'Switzerland'),
  PlayerCountry(code: 'CL', nameAr: 'تشيلي', nameEn: 'Chile'),
  PlayerCountry(code: 'CN', nameAr: 'الصين', nameEn: 'China'),
  PlayerCountry(code: 'CO', nameAr: 'كولومبيا', nameEn: 'Colombia'),
  PlayerCountry(code: 'CZ', nameAr: 'التشيك', nameEn: 'Czechia'),
  PlayerCountry(code: 'DE', nameAr: 'ألمانيا', nameEn: 'Germany'),
  PlayerCountry(code: 'DJ', nameAr: 'جيبوتي', nameEn: 'Djibouti'),
  PlayerCountry(code: 'DK', nameAr: 'الدنمارك', nameEn: 'Denmark'),
  PlayerCountry(code: 'DZ', nameAr: 'الجزائر', nameEn: 'Algeria'),
  PlayerCountry(code: 'EG', nameAr: 'مصر', nameEn: 'Egypt'),
  PlayerCountry(code: 'ES', nameAr: 'إسبانيا', nameEn: 'Spain'),
  PlayerCountry(code: 'FI', nameAr: 'فنلندا', nameEn: 'Finland'),
  PlayerCountry(code: 'FR', nameAr: 'فرنسا', nameEn: 'France'),
  PlayerCountry(code: 'GB', nameAr: 'المملكة المتحدة', nameEn: 'United Kingdom'),
  PlayerCountry(code: 'GR', nameAr: 'اليونان', nameEn: 'Greece'),
  PlayerCountry(code: 'HK', nameAr: 'هونغ كونغ', nameEn: 'Hong Kong'),
  PlayerCountry(code: 'HU', nameAr: 'هنغاريا', nameEn: 'Hungary'),
  PlayerCountry(code: 'ID', nameAr: 'إندونيسيا', nameEn: 'Indonesia'),
  PlayerCountry(code: 'IE', nameAr: 'أيرلندا', nameEn: 'Ireland'),
  PlayerCountry(code: 'IN', nameAr: 'الهند', nameEn: 'India'),
  PlayerCountry(code: 'IQ', nameAr: 'العراق', nameEn: 'Iraq'),
  PlayerCountry(code: 'IR', nameAr: 'إيران', nameEn: 'Iran'),
  PlayerCountry(code: 'IT', nameAr: 'إيطاليا', nameEn: 'Italy'),
  PlayerCountry(code: 'JO', nameAr: 'الأردن', nameEn: 'Jordan'),
  PlayerCountry(code: 'JP', nameAr: 'اليابان', nameEn: 'Japan'),
  PlayerCountry(code: 'KE', nameAr: 'كينيا', nameEn: 'Kenya'),
  PlayerCountry(code: 'KM', nameAr: 'جزر القمر', nameEn: 'Comoros'),
  PlayerCountry(code: 'KR', nameAr: 'كوريا الجنوبية', nameEn: 'South Korea'),
  PlayerCountry(code: 'KW', nameAr: 'الكويت', nameEn: 'Kuwait'),
  PlayerCountry(code: 'LB', nameAr: 'لبنان', nameEn: 'Lebanon'),
  PlayerCountry(code: 'LY', nameAr: 'ليبيا', nameEn: 'Libya'),
  PlayerCountry(code: 'MA', nameAr: 'المغرب', nameEn: 'Morocco'),
  PlayerCountry(code: 'MR', nameAr: 'موريتانيا', nameEn: 'Mauritania'),
  PlayerCountry(code: 'MX', nameAr: 'المكسيك', nameEn: 'Mexico'),
  PlayerCountry(code: 'MY', nameAr: 'ماليزيا', nameEn: 'Malaysia'),
  PlayerCountry(code: 'NG', nameAr: 'نيجيريا', nameEn: 'Nigeria'),
  PlayerCountry(code: 'NL', nameAr: 'هولندا', nameEn: 'Netherlands'),
  PlayerCountry(code: 'NO', nameAr: 'النرويج', nameEn: 'Norway'),
  PlayerCountry(code: 'NZ', nameAr: 'نيوزيلندا', nameEn: 'New Zealand'),
  PlayerCountry(code: 'OM', nameAr: 'عُمان', nameEn: 'Oman'),
  PlayerCountry(code: 'PH', nameAr: 'الفلبين', nameEn: 'Philippines'),
  PlayerCountry(code: 'PK', nameAr: 'باكستان', nameEn: 'Pakistan'),
  PlayerCountry(code: 'PL', nameAr: 'بولندا', nameEn: 'Poland'),
  PlayerCountry(code: 'PS', nameAr: 'فلسطين', nameEn: 'Palestine'),
  PlayerCountry(code: 'PT', nameAr: 'البرتغال', nameEn: 'Portugal'),
  PlayerCountry(code: 'QA', nameAr: 'قطر', nameEn: 'Qatar'),
  PlayerCountry(code: 'RO', nameAr: 'رومانيا', nameEn: 'Romania'),
  PlayerCountry(code: 'RU', nameAr: 'روسيا', nameEn: 'Russia'),
  PlayerCountry(code: 'SA', nameAr: 'السعودية', nameEn: 'Saudi Arabia'),
  PlayerCountry(code: 'SD', nameAr: 'السودان', nameEn: 'Sudan'),
  PlayerCountry(code: 'SE', nameAr: 'السويد', nameEn: 'Sweden'),
  PlayerCountry(code: 'SG', nameAr: 'سنغافورة', nameEn: 'Singapore'),
  PlayerCountry(code: 'SO', nameAr: 'الصومال', nameEn: 'Somalia'),
  PlayerCountry(code: 'SY', nameAr: 'سوريا', nameEn: 'Syria'),
  PlayerCountry(code: 'TH', nameAr: 'تايلاند', nameEn: 'Thailand'),
  PlayerCountry(code: 'TN', nameAr: 'تونس', nameEn: 'Tunisia'),
  PlayerCountry(code: 'TR', nameAr: 'تركيا', nameEn: 'Turkey'),
  PlayerCountry(code: 'UA', nameAr: 'أوكرانيا', nameEn: 'Ukraine'),
  PlayerCountry(code: 'US', nameAr: 'الولايات المتحدة', nameEn: 'United States'),
  PlayerCountry(code: 'UZ', nameAr: 'أوزبكستان', nameEn: 'Uzbekistan'),
  PlayerCountry(code: 'YE', nameAr: 'اليمن', nameEn: 'Yemen'),
  PlayerCountry(code: 'ZA', nameAr: 'جنوب أفريقيا', nameEn: 'South Africa'),
];

final Set<String> kPlayerCountryCodes = <String>{
  for (final PlayerCountry c in kPlayerCountries) c.code,
};

PlayerCountry? playerCountryByCode(String? code) {
  if (code == null || code.isEmpty) {
    return null;
  }
  for (final PlayerCountry country in kPlayerCountries) {
    if (country.code == code) {
      return country;
    }
  }
  return null;
}

bool isPlayerCountryCode(String code) => kPlayerCountryCodes.contains(code);

List<PlayerCountry> playerCountriesSortedForLocale(String localeCode) {
  final List<PlayerCountry> copy = List<PlayerCountry>.from(kPlayerCountries);
  copy.sort(
    (PlayerCountry a, PlayerCountry b) =>
        a.localizedName(localeCode).compareTo(b.localizedName(localeCode)),
  );
  return copy;
}
