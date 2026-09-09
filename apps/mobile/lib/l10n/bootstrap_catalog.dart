import 'locale_metadata.dart';
import 'translation_catalog.dart';

/// Minimal bundled bootstrap catalog for recovery before a server catalog is
/// available. This is a resilience fallback — not the primary translation source.
///
/// Do not expand this into a complete game translation catalog.
TranslationCatalog createBootstrapCatalog() {
  return TranslationCatalog.create(
    version: 'bootstrap-0',
    locales: const <String, LocaleMetadata>{
      'ar': defaultMobileLocale,
      'en': LocaleMetadata(
        localeCode: 'en',
        displayName: 'English',
        direction: TextDirectionCode.ltr,
      ),
    },
    entries: const <String, Map<String, String>>{
      'ar': <String, String>{
        TranslationKeys.appTitle: 'آخر قلب',
        TranslationKeys.foundationReady: 'Foundation ready',
        TranslationKeys.commonLoading: 'جاري التحميل',
        TranslationKeys.commonRetry: 'إعادة المحاولة',
        TranslationKeys.errorsOffline: 'لا يوجد اتصال بالإنترنت',
        TranslationKeys.errorsTranslationCatalogUnavailable:
            'تعذر تحميل ترجمات التطبيق',
        TranslationKeys.errorsMandatoryUpdate: 'يلزم تحديث التطبيق للمتابعة',
        TranslationKeys.errorsContentUnavailable: 'المحتوى غير متاح',
      },
      'en': <String, String>{
        TranslationKeys.appTitle: 'The Last Heart',
        TranslationKeys.foundationReady: 'Foundation ready',
        TranslationKeys.commonLoading: 'Loading',
        TranslationKeys.commonRetry: 'Retry',
        TranslationKeys.errorsOffline: 'You are offline',
        TranslationKeys.errorsTranslationCatalogUnavailable:
            'Translation catalog unavailable',
        TranslationKeys.errorsMandatoryUpdate:
            'A mandatory update is required to continue',
        TranslationKeys.errorsContentUnavailable: 'Content unavailable',
      },
    },
  );
}
