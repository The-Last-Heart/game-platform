import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/precision_ring_lock_engine.dart';
import 'package:game/features/match/engines/unknown_engine.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_snapshot.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/theme/lh_tokens.dart';

Widget wrapWithL10n(
  Widget child, {
  TextDirection textDirection = TextDirection.rtl,
  bool disableAnimations = false,
  Size? surfaceSize,
}) {
  final Widget body = child;
  return AppLocalization(
    resolver: TranslationResolver(isProduction: false),
    child: MediaQuery(
      data: MediaQueryData(
        size: surfaceSize ?? const Size(400, 800),
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
            width: surfaceSize?.width ?? 400,
            height: surfaceSize?.height ?? 800,
            child: body,
          ),
        ),
      ),
    ),
  );
}

PublicChallenge makeRingLockChallenge({
  String challengeInstanceId = 'ring-chal-1',
  int lockedCount = 0,
  int activeRingIndex = 0,
  String result = 'active',
  String? lastLockOutcome,
  int stateSequence = 1,
  int nowMs = 1_000_000,
  int durationMs = 15_000,
  bool reconnect = false,
}) {
  final List<Map<String, dynamic>> rings = <Map<String, dynamic>>[
    for (int i = 0; i < 3; i += 1)
      <String, dynamic>{
        'index': i,
        'initialAngleDeg': 90.0 + i * 40,
        'direction': i == 1 ? -1 : 1,
        'angularVelocityDegPerSec': 60.0 + i * 10,
        'locked': i < lockedCount,
        'lockedAngleDeg': i < lockedCount ? 0.0 : null,
      },
  ];
  return PublicChallenge(
    challengeInstanceId: challengeInstanceId,
    definitionId: 'precision.ring_lock.dev',
    definitionVersion: 1,
    engineId: 'precision.ring_lock',
    promptKey: 'challenge.ring_lock.intro',
    choiceKeys: const <String>[],
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.precision',
      'titleKey': 'challenge.ring_lock.intro',
      'promptKey': 'challenge.ring_lock.prompt',
      'actionKey': 'challenge.ring_lock.action',
      'timeRemainingKey': 'challenge.ring_lock.time_remaining',
      'ring1Key': 'challenge.ring_lock.ring_1',
      'ring2Key': 'challenge.ring_lock.ring_2',
      'ring3Key': 'challenge.ring_lock.ring_3',
      'statusLockedKey': 'challenge.ring_lock.locked',
      'statusRotatingKey': 'challenge.ring_lock.rotating',
      'statusFailedKey': 'challenge.ring_lock.failed',
      'a11yLockButtonKey': 'challenge.ring_lock.a11y_lock',
      'ringCount': 3,
      'startDelayMs': 0,
      'targetAngleDeg': 0,
      'alignmentToleranceDeg': 24,
      'transitionDelayMs': 180,
      'difficulty': 'medium',
      'seed': 42,
      'puzzleStartsAtMs': nowMs,
      'activeRingIndex': activeRingIndex,
      'rings': rings,
      'lockedCount': lockedCount,
      'progress': lockedCount / 3.0,
      'result': result,
      'stateSequence': stateSequence,
      'lastLockOutcome': lastLockOutcome,
      'lastLockRingIndex': lastLockOutcome == null ? null : activeRingIndex,
      'isParticipant': true,
      if (reconnect) 'reconnect': true,
    },
    serverNowMs: nowMs,
    startsAtMs: nowMs,
    deadlineAtMs: nowMs + durationMs,
    durationMs: durationMs,
    roundPhase: RoundPhase.answer,
  );
}

ChallengeContext makeContext(
  PublicChallenge challenge, {
  void Function(Map<String, dynamic>)? onSubmit,
  AnswerSubmissionStatus status = AnswerSubmissionStatus.idle,
  bool inputEnabled = true,
  int Function()? estimateServerNowMs,
}) {
  return ChallengeContext(
    challenge: challenge,
    onSubmit: onSubmit ?? (_) {},
    estimateServerNowMs: estimateServerNowMs ??
        () => challenge.startsAtMs + 500,
    answerStatus: status,
    inputEnabled: inputEnabled,
    localPlayerId: 'p0',
  );
}

