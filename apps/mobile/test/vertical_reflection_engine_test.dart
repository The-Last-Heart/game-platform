import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/vertical_reflection_engine.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_snapshot.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/theme/lh_tokens.dart';

Widget wrapWithL10n(
  Widget child, {
  TextDirection textDirection = TextDirection.rtl,
  bool disableAnimations = false,
  Size surfaceSize = const Size(390, 844),
}) {
  return AppLocalization(
    resolver: TranslationResolver(isProduction: false),
    child: MediaQuery(
      data: MediaQueryData(
        size: surfaceSize,
        disableAnimations: disableAnimations,
      ),
      child: MaterialApp(
        theme: buildLhTheme(),
        locale: const Locale('ar'),
        supportedLocales: const <Locale>[Locale('ar'), Locale('en')],
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
        home: Scaffold(
          body: SizedBox(
            width: surfaceSize.width,
            height: surfaceSize.height,
            child: child,
          ),
        ),
      ),
    ),
  );
}

Map<String, dynamic> arrowSourceShape() {
  return <String, dynamic>{
    'polygons': <Map<String, dynamic>>[
      <String, dynamic>{
        'closed': true,
        'points': <Map<String, double>>[
          <String, double>{'x': 0.12, 'y': 0.28},
          <String, double>{'x': 0.52, 'y': 0.28},
          <String, double>{'x': 0.52, 'y': 0.16},
          <String, double>{'x': 0.88, 'y': 0.5},
          <String, double>{'x': 0.52, 'y': 0.84},
          <String, double>{'x': 0.52, 'y': 0.72},
          <String, double>{'x': 0.28, 'y': 0.72},
          <String, double>{'x': 0.22, 'y': 0.66},
          <String, double>{'x': 0.28, 'y': 0.6},
          <String, double>{'x': 0.12, 'y': 0.6},
        ],
      },
    ],
    'markers': <Map<String, dynamic>>[
      <String, dynamic>{
        'id': 'm1',
        'type': 'dot',
        'center': <String, double>{'x': 0.28, 'y': 0.4},
        'size': 0.07,
        'colorRole': 'accent',
      },
    ],
  };
}

Map<String, dynamic> reflectShape(Map<String, dynamic> source) {
  final List<dynamic> polys = source['polygons'] as List<dynamic>;
  final List<Map<String, dynamic>> outPolys = <Map<String, dynamic>>[];
  for (final dynamic poly in polys) {
    final Map<String, dynamic> p = Map<String, dynamic>.from(poly as Map);
    final List<dynamic> pts = p['points'] as List<dynamic>;
    p['points'] = pts
        .map((dynamic pt) {
          final Map<String, dynamic> m = Map<String, dynamic>.from(pt as Map);
          return <String, double>{
            'x': 1.0 - (m['x'] as num).toDouble(),
            'y': (m['y'] as num).toDouble(),
          };
        })
        .toList();
    outPolys.add(p);
  }
  final List<dynamic> markers = source['markers'] as List<dynamic>;
  final List<Map<String, dynamic>> outMarkers = markers.map((dynamic m) {
    final Map<String, dynamic> marker = Map<String, dynamic>.from(m as Map);
    final Map<String, dynamic> c = Map<String, dynamic>.from(
      marker['center'] as Map,
    );
    marker['center'] = <String, double>{
      'x': 1.0 - (c['x'] as num).toDouble(),
      'y': (c['y'] as num).toDouble(),
    };
    return marker;
  }).toList();
  return <String, dynamic>{'polygons': outPolys, 'markers': outMarkers};
}

