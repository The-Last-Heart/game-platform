import 'locale_metadata.dart';

/// Stable product translation keys used by the mobile foundation.
abstract final class TranslationKeys {
  static const String appTitle = 'app.title';
  static const String foundationReady = 'foundation.ready';
  static const String commonLoading = 'common.loading';
  static const String commonRetry = 'common.retry';
  static const String errorsOffline = 'errors.offline';
  static const String errorsTranslationCatalogUnavailable =
      'errors.translation_catalog_unavailable';
  static const String errorsMandatoryUpdate = 'errors.mandatory_update';
  static const String errorsContentUnavailable = 'errors.content_unavailable';
}

/// Shared normalization for catalog create/lookup/resolve.
String normalizeCatalogToken(String value) => value.trim();

/// Immutable translation catalog for one or more locales.
///
/// Translation values are data only. They must never contain executable code
/// and must not be rendered as HTML.
class TranslationCatalog {
  TranslationCatalog._({
    required this.version,
    required this.locales,
    required this.entries,
  });

  final String version;
  final Map<String, LocaleMetadata> locales;
  final Map<String, Map<String, String>> entries;

  /// Validates and freezes a catalog.
  factory TranslationCatalog.create({
    required String version,
    required Map<String, LocaleMetadata> locales,
    required Map<String, Map<String, String>> entries,
  }) {
    final String normalizedVersion = normalizeCatalogToken(version);
    if (normalizedVersion.isEmpty) {
      throw ArgumentError.value(version, 'version', 'must not be empty');
    }
    if (locales.isEmpty) {
      throw ArgumentError('locales must not be empty');
    }

    final Map<String, LocaleMetadata> frozenLocales =
        <String, LocaleMetadata>{};
    for (final MapEntry<String, LocaleMetadata> entry in locales.entries) {
      final String code = normalizeCatalogToken(entry.key);
      if (code.isEmpty) {
        throw ArgumentError('locale map keys must not be empty');
      }
      if (frozenLocales.containsKey(code)) {
        throw ArgumentError('duplicate locale code after normalization: $code');
      }
      final String metaCode = normalizeCatalogToken(entry.value.localeCode);
      if (metaCode != code) {
        throw ArgumentError(
          'locale metadata code "$metaCode" must match map key "$code"',
        );
      }
      if (normalizeCatalogToken(entry.value.displayName).isEmpty) {
        throw ArgumentError('locale "$code" displayName must not be empty');
      }
      frozenLocales[code] = LocaleMetadata(
        localeCode: code,
        displayName: entry.value.displayName.trim(),
        direction: entry.value.direction,
      );
    }

    final Map<String, Map<String, String>> frozenEntries =
        <String, Map<String, String>>{};
    for (final MapEntry<String, Map<String, String>> localeEntry
        in entries.entries) {
      final String localeCode = normalizeCatalogToken(localeEntry.key);
      if (localeCode.isEmpty) {
        throw ArgumentError('entry locale codes must not be empty');
      }
      if (!frozenLocales.containsKey(localeCode)) {
        throw ArgumentError('entries reference unknown locale "$localeCode"');
      }
      if (frozenEntries.containsKey(localeCode)) {
        throw ArgumentError(
          'duplicate entry locale after normalization: $localeCode',
        );
      }

      final Map<String, String> frozenForLocale = <String, String>{};
      for (final MapEntry<String, String> keyEntry
          in localeEntry.value.entries) {
        final String key = normalizeCatalogToken(keyEntry.key);
        if (key.isEmpty) {
          throw ArgumentError('translation keys must not be empty');
        }
        if (frozenForLocale.containsKey(key)) {
          throw ArgumentError(
            'duplicate translation key after normalization: $key',
          );
        }
        final String value = keyEntry.value.trim();
        if (value.isEmpty) {
          throw ArgumentError(
            'translation values must not be empty or whitespace-only',
          );
        }
        frozenForLocale[key] = value;
      }
      frozenEntries[localeCode] = Map<String, String>.unmodifiable(
        frozenForLocale,
      );
    }

    return TranslationCatalog._(
      version: normalizedVersion,
      locales: Map<String, LocaleMetadata>.unmodifiable(frozenLocales),
      entries: Map<String, Map<String, String>>.unmodifiable(frozenEntries),
    );
  }

  String? lookup(String localeCode, String key) {
    final String normalizedLocale = normalizeCatalogToken(localeCode);
    final String normalizedKey = normalizeCatalogToken(key);
    if (normalizedLocale.isEmpty || normalizedKey.isEmpty) {
      return null;
    }
    return entries[normalizedLocale]?[normalizedKey];
  }

  LocaleMetadata? localeMetadata(String localeCode) {
    return locales[normalizeCatalogToken(localeCode)];
  }
}
