import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'features/entry/ui/app_entry_screen.dart';
import 'features/match/session/match_session_controller.dart';
import 'features/match/session/session_store.dart';
import 'features/match/transport/realtime_transport.dart';
import 'features/match/transport/socket_io_transport.dart';
import 'features/presence/presence_session.dart';
import 'l10n/app_localization.dart';
import 'l10n/locale_metadata.dart';
import 'l10n/translation_catalog.dart';
import 'l10n/translation_resolver.dart';
import 'theme/lh_tokens.dart';

/// Backend URL configured at build time:
/// `flutter run --dart-define=LH_BACKEND_URL=http://10.0.2.2:3000`
const String _backendUrl = String.fromEnvironment(
  'LH_BACKEND_URL',
  defaultValue: 'http://127.0.0.1:3000',
);

/// Provisional application identity.
///
/// Android application ID / iOS bundle identifier: `com.thelastheart.game`
/// Must be verified before store registration.
void main() {
  runApp(const TheLastHeartApp());
}

class TheLastHeartApp extends StatefulWidget {
  const TheLastHeartApp({
    super.key,
    this.translationResolver,
    this.transport,
    this.sessionStore,
    this.presence,
    this.backendBaseUrl,
  });

  /// Optional override for tests.
  final TranslationResolver? translationResolver;

  /// Optional transport override for tests.
  final RealtimeTransport? transport;

  /// Optional session store override for tests.
  final SessionStore? sessionStore;

  /// Optional occupancy override for tests.
  final PresenceSession? presence;

  /// Optional backend origin override for tests.
  final String? backendBaseUrl;

  @override
  State<TheLastHeartApp> createState() => _TheLastHeartAppState();
}

class _TheLastHeartAppState extends State<TheLastHeartApp> {
  late final TranslationResolver _resolver;
  late final RealtimeTransport _transport;
  late final SessionStore _store;
  late final MatchSessionController _controller;

  @override
  void initState() {
    super.initState();
    _resolver =
        widget.translationResolver ??
        TranslationResolver(
          selectedLocaleCode: defaultMobileLocale.localeCode,
          isProduction: kReleaseMode,
        );
    _transport = widget.transport ?? SocketIoTransport(url: _backendUrl);
    _store = widget.sessionStore ?? SecureSessionStore();
    _controller = MatchSessionController(
      transport: _transport,
      sessionStore: _store,
    );
    _controller.init();
    _controller.bootstrap();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final LocaleMetadata localeMeta = _resolver.resolveLocaleMetadata();
    final TextDirection textDirection = localeMeta.isRtl
        ? TextDirection.rtl
        : TextDirection.ltr;

    return AppLocalization(
      resolver: _resolver,
      child: MaterialApp(
        title: _resolver.resolve(TranslationKeys.appTitle),
        debugShowCheckedModeBanner: false,
        theme: buildLhTheme(),
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
        home: AppEntryScreen(
          controller: _controller,
          backendBaseUrl: widget.backendBaseUrl ?? _backendUrl,
          presence: widget.presence,
        ),
      ),
    );
  }
}
