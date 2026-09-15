import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/geography_map_hit.dart';
import 'package:game/features/match/engines/geography_select_on_map_engine.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_snapshot.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/theme/lh_tokens.dart';

Widget wrapWithL10n(Widget child) {
  return AppLocalization(
    resolver: TranslationResolver(isProduction: false),
    child: MaterialApp(
      theme: buildLhTheme(),
      locale: const Locale('ar'),
      supportedLocales: const <Locale>[Locale('ar')],
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (BuildContext context, Widget? child) {
        return Directionality(
          textDirection: TextDirection.rtl,
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: Scaffold(body: child),
    ),
  );
}

const List<Map<String, Object>> _squareEgypt = <Map<String, Object>>[
  <String, Object>{'x': 40, 'y': 40},
  <String, Object>{'x': 80, 'y': 40},
  <String, Object>{'x': 80, 'y': 80},
  <String, Object>{'x': 40, 'y': 80},
];

List<GeographyMapRegion> _egyptRegions() {
  return GeographyMapHit.parseRegions(<Map<String, Object>>[
    <String, Object>{
      'regionId': 'egypt',
      'labelKey': 'geo.country.egypt',
      'polygon': _squareEgypt,
    },
  ]);
}

PublicChallenge _mapChallenge({
  required List<Map<String, Object>> regions,
}) {
  return PublicChallenge(
    challengeInstanceId: 'ch-map',
    definitionId: 'geography.select_on_map.dev',
    definitionVersion: 1,
    engineId: 'geography.select_on_map',
    promptKey: 'challenge.map.intro',
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.geography',
      'promptKey': 'challenge.map.prompt',
      'footerKey': 'challenge.map.footer',
      'mapId': 'map.test',
      'assetId': 'map.test',
      'imageWidth': 100,
      'imageHeight': 100,
      'targetLabelKey': 'geo.country.egypt',
      'regions': regions,
    },
    serverNowMs: 1700000000000,
    startsAtMs: 1700000000000,
    deadlineAtMs: 1700000008000,
    durationMs: 8000,
    roundPhase: RoundPhase.answer,
  );
}

void main() {
  group('GeographyMapHit', () {
    test('inside fill selects that country', () {
      expect(
        GeographyMapHit.regionAt(const Offset(60, 60), _egyptRegions()),
        'egypt',
      );
    });

    test('tap on the glow just outside the fill still selects the country', () {
      expect(
        GeographyMapHit.regionAt(const Offset(85, 60), _egyptRegions()),
        'egypt',
      );
    });

    test('far miss is not a country', () {
      expect(
        GeographyMapHit.regionAt(const Offset(-80, -80), _egyptRegions()),
        isNull,
      );
    });

    test('overlapping polygons prefer the smaller country', () {
      final List<GeographyMapRegion> regions = GeographyMapHit.parseRegions(
        <Map<String, Object>>[
          <String, Object>{
            'regionId': 'saudi_arabia',
            'labelKey': 'geo.country.saudi_arabia',
            'polygon': <Map<String, Object>>[
              <String, Object>{'x': 0, 'y': 0},
              <String, Object>{'x': 100, 'y': 0},
              <String, Object>{'x': 100, 'y': 100},
              <String, Object>{'x': 0, 'y': 100},
            ],
          },
          <String, Object>{
            'regionId': 'qatar',
            'labelKey': 'geo.country.qatar',
            'polygon': <Map<String, Object>>[
              <String, Object>{'x': 70, 'y': 70},
              <String, Object>{'x': 90, 'y': 70},
              <String, Object>{'x': 90, 'y': 90},
              <String, Object>{'x': 70, 'y': 90},
            ],
          },
        ],
      );
      expect(
        GeographyMapHit.regionAt(const Offset(80, 80), regions),
        'qatar',
      );
      expect(
        GeographyMapHit.regionAt(const Offset(20, 20), regions),
        'saudi_arabia',
      );
    });
  });

  group('GeographySelectOnMapEngine', () {
    testWidgets('tap inside country fill submits regionId after highlight', (
      WidgetTester tester,
    ) async {
      String? submitted;
      final PublicChallenge challenge = _mapChallenge(
        regions: <Map<String, Object>>[
          <String, Object>{
            'regionId': 'egypt',
            'labelKey': 'geo.country.egypt',
            'polygon': <Map<String, Object>>[
              <String, Object>{'x': 0, 'y': 0},
              <String, Object>{'x': 100, 'y': 0},
              <String, Object>{'x': 100, 'y': 100},
              <String, Object>{'x': 0, 'y': 100},
            ],
          },
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return SizedBox(
                width: 400,
                height: 700,
                child: GeographySelectOnMapEngine().build(
                  context,
                  ChallengeContext(
                    challenge: challenge,
                    onSubmit: (Map<String, dynamic> answer) {
                      submitted = answer['regionId'] as String?;
                    },
                    estimateServerNowMs: () => 1700000000500,
                    answerStatus: AnswerSubmissionStatus.idle,
                    inputEnabled: true,
                  ),
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 450));

      await tester.tap(find.byType(GestureDetector));
      await tester.pump();
      expect(submitted, isNull);
      await tester.pump(const Duration(milliseconds: 350));
      expect(submitted, 'egypt');
    });

    testWidgets('tap on empty ocean does not submit a wrong miss', (
      WidgetTester tester,
    ) async {
      String? submitted;
      bool called = false;
      final PublicChallenge challenge = _mapChallenge(
        regions: <Map<String, Object>>[
          <String, Object>{
            'regionId': 'egypt',
            'labelKey': 'geo.country.egypt',
            'polygon': <Map<String, Object>>[
              <String, Object>{'x': 88, 'y': 88},
              <String, Object>{'x': 100, 'y': 88},
              <String, Object>{'x': 100, 'y': 100},
              <String, Object>{'x': 88, 'y': 100},
            ],
          },
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return SizedBox(
                width: 400,
                height: 700,
                child: GeographySelectOnMapEngine().build(
                  context,
                  ChallengeContext(
                    challenge: challenge,
                    onSubmit: (Map<String, dynamic> answer) {
                      called = true;
                      submitted = answer['regionId'] as String?;
                    },
                    estimateServerNowMs: () => 1700000000500,
                    answerStatus: AnswerSubmissionStatus.idle,
                    inputEnabled: true,
                  ),
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 450));

      final Finder map = find.byType(GestureDetector);
      final Offset topLeft = tester.getTopLeft(map);
      await tester.tapAt(topLeft + const Offset(4, 4));
      await tester.pump(const Duration(milliseconds: 350));
      expect(called, isFalse);
      expect(submitted, isNull);
    });
  });
}
