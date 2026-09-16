import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/l10n/bootstrap_catalog.dart';
import 'package:game/l10n/locale_metadata.dart';
import 'package:game/l10n/translation_catalog.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/features/entry/ui/app_entry_screen.dart';
import 'package:game/features/match/session/session_store.dart';
import 'package:game/features/match/transport/fake_transport.dart';
import 'package:game/features/presence/presence_session.dart';
import 'package:game/main.dart';

TranslationCatalog catalog({
  required String version,
  required Map<String, LocaleMetadata> locales,
  required Map<String, Map<String, String>> entries,
}) {
  return TranslationCatalog.create(
    version: version,
    locales: locales,
    entries: entries,
  );
}

const List<String> requiredBootstrapKeys = <String>[
  TranslationKeys.appTitle,
  TranslationKeys.foundationReady,
  TranslationKeys.commonLoading,
  TranslationKeys.commonRetry,
  TranslationKeys.errorsOffline,
  TranslationKeys.errorsTranslationCatalogUnavailable,
  TranslationKeys.errorsMandatoryUpdate,
  TranslationKeys.errorsContentUnavailable,
];

void main() {
  group('TranslationCatalog', () {
    test('rejects empty and whitespace-only values', () {
      expect(
        () => catalog(
          version: 'v1',
          locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
          entries: <String, Map<String, String>>{
            'ar': <String, String>{TranslationKeys.appTitle: '   '},
          },
        ),
        throwsArgumentError,
      );
    });

    test('rejects empty and whitespace-only translation keys', () {
      expect(
        () => catalog(
          version: 'v1',
          locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
          entries: <String, Map<String, String>>{
            'ar': <String, String>{'   ': 'قيمة'},
          },
        ),
        throwsArgumentError,
      );
      expect(
        () => catalog(
          version: 'v1',
          locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
          entries: <String, Map<String, String>>{
            'ar': <String, String>{'': 'قيمة'},
          },
        ),
        throwsArgumentError,
      );
    });

    test('rejects locale metadata whose code does not match its map key', () {
      expect(
        () => catalog(
          version: 'v1',
          locales: const <String, LocaleMetadata>{
            'ar': LocaleMetadata(
              localeCode: 'en',
              displayName: 'Arabic',
              direction: TextDirectionCode.rtl,
            ),
          },
          entries: const <String, Map<String, String>>{
            'ar': <String, String>{TranslationKeys.appTitle: 'آخر قلب'},
          },
        ),
        throwsArgumentError,
      );
    });

    test('rejects normalized duplicate locale codes', () {
      expect(
        () => TranslationCatalog.create(
          version: 'v1',
          locales: <String, LocaleMetadata>{
            'ar': defaultMobileLocale,
            ' ar ': defaultMobileLocale,
          },
          entries: const <String, Map<String, String>>{
            'ar': <String, String>{TranslationKeys.appTitle: 'آخر قلب'},
          },
        ),
        throwsArgumentError,
      );
    });

    test('rejects normalized duplicate keys', () {
      expect(
        () => catalog(
          version: 'v1',
          locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
          entries: <String, Map<String, String>>{
            'ar': <String, String>{
              'app.title': 'آخر قلب',
              ' app.title ': 'مكرر',
            },
          },
        ),
        throwsArgumentError,
      );
    });

    test('loaded catalogs are immutable', () {
      final TranslationCatalog c = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
        entries: const <String, Map<String, String>>{
          'ar': <String, String>{TranslationKeys.appTitle: 'آخر قلب'},
        },
      );
      expect(
        () => c.locales['en'] = const LocaleMetadata(
          localeCode: 'en',
          displayName: 'English',
          direction: TextDirectionCode.ltr,
        ),
        throwsUnsupportedError,
      );
      expect(
        () => c.entries['ar']![TranslationKeys.appTitle] = 'x',
        throwsUnsupportedError,
      );
    });
  });

  group('Bootstrap catalog', () {
    test('every required Arabic and English key exists and is nonblank', () {
      final TranslationCatalog bootstrap = createBootstrapCatalog();
      for (final String locale in <String>['ar', 'en']) {
        for (final String key in requiredBootstrapKeys) {
          final String? value = bootstrap.lookup(locale, key);
          expect(value, isNotNull, reason: '$locale:$key');
          expect(value!.trim(), isNotEmpty, reason: '$locale:$key blank');
        }
      }
    });

    test('LH-003 challenge keys exist in bootstrap catalog', () {
      final TranslationCatalog bootstrap = createBootstrapCatalog();
      const List<String> challengeKeys = <String>[
        TranslationKeys.challengeWaitForSignalIntro,
        TranslationKeys.challengeCategoryReaction,
        TranslationKeys.challengeWaitForSignalWaiting,
        TranslationKeys.challengeWaitForSignalWaitingHint,
        TranslationKeys.challengeWaitForSignalActive,
        TranslationKeys.challengeWaitForSignalAction,
      ];
      for (final String locale in <String>['ar', 'en']) {
        for (final String key in challengeKeys) {
          final String? value = bootstrap.lookup(locale, key);
          expect(value, isNotNull, reason: '$locale:$key');
          expect(value!.trim(), isNotEmpty, reason: '$locale:$key blank');
        }
      }
    });

    test('LH-003 chrome keys exist in bootstrap catalog', () {
      final TranslationCatalog bootstrap = createBootstrapCatalog();
      const List<String> chromeKeys = <String>[
        TranslationKeys.homePlayNow,
        TranslationKeys.lobbyPrivateRoom,
        TranslationKeys.countdownAllReady,
        TranslationKeys.resultSurvived,
        TranslationKeys.spectatorMatchOngoing,
        TranslationKeys.winnerYouLastHeart,
        TranslationKeys.winnerPlayAgain,
      ];
      for (final String locale in <String>['ar', 'en']) {
        for (final String key in chromeKeys) {
          final String? value = bootstrap.lookup(locale, key);
          expect(value, isNotNull, reason: '$locale:$key');
          expect(value!.trim(), isNotEmpty, reason: '$locale:$key blank');
        }
      }
    });

    test('domain and protocol error keys exist in bootstrap catalog', () {
      final TranslationCatalog bootstrap = createBootstrapCatalog();
      const List<String> errorKeys = <String>[
        'errors.match.not_found',
        'errors.match.full',
        'errors.match.not_joinable',
        'errors.match.challenge_not_active',
        'errors.match.spectator_cannot_submit',
        'errors.match.submission_late',
        'errors.match.submission_already_submitted',
        'errors.match.submission_progress',
        'errors.match.already_in_match',
        'errors.match.not_in_match',
        'errors.match.not_host',
        'errors.match.not_enough_players',
        'errors.match.rematch_unavailable',
        'errors.match.not_lobby',
        'errors.match.unsafe_zero_survivors',
        'errors.room.code_invalid',
        'errors.room.code_expired',
        'errors.room.full',
        'errors.queue.cancelled',
        'errors.queue.timeout',
        'errors.queue.not_found',
        'errors.queue.already_in_queue',
        'errors.queue.paused',
        'errors.training.unavailable',
        'errors.protocol.unauthorized',
        'errors.protocol.internal',
        'errors.protocol.invalid_payload',
        'errors.protocol.invalid_schema_version',
        'errors.protocol.unknown_message_type',
        'errors.protocol.dev_only_forbidden',
        'errors.protocol.session_expired',
        'errors.power.not_available',
        'errors.power.phase_invalid',
        'errors.power.illegal_target',
        'errors.power.attack_not_found',
        'errors.power.offensive_disabled',
        TranslationKeys.errorsQueueTimeout,
        TranslationKeys.errorsQueueFailed,
        TranslationKeys.errorsMatchFull,
        TranslationKeys.errorsProtocol,
      ];
      for (final String locale in <String>['ar', 'en']) {
        for (final String key in errorKeys) {
          final String? value = bootstrap.lookup(locale, key);
          expect(value, isNotNull, reason: '$locale:$key');
          expect(value!.trim(), isNotEmpty, reason: '$locale:$key blank');
        }
      }
    });
  });

  group('TranslationResolver', () {
    test('Arabic default locale resolves RTL', () {
      final TranslationResolver resolver = TranslationResolver(
        isProduction: false,
      );
      expect(resolver.selectedLocaleCode, 'ar');
      expect(resolver.resolveLocaleMetadata().isRtl, isTrue);
    });

    test('reads selected-locale value from compatible published catalog', () {
      final TranslationCatalog published = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{
          'ar': defaultMobileLocale,
          'en': LocaleMetadata(
            localeCode: 'en',
            displayName: 'English',
            direction: TextDirectionCode.ltr,
          ),
        },
        entries: const <String, Map<String, String>>{
          'en': <String, String>{TranslationKeys.appTitle: 'Published English'},
          'ar': <String, String>{TranslationKeys.appTitle: 'آخر قلب'},
        },
      );
      expect(
        TranslationResolver(
          publishedCatalog: published,
          selectedLocaleCode: 'en',
          isProduction: false,
        ).resolve(TranslationKeys.appTitle),
        'Published English',
      );
    });

    test('resolves fallback locale within the same published catalog', () {
      final TranslationCatalog published = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{
          'ar': defaultMobileLocale,
          'en': LocaleMetadata(
            localeCode: 'en',
            displayName: 'English',
            direction: TextDirectionCode.ltr,
          ),
        },
        entries: const <String, Map<String, String>>{
          'ar': <String, String>{TranslationKeys.appTitle: 'منشور عربي'},
          'en': <String, String>{
            TranslationKeys.commonRetry: 'Retry published',
          },
        },
      );
      expect(
        TranslationResolver(
          publishedCatalog: published,
          selectedLocaleCode: 'en',
          fallbackLocaleCode: 'ar',
          isProduction: false,
        ).resolve(TranslationKeys.appTitle),
        'منشور عربي',
      );
    });

    test('uses compatible cached content when published content is absent', () {
      final TranslationCatalog cached = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
        entries: const <String, Map<String, String>>{
          'ar': <String, String>{
            TranslationKeys.commonLoading: 'تحميل من الذاكرة',
          },
        },
      );
      expect(
        TranslationResolver(
          cachedCatalog: cached,
          isProduction: false,
        ).resolve(TranslationKeys.commonLoading),
        'تحميل من الذاكرة',
      );
    });

    test('uses compatible cached locale metadata when published lacks it', () {
      final TranslationCatalog published = catalog(
        version: 'pin-1',
        locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
        entries: const <String, Map<String, String>>{
          'ar': <String, String>{TranslationKeys.appTitle: 'آخر قلب'},
        },
      );
      final TranslationCatalog cached = catalog(
        version: 'pin-1',
        locales: const <String, LocaleMetadata>{
          'ar': defaultMobileLocale,
          'he': LocaleMetadata(
            localeCode: 'he',
            displayName: 'Hebrew',
            direction: TextDirectionCode.rtl,
          ),
        },
        entries: const <String, Map<String, String>>{
          'he': <String, String>{TranslationKeys.appTitle: 'לב'},
          'ar': <String, String>{TranslationKeys.appTitle: 'آخر قلب'},
        },
      );

      final TranslationResolver resolver = TranslationResolver(
        publishedCatalog: published,
        cachedCatalog: cached,
        pinnedCatalogVersion: 'pin-1',
        selectedLocaleCode: 'he',
        isProduction: false,
      );

      expect(resolver.resolveLocaleMetadata().localeCode, 'he');
      expect(resolver.resolveLocaleMetadata().isRtl, isTrue);
    });

    test('skips incompatible pinned catalogs for metadata and content', () {
      final TranslationCatalog cached = catalog(
        version: 'old',
        locales: const <String, LocaleMetadata>{
          'he': LocaleMetadata(
            localeCode: 'he',
            displayName: 'Hebrew',
            direction: TextDirectionCode.rtl,
          ),
        },
        entries: const <String, Map<String, String>>{
          'he': <String, String>{TranslationKeys.appTitle: 'לב'},
        },
      );

      final TranslationResolver resolver = TranslationResolver(
        cachedCatalog: cached,
        pinnedCatalogVersion: 'pin-9',
        selectedLocaleCode: 'he',
        isProduction: false,
      );
      expect(resolver.resolveLocaleMetadata().localeCode, 'ar');
      expect(resolver.resolve(TranslationKeys.appTitle), isNot(equals('לב')));
    });

    test('non-Arabic RTL locale is driven by metadata', () {
      final TranslationCatalog published = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{
          'ar': defaultMobileLocale,
          'he': LocaleMetadata(
            localeCode: 'he',
            displayName: 'Hebrew',
            direction: TextDirectionCode.rtl,
          ),
        },
        entries: const <String, Map<String, String>>{
          'he': <String, String>{TranslationKeys.appTitle: 'לב אחרון'},
          'ar': <String, String>{TranslationKeys.appTitle: 'آخر قلب'},
        },
      );
      final TranslationResolver resolver = TranslationResolver(
        publishedCatalog: published,
        selectedLocaleCode: 'he',
        isProduction: false,
      );
      expect(resolver.resolveLocaleMetadata().isRtl, isTrue);
      expect(resolver.resolve(TranslationKeys.appTitle), 'לב אחרון');
    });

    test('LTR locale via metadata', () {
      final TranslationCatalog published = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{
          'ar': defaultMobileLocale,
          'en': LocaleMetadata(
            localeCode: 'en',
            displayName: 'English',
            direction: TextDirectionCode.ltr,
          ),
        },
        entries: const <String, Map<String, String>>{
          'en': <String, String>{TranslationKeys.appTitle: 'The Last Heart'},
          'ar': <String, String>{TranslationKeys.appTitle: 'آخر قلب'},
        },
      );
      expect(
        TranslationResolver(
          publishedCatalog: published,
          selectedLocaleCode: 'en',
          isProduction: false,
        ).resolveLocaleMetadata().isRtl,
        isFalse,
      );
    });

    test(
      'development surfaces missing keys; release does not show raw keys',
      () {
        expect(
          TranslationResolver(isProduction: false).resolve('missing.key'),
          'MISSING:missing.key',
        );
        final String release = TranslationResolver(
          isProduction: true,
        ).resolve('missing.key');
        expect(release, isNot(contains('missing.key')));
        expect(release, isNot(contains('MISSING:')));
        expect(release, isNot(contains('{')));
      },
    );

    test(
      'terminal content-unavailable fallback is finite and nonrecursive',
      () {
        final TranslationCatalog emptyish = catalog(
          version: 'v1',
          locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
          entries: const <String, Map<String, String>>{
            'ar': <String, String>{TranslationKeys.appTitle: 'عنوان'},
          },
        );
        final String release = TranslationResolver(
          publishedCatalog: emptyish,
          isProduction: true,
        ).resolve('totally.missing');
        expect(release, isNot(contains('totally.missing')));
        expect(release.trim(), isNotEmpty);
      },
    );

    test('interpolation requires all named parameters', () {
      final TranslationCatalog published = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
        entries: const <String, Map<String, String>>{
          'ar': <String, String>{'greet': 'مرحباً {name} — {name}'},
        },
      );

      expect(
        TranslationResolver(
          publishedCatalog: published,
          isProduction: false,
        ).resolve('greet', params: <String, String>{'name': 'سارة'}),
        'مرحباً سارة — سارة',
      );

      expect(
        () => TranslationResolver(
          publishedCatalog: published,
          isProduction: false,
        ).resolve('greet'),
        throwsA(
          isA<StateError>().having(
            (StateError e) => e.message,
            'message',
            contains('MISSING_PARAMS:greet:name'),
          ),
        ),
      );

      final String release = TranslationResolver(
        publishedCatalog: published,
        isProduction: true,
      ).resolve('greet');
      expect(release, isNot(contains('{name}')));
      expect(
        release,
        TranslationResolver(
          isProduction: true,
        ).resolve(TranslationKeys.errorsContentUnavailable),
      );
    });

    test(
      'missing interpolation params never show raw placeholders in production',
      () {
        final TranslationCatalog published = catalog(
          version: 'v1',
          locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
          entries: const <String, Map<String, String>>{
            'ar': <String, String>{'msg': 'Hello {name} and {other}'},
          },
        );
        final String release = TranslationResolver(
          publishedCatalog: published,
          isProduction: true,
        ).resolve('msg', params: <String, String>{'name': 'A'});
        expect(release, isNot(contains('{name}')));
        expect(release, isNot(contains('{other}')));
        expect(release, isNot(contains('{')));
      },
    );

    test('development missing parameters throw clearly', () {
      final TranslationCatalog published = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
        entries: const <String, Map<String, String>>{
          'ar': <String, String>{'msg': '{a}-{b}'},
        },
      );
      expect(
        () => TranslationResolver(
          publishedCatalog: published,
          isProduction: false,
        ).resolve('msg', params: <String, String>{'a': '1'}),
        throwsA(
          isA<StateError>().having(
            (StateError e) => e.message,
            'message',
            allOf(contains('MISSING_PARAMS:msg'), contains('b')),
          ),
        ),
      );
    });

    test('extra interpolation parameters do not corrupt output', () {
      final TranslationCatalog published = catalog(
        version: 'v1',
        locales: const <String, LocaleMetadata>{'ar': defaultMobileLocale},
        entries: const <String, Map<String, String>>{
          'ar': <String, String>{'msg': '{a}-{b}'},
        },
      );
      expect(
        TranslationResolver(
          publishedCatalog: published,
          isProduction: false,
        ).resolve(
          'msg',
          params: <String, String>{'a': '1', 'b': '2', 'extra': '<x>'},
        ),
        '1-2',
      );
    });

    test('bootstrap fallback and empty key rejection', () {
      expect(
        TranslationResolver(
          isProduction: true,
        ).resolve(TranslationKeys.appTitle),
        'آخر قلب',
      );
      expect(() => TranslationResolver().resolve('  '), throwsArgumentError);
    });
  });

  group('Home screen', () {
    setUp(() {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'lh_onboarding_completed_v1': '1',
        'lh_player_identity_v1': jsonEncode(<String, String>{
          'displayName': 'وجدي',
          'avatarColor': '#FF3045',
          'countryCode': 'SA',
        }),
      });
    });

    testWidgets('startup labels resolve through translation keys', (
      WidgetTester tester,
    ) async {
      final TranslationResolver resolver = TranslationResolver(
        isProduction: false,
      );
      final FakeTransport transport = FakeTransport();
      final MemorySessionStore store = MemorySessionStore();
      await tester.pumpWidget(
        TheLastHeartApp(
          translationResolver: resolver,
          transport: transport,
          sessionStore: store,
          presence: FakePresenceSession(),
          backendBaseUrl: '',
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.appTitle)),
        findsWidgets,
      );
      expect(find.text('app.title'), findsNothing);

      final BuildContext context = tester.element(find.byType(AppEntryScreen));
      expect(Directionality.of(context), TextDirection.rtl);
    });

    testWidgets('dev play button visible in debug mode', (
      WidgetTester tester,
    ) async {
      final TranslationResolver resolver = TranslationResolver(
        isProduction: false,
      );
      final FakeTransport transport = FakeTransport();
      final MemorySessionStore store = MemorySessionStore();
      await tester.pumpWidget(
        TheLastHeartApp(
          translationResolver: resolver,
          transport: transport,
          sessionStore: store,
          presence: FakePresenceSession(),
          backendBaseUrl: '',
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.homePlayNow)),
        findsOneWidget,
      );
    });
  });
}
