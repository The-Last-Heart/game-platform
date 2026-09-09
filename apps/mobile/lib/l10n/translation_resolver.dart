import 'bootstrap_catalog.dart';
import 'locale_metadata.dart';
import 'translation_catalog.dart';

final RegExp _placeholderPattern = RegExp(r'\{([a-zA-Z_][a-zA-Z0-9_]*)\}');

class InterpolationResult {
  const InterpolationResult({
    required this.value,
    required this.missingParameters,
  });

  final String value;
  final List<String> missingParameters;

  bool get hasMissingParameters => missingParameters.isNotEmpty;
}

/// Named-parameter interpolation. Values are plain data only.
InterpolationResult interpolateTranslationDetailed(
  String template,
  Map<String, String> params,
) {
  final List<String> missing = <String>[];
  final String value = template.replaceAllMapped(_placeholderPattern, (
    Match match,
  ) {
    final String name = match.group(1)!;
    if (!params.containsKey(name)) {
      if (!missing.contains(name)) {
        missing.add(name);
      }
      return match.group(0)!;
    }
    return params[name]!;
  });
  return InterpolationResult(value: value, missingParameters: missing);
}

/// Resolves product copy using the documented fallback order.
class TranslationResolver {
  TranslationResolver({
    this.publishedCatalog,
    this.cachedCatalog,
    TranslationCatalog? bootstrapCatalog,
    this.selectedLocaleCode = 'ar',
    this.fallbackLocaleCode = 'ar',
    this.pinnedCatalogVersion,
    this.isProduction = true,
  }) : bootstrapCatalog = bootstrapCatalog ?? createBootstrapCatalog();

  final TranslationCatalog? publishedCatalog;
  final TranslationCatalog? cachedCatalog;
  final TranslationCatalog bootstrapCatalog;
  final String selectedLocaleCode;
  final String fallbackLocaleCode;
  final String? pinnedCatalogVersion;
  final bool isProduction;

  TranslationCatalog get activeCatalog {
    if (_isCompatible(publishedCatalog)) {
      return publishedCatalog!;
    }
    if (_isCompatible(cachedCatalog)) {
      return cachedCatalog!;
    }
    return bootstrapCatalog;
  }

  bool _isCompatible(TranslationCatalog? catalog) {
    if (catalog == null) {
      return false;
    }
    if (pinnedCatalogVersion == null) {
      return true;
    }
    return catalog.version == pinnedCatalogVersion;
  }

  LocaleMetadata resolveLocaleMetadata() {
    final String selected = normalizeCatalogToken(selectedLocaleCode);
    final String fallback = normalizeCatalogToken(fallbackLocaleCode);

    final List<LocaleMetadata?> candidates = <LocaleMetadata?>[
      if (_isCompatible(publishedCatalog))
        publishedCatalog!.localeMetadata(selected),
      if (_isCompatible(cachedCatalog)) cachedCatalog!.localeMetadata(selected),
      bootstrapCatalog.localeMetadata(selected),
      if (_isCompatible(publishedCatalog))
        publishedCatalog!.localeMetadata(fallback),
      if (_isCompatible(cachedCatalog)) cachedCatalog!.localeMetadata(fallback),
      bootstrapCatalog.localeMetadata(fallback),
    ];

    for (final LocaleMetadata? meta in candidates) {
      if (meta != null) {
        return meta;
      }
    }
    return defaultMobileLocale;
  }

  String resolve(
    String key, {
    Map<String, String> params = const <String, String>{},
  }) {
    final String normalizedKey = normalizeCatalogToken(key);
    if (normalizedKey.isEmpty) {
      throw ArgumentError.value(
        key,
        'key',
        'translation key must not be empty',
      );
    }

    final String? template = _lookupWithFallbacks(normalizedKey);
    if (template == null) {
      if (isProduction) {
        return _safeContentUnavailable();
      }
      return 'MISSING:$normalizedKey';
    }

    final InterpolationResult interpolated = interpolateTranslationDetailed(
      template,
      params,
    );
    if (interpolated.hasMissingParameters) {
      if (isProduction) {
        return _safeContentUnavailable();
      }
      final String missing = interpolated.missingParameters.join(',');
      throw StateError('MISSING_PARAMS:$normalizedKey:$missing');
    }
    return interpolated.value;
  }

  String _safeContentUnavailable() {
    final String? selected = bootstrapCatalog.lookup(
      selectedLocaleCode,
      TranslationKeys.errorsContentUnavailable,
    );
    if (selected != null) {
      return selected;
    }
    final String? arabic = bootstrapCatalog.lookup(
      fallbackLocaleCode,
      TranslationKeys.errorsContentUnavailable,
    );
    if (arabic != null) {
      return arabic;
    }
    return bootstrapCatalog.lookup(
          'en',
          TranslationKeys.errorsContentUnavailable,
        ) ??
        '…';
  }

  String? _lookupWithFallbacks(String key) {
    if (_isCompatible(publishedCatalog)) {
      final String? selected = publishedCatalog!.lookup(
        selectedLocaleCode,
        key,
      );
      if (selected != null) {
        return selected;
      }
      final String? arabic = publishedCatalog!.lookup(fallbackLocaleCode, key);
      if (arabic != null) {
        return arabic;
      }
    }

    if (_isCompatible(cachedCatalog)) {
      final String? selected = cachedCatalog!.lookup(selectedLocaleCode, key);
      if (selected != null) {
        return selected;
      }
      final String? arabic = cachedCatalog!.lookup(fallbackLocaleCode, key);
      if (arabic != null) {
        return arabic;
      }
    }

    final String? bootstrapSelected = bootstrapCatalog.lookup(
      selectedLocaleCode,
      key,
    );
    if (bootstrapSelected != null) {
      return bootstrapSelected;
    }

    return bootstrapCatalog.lookup(fallbackLocaleCode, key);
  }
}
