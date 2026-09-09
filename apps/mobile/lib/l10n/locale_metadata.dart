/// Text direction associated with a locale. Derived from locale metadata —
/// never assumed from a language code alone beyond published metadata.
enum TextDirectionCode { ltr, rtl }

/// Metadata for a supported mobile/gameplay locale.
class LocaleMetadata {
  const LocaleMetadata({
    required this.localeCode,
    required this.displayName,
    required this.direction,
  }) : assert(localeCode != ''),
       assert(displayName != '');

  final String localeCode;
  final String displayName;
  final TextDirectionCode direction;

  bool get isRtl => direction == TextDirectionCode.rtl;

  /// Validates runtime-constructed metadata (e.g. from future catalog payloads).
  static LocaleMetadata validated({
    required String localeCode,
    required String displayName,
    required TextDirectionCode direction,
  }) {
    final String code = localeCode.trim();
    final String name = displayName.trim();
    if (code.isEmpty) {
      throw ArgumentError.value(localeCode, 'localeCode', 'must not be empty');
    }
    if (name.isEmpty) {
      throw ArgumentError.value(
        displayName,
        'displayName',
        'must not be empty',
      );
    }
    return LocaleMetadata(
      localeCode: code,
      displayName: name,
      direction: direction,
    );
  }
}

/// Default mobile locale: Arabic-first.
const LocaleMetadata defaultMobileLocale = LocaleMetadata(
  localeCode: 'ar',
  displayName: 'العربية',
  direction: TextDirectionCode.rtl,
);
