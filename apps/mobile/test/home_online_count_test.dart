import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/identity/data/identity_store.dart';
import 'package:game/features/entry/ui/app_entry_screen.dart';
import 'package:game/features/match/session/match_session_controller.dart';
import 'package:game/features/match/session/session_store.dart';
import 'package:game/features/match/transport/fake_transport.dart';
import 'package:game/features/presence/presence_session.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/localized_digits.dart';
import 'package:game/l10n/translation_catalog.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/theme/lh_tokens.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    FlutterSecureStorage.setMockInitialValues(<String, String>{
      'lh_onboarding_completed_v1': '1',
      'lh_player_identity_v1': jsonEncode(<String, String>{
        'displayName': 'وجدي',
        'avatarColor': '#FF3045',
      }),
    });
  });

  test('formatLocalizedCount uses eastern arabic digits for ar', () {
    expect(formatLocalizedCount(1248, 'ar'), '١٢٤٨');
    expect(formatLocalizedCount(3, 'en'), '3');
  });

  test('parsePresenceOnlineCount reads a valid occupancy event', () {
    expect(
      parsePresenceOnlineCount(<String, dynamic>{
        'type': presenceOnlineCountType,
        'payload': <String, dynamic>{'count': 4},
      }),
      4,
    );
    expect(
      parsePresenceOnlineCount(<String, dynamic>{
        'type': presenceHelloType,
        'payload': <String, dynamic>{'count': 4},
      }),
      isNull,
    );
  });

  testWidgets('home hero shows the live online count', (
    WidgetTester tester,
  ) async {
    final TranslationResolver resolver = TranslationResolver(
      isProduction: false,
    );
    final FakePresenceSession presence = FakePresenceSession(count: 3);
    final MatchSessionController controller = MatchSessionController(
      transport: FakeTransport(),
      sessionStore: MemorySessionStore(),
    );

    await tester.pumpWidget(
      AppLocalization(
        resolver: resolver,
        child: MaterialApp(
          theme: buildLhTheme(),
          home: AppEntryScreen(
            controller: controller,
            presence: presence,
            identityStore: MemoryIdentityStore(
              identity: const PlayerIdentity(
                displayName: 'وجدي',
                avatarColor: '#FF3045',
              ),
            ),
            entryPreferences: MemoryEntryPreferencesStore(completed: true),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byKey(const Key('home-online-count')), findsOneWidget);
    expect(
      find.text(
        resolver.resolve(
          TranslationKeys.homeOnlineCount,
          params: <String, String>{'count': formatLocalizedCount(3, 'ar')},
        ),
      ),
      findsOneWidget,
    );

    presence.setCount(12);
    await tester.pump();
    expect(
      find.text(
        resolver.resolve(
          TranslationKeys.homeOnlineCount,
          params: <String, String>{'count': formatLocalizedCount(12, 'ar')},
        ),
      ),
      findsOneWidget,
    );

    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
    presence.dispose();
  });

  testWidgets(
    'backgrounding drops occupancy so closed/background apps are not counted',
    (WidgetTester tester) async {
      final FakePresenceSession presence = FakePresenceSession(count: 1);
      final MatchSessionController controller = MatchSessionController(
        transport: FakeTransport(),
        sessionStore: MemorySessionStore(),
      );

      await tester.pumpWidget(
        AppLocalization(
          resolver: TranslationResolver(isProduction: false),
          child: MaterialApp(
            theme: buildLhTheme(),
            home: AppEntryScreen(
              controller: controller,
              presence: presence,
              identityStore: MemoryIdentityStore(
                identity: const PlayerIdentity(
                  displayName: 'وجدي',
                  avatarColor: '#FF3045',
                ),
              ),
              entryPreferences: MemoryEntryPreferencesStore(completed: true),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(presence.foreground, isTrue);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump();
      expect(presence.foreground, isFalse);
      expect(presence.backgroundCalls, greaterThan(0));

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(presence.foreground, isTrue);

      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      presence.dispose();
    },
  );
}