void main() {
  test('registry resolves precision.ring_lock', () {
    final ChallengeEngine engine =
        ChallengeEngineRegistry().resolve('precision.ring_lock');
    expect(engine, isA<PrecisionRingLockEngine>());
    expect(ChallengeEngineRegistry().resolve('nope'), isA<UnknownEngine>());
  });

  testWidgets('renders Arabic title, instruction, lock button, three statuses', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeRingLockChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return PrecisionRingLockEngine().build(
              context,
              makeContext(challenge),
            );
          },
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('افتح القفل'), findsOneWidget);
    expect(find.text('أوقف الحلقات عند البوابة'), findsOneWidget);
    expect(find.text('ثبّت'), findsOneWidget);
    expect(find.text('الحلقة الأولى'), findsOneWidget);
    expect(find.text('الحلقة الثانية'), findsOneWidget);
    expect(find.text('الحلقة الثالثة'), findsOneWidget);
    expect(find.byType(CustomPaint), findsWidgets);
  });

  testWidgets('server-synchronized timer label is LTR digits', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeRingLockChallenge(
      nowMs: 1_000_000,
      durationMs: 18_000,
    );
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return PrecisionRingLockEngine().build(
              context,
              makeContext(
                challenge,
                estimateServerNowMs: () => 1_000_000 + 2000,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.textContaining(':'), findsWidgets);
  });

  testWidgets('progressive heart states for 0–3 locks and timeout', (
    WidgetTester tester,
  ) async {
    for (final int locked in <int>[0, 1, 2, 3]) {
      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return PrecisionRingLockEngine().build(
                context,
                makeContext(
                  makeRingLockChallenge(
                    lockedCount: locked,
                    activeRingIndex: locked.clamp(0, 2),
                    result: locked == 3 ? 'success' : 'active',
                    stateSequence: locked + 1,
                  ),
                ),
              );
            },
          ),
          disableAnimations: true,
        ),
      );
      await tester.pump();
      expect(find.text('افتح القفل'), findsOneWidget);
    }

    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return PrecisionRingLockEngine().build(
              context,
              makeContext(
                makeRingLockChallenge(
                  lockedCount: 1,
                  activeRingIndex: 1,
                  result: 'timeout',
                  stateSequence: 4,
                ),
              ),
            );
          },
        ),
        disableAnimations: true,
      ),
    );
    await tester.pump();
    expect(find.text('فشل'), findsWidgets);
  });

  testWidgets('pending button prevents double submit', (
    WidgetTester tester,
  ) async {
    int submits = 0;
    final PublicChallenge challenge = makeRingLockChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return PrecisionRingLockEngine().build(
              context,
              makeContext(
                challenge,
                onSubmit: (_) {
                  submits += 1;
                },
              ),
            );
          },
        ),
        disableAnimations: true,
      ),
    );
    await tester.pump();
    await tester.tap(find.text('ثبّت'));
    await tester.pump();
    await tester.tap(find.text('ثبّت'));
    await tester.pump();
    expect(submits, 1);
  });

  testWidgets('tap cooldown keeps button locked after fast ack', (
    WidgetTester tester,
  ) async {
    int submits = 0;
    PublicChallenge challenge = makeRingLockChallenge(stateSequence: 1);
    late void Function(void Function()) setParentState;

    await tester.pumpWidget(
      wrapWithL10n(
        StatefulBuilder(
          builder: (BuildContext context, void Function(void Function()) setState) {
            setParentState = setState;
            return PrecisionRingLockEngine().build(
              context,
              makeContext(
                challenge,
                onSubmit: (_) {
                  submits += 1;
                },
              ),
            );
          },
        ),
        disableAnimations: true,
      ),
    );
    await tester.pump();
    await tester.tap(find.text('ثبّت'));
    await tester.pump();
    expect(submits, 1);

    // Simulate a near-instant miss ack — button must stay locked for cooldown.
    setParentState(() {
      challenge = makeRingLockChallenge(
        stateSequence: 2,
        lastLockOutcome: 'miss',
      );
    });
    await tester.pump();
    await tester.tap(find.text('ثبّت'));
    await tester.pump();
    expect(submits, 1);

    await tester.pump(const Duration(milliseconds: 260));
    await tester.tap(find.text('ثبّت'));
    await tester.pump();
    expect(submits, 2);
  });

  testWidgets('reconnect / reduced-motion / compact layouts have no overflow', (
    WidgetTester tester,
  ) async {
    for (final Size size in <Size>[
      const Size(320, 640),
      const Size(400, 800),
      const Size(480, 900),
    ]) {
      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return PrecisionRingLockEngine().build(
                context,
                makeContext(
                  makeRingLockChallenge(
                    lockedCount: 1,
                    stateSequence: 3,
                    reconnect: true,
                  ),
                ),
              );
            },
          ),
          disableAnimations: true,
          surfaceSize: size,
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('authoritative hit and miss outcomes do not throw', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return PrecisionRingLockEngine().build(
              context,
              makeContext(
                makeRingLockChallenge(
                  lockedCount: 1,
                  activeRingIndex: 1,
                  lastLockOutcome: 'hit',
                  stateSequence: 2,
                ),
              ),
            );
          },
        ),
        disableAnimations: true,
      ),
    );
    await tester.pump();

    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return PrecisionRingLockEngine().build(
              context,
              makeContext(
                makeRingLockChallenge(
                  lockedCount: 0,
                  activeRingIndex: 0,
                  lastLockOutcome: 'miss',
                  stateSequence: 2,
                ),
              ),
            );
          },
        ),
        disableAnimations: true,
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
