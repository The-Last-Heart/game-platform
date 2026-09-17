import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/entry/ui/app_entry_screen.dart';
import 'package:game/features/identity/data/identity_store.dart';
import 'package:game/features/match/session/match_session_controller.dart';
import 'package:game/features/match/session/session_store.dart';
import 'package:game/features/match/transport/fake_transport.dart';
import 'package:game/features/presence/presence_session.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/bootstrap_catalog.dart';
import 'package:game/l10n/translation_catalog.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/theme/lh_tokens.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('bootstrap has splash asset failure keys in ar and en', () {
    final TranslationCatalog bootstrap = createBootstrapCatalog();
    const List<String> keys = <String>[
      TranslationKeys.splashAssetsFailed,
      TranslationKeys.splashRetry,
    ];
    for (final String locale in <String>['ar', 'en']) {
      for (final String key in keys) {
        final String? value = bootstrap.lookup(locale, key);
        expect(value, isNotNull, reason: '$locale:$key');
        expect(value!.trim(), isNotEmpty, reason: '$locale:$key blank');
      }
    }
    expect(bootstrap.lookup('en', TranslationKeys.splashRetry), 'Retry again');
    expect(
      bootstrap.lookup('ar', TranslationKeys.splashRetry),
      'حاول مرة أخرى',
    );
  });

  testWidgets('failed pack sync stays on splash with retry, not home', (
    WidgetTester tester,
  ) async {
    final TranslationResolver resolver = TranslationResolver(
      isProduction: false,
    );
    final MatchSessionController controller = MatchSessionController(
      transport: FakeTransport(),
      sessionStore: MemorySessionStore(),
    );
    int syncCalls = 0;

    await tester.pumpWidget(
      _wrapEntry(
        resolver: resolver,
        controller: controller,
        contentPackSync:
            ({
              required String backendBaseUrl,
              void Function(double progress)? onProgress,
            }) async {
              syncCalls += 1;
              onProgress?.call(0.4);
              return false;
            },
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(syncCalls, 3);
    expect(
      find.text(resolver.resolve(TranslationKeys.splashAssetsFailed)),
      findsOneWidget,
    );
    expect(find.byKey(const Key('splash-asset-retry')), findsOneWidget);
    expect(
      find.text(resolver.resolve(TranslationKeys.splashRetry)),
      findsOneWidget,
    );
    expect(
      find.text(resolver.resolve(TranslationKeys.homePlayNow)),
      findsNothing,
    );

    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });

  testWidgets('retry after failed pack sync can enter home', (
    WidgetTester tester,
  ) async {
    final TranslationResolver resolver = TranslationResolver(
      isProduction: false,
    );
    final MatchSessionController controller = MatchSessionController(
      transport: FakeTransport(),
      sessionStore: MemorySessionStore(),
    );
    bool allowSuccess = false;

    await tester.pumpWidget(
      _wrapEntry(
        resolver: resolver,
        controller: controller,
        contentPackSync:
            ({
              required String backendBaseUrl,
              void Function(double progress)? onProgress,
            }) async {
              onProgress?.call(1);
              return allowSuccess;
            },
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.byKey(const Key('splash-asset-retry')), findsOneWidget);
    expect(
      find.text(resolver.resolve(TranslationKeys.homePlayNow)),
      findsNothing,
    );

    allowSuccess = true;
    await tester.tap(find.byKey(const Key('splash-asset-retry')));
    await tester.pump();
    await tester.pump();

    expect(find.byKey(const Key('splash-asset-retry')), findsNothing);
    expect(
      find.text(resolver.resolve(TranslationKeys.homePlayNow)),
      findsOneWidget,
    );

    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });
}

Widget _wrapEntry({
  required TranslationResolver resolver,
  required MatchSessionController controller,
  required ContentPackSyncFn contentPackSync,
}) {
  return AppLocalization(
    resolver: resolver,
    child: MaterialApp(
      theme: buildLhTheme(),
      home: AppEntryScreen(
        controller: controller,
        backendBaseUrl: 'http://example.test:3012',
        contentPackSync: contentPackSync,
        presence: FakePresenceSession(count: 0),
        identityStore: MemoryIdentityStore(
          identity: const PlayerIdentity(
            displayName: 'وجدي',
            avatarColor: '#FF3045',
            countryCode: 'SA',
          ),
        ),
        entryPreferences: MemoryEntryPreferencesStore(completed: true),
      ),
    ),
  );
}