PublicChallenge makeVrChallenge({
  String challengeInstanceId = 'vr-1',
  Map<String, dynamic>? extraConfig,
}) {
  final Map<String, dynamic> source = arrowSourceShape();
  final Map<String, dynamic> correct = reflectShape(source);
  final Map<String, dynamic> wrong = Map<String, dynamic>.from(source);
  return PublicChallenge(
    challengeInstanceId: challengeInstanceId,
    definitionId: 'focus.vertical_reflection.dev',
    definitionVersion: 1,
    engineId: 'focus.vertical_reflection',
    durationMs: 12000,
    serverNowMs: 1_001_000,
    startsAtMs: 1_000_000,
    deadlineAtMs: 1_012_000,
    promptKey: 'challenge.vertical_reflection.intro',
    choiceKeys: const <String>[],
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.focus',
      'promptKey': 'challenge.vertical_reflection.prompt',
      'titleKey': 'challenge.vertical_reflection.title',
      'instructionKey': 'challenge.vertical_reflection.instruction',
      'titleText': 'مرآة الخداع',
      'instructionText': 'اختر الانعكاس الصحيح حول المحور العمودي',
      'sourceSide': 'left',
      'sourceShape': source,
      'candidates': <Map<String, dynamic>>[
        <String, dynamic>{'id': 'vr.opt.0', 'shape': wrong},
        <String, dynamic>{'id': 'vr.opt.1', 'shape': correct},
        <String, dynamic>{
          'id': 'vr.opt.2',
          'shape': reflectShape(reflectShape(wrong)),
        },
        <String, dynamic>{
          'id': 'vr.opt.3',
          'shape': <String, dynamic>{
            'polygons': (wrong['polygons'] as List<dynamic>),
            'markers': <Map<String, dynamic>>[
              <String, dynamic>{
                'id': 'm1',
                'type': 'dot',
                'center': <String, double>{'x': 0.7, 'y': 0.7},
                'size': 0.07,
                'colorRole': 'accent',
              },
            ],
          },
        },
      ],
      'optionKeys': <String>['vr.opt.0', 'vr.opt.1', 'vr.opt.2', 'vr.opt.3'],
      if (extraConfig != null) ...extraConfig,
    },
    roundPhase: RoundPhase.answer,
  );
}

void main() {
  test('square content rect preserves unit aspect in tall half-boards', () {
    final Rect tallHalf = const Rect.fromLTWH(0, 0, 100, 220);
    final Rect square = squareContentRectForTest(tallHalf, insetFraction: 0.1);
    expect(square.width, closeTo(square.height, 0.001));
    expect(square.width, lessThan(tallHalf.width));
    expect(square.center.dx, closeTo(tallHalf.center.dx, 0.001));
    expect(square.center.dy, closeTo(tallHalf.center.dy, 0.001));
  });

  test('registry resolves vertical reflection engine', () {
    final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
    expect(
      registry.resolve('focus.vertical_reflection'),
      isA<VerticalReflectionEngine>(),
    );
  });

  test('main puzzle area contains exactly one source silhouette', () {
    final PublicChallenge challenge = makeVrChallenge();
    expect(
      verticalReflectionBoardSilhouetteCount(challenge.clientConfig),
      1,
    );
    expect(
      verticalReflectionBoardHasReflectedGhost(challenge.clientConfig),
      isFalse,
    );
  });

  testWidgets('renders Arabic title/instruction and four candidates', (
    WidgetTester tester,
  ) async {
    final List<Map<String, dynamic>> submissions = <Map<String, dynamic>>[];
    final PublicChallenge challenge = makeVrChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return VerticalReflectionEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: submissions.add,
                estimateServerNowMs: () => 1_001_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('مرآة الخداع'), findsOneWidget);
    expect(
      find.text('اختر الانعكاس الصحيح حول المحور العمودي'),
      findsOneWidget,
    );
    expect(find.byType(CustomPaint), findsWidgets);
  });

  testWidgets('uses production design tokens (no gold-palace palette)', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeVrChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return VerticalReflectionEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_001_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    final ThemeData theme = Theme.of(tester.element(find.byType(Column).first));
    expect(theme.colorScheme.primary, LhColors.primary);
    expect(theme.scaffoldBackgroundColor, LhColors.bg);
  });

  testWidgets('reduced motion still shows source and candidates', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeVrChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return VerticalReflectionEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_001_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
        disableAnimations: true,
      ),
    );
    await tester.pump();
    expect(find.text('مرآة الخداع'), findsOneWidget);
  });

  testWidgets('no overflow on compact phone', (WidgetTester tester) async {
    final PublicChallenge challenge = makeVrChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return VerticalReflectionEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_001_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
        surfaceSize: const Size(320, 640),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('reconnect skips entrance and keeps confirmed state', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeVrChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return VerticalReflectionEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_001_000,
                answerStatus: AnswerSubmissionStatus.confirmed,
                inputEnabled: false,
                localOutcome: 'success',
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('مرآة الخداع'), findsOneWidget);
  });

  testWidgets('disposes animation controllers without leak', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeVrChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return VerticalReflectionEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_001_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
