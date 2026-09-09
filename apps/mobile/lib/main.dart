import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'l10n/app_localization.dart';
import 'l10n/locale_metadata.dart';
import 'l10n/translation_catalog.dart';
import 'l10n/translation_resolver.dart';

/// Provisional application identity.
///
/// Android application ID / iOS bundle identifier: `com.thelastheart.game`
/// Must be verified before store registration.
void main() {
  runApp(const TheLastHeartApp());
}

class TheLastHeartApp extends StatelessWidget {
  const TheLastHeartApp({super.key, this.translationResolver});

  /// Optional override for tests.
  final TranslationResolver? translationResolver;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver =
        translationResolver ??
        TranslationResolver(
          selectedLocaleCode: defaultMobileLocale.localeCode,
          // Debug/profile surface missing keys; release never shows raw keys.
          isProduction: kReleaseMode,
        );
    final LocaleMetadata localeMeta = resolver.resolveLocaleMetadata();
    final TextDirection textDirection = localeMeta.isRtl
        ? TextDirection.rtl
        : TextDirection.ltr;

    return AppLocalization(
      resolver: resolver,
      child: MaterialApp(
        title: resolver.resolve(TranslationKeys.appTitle),
        debugShowCheckedModeBanner: false,
        locale: Locale(localeMeta.localeCode),
        supportedLocales: <Locale>[Locale(localeMeta.localeCode)],
        localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        builder: (BuildContext context, Widget? child) {
          return Directionality(
            textDirection: textDirection,
            child: child ?? const SizedBox.shrink(),
          );
        },
        home: const FoundationScreen(),
      ),
    );
  }
}

/// Minimal neutral startup screen for LH-001.
class FoundationScreen extends StatelessWidget {
  const FoundationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final AppLocalization l10n = context
        .dependOnInheritedWidgetOfExactType<AppLocalization>()!;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Text(
                l10n.t(TranslationKeys.appTitle),
                style: textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              Text(
                l10n.t(TranslationKeys.foundationReady),
                style: textTheme.titleMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
