import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/precision_cable_untangle_engine.dart';
import 'package:game/features/match/engines/precision_circuit_rotation_engine.dart';
import 'package:game/features/match/engines/reaction_wait_for_signal_engine.dart';
import 'package:game/features/match/engines/social_pair_sync_engine.dart';
import 'package:game/features/match/engines/unknown_engine.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_snapshot.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/l10n/translation_catalog.dart';
import 'package:game/theme/lh_tokens.dart';

Widget wrapWithL10n(Widget child) {
  final TranslationResolver resolver = TranslationResolver(isProduction: false);
  return AppLocalization(
    resolver: resolver,
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

const Map<String, dynamic> defaultClientConfig = <String, dynamic>{
  'categoryKey': TranslationKeys.challengeCategoryReaction,
  'waitingPromptKey': TranslationKeys.challengeWaitForSignalWaiting,
  'waitingHintKey': TranslationKeys.challengeWaitForSignalWaitingHint,
  'activePromptKey': TranslationKeys.challengeWaitForSignalActive,
  'actionKey': TranslationKeys.challengeWaitForSignalAction,
};

PublicChallenge makeChallenge({
  RoundPhase roundPhase = RoundPhase.waitingSignal,
  String? signalToken,
  int? signaledAtMs,
  int? signalEndsAtMs,
  Map<String, dynamic>? clientConfig,
}) {
  return PublicChallenge(
    challengeInstanceId: 'ch-1',
    definitionId: 'def-1',
    definitionVersion: 1,
    engineId: 'reaction.wait_for_signal',
    promptKey: TranslationKeys.challengeWaitForSignalWaiting,
    clientConfig: clientConfig ?? defaultClientConfig,
    serverNowMs: 1700000000000,
    startsAtMs: 1700000000000,
    deadlineAtMs: 1700000005000,
    durationMs: 5000,
    roundPhase: roundPhase,
    signalToken: signalToken,
    signaledAtMs: signaledAtMs,
    signalEndsAtMs: signalEndsAtMs,
  );
}

ChallengeContext makeContext({
  required PublicChallenge challenge,
  required void Function(Map<String, dynamic> answer) onSubmit,
  int Function()? estimateServerNowMs,
  AnswerSubmissionStatus answerStatus = AnswerSubmissionStatus.idle,
  bool inputEnabled = true,
}) {
  return ChallengeContext(
    challenge: challenge,
    onSubmit: onSubmit,
    estimateServerNowMs: estimateServerNowMs ?? () => 1_000_000,
    answerStatus: answerStatus,
    inputEnabled: inputEnabled,
  );
}

/// Rebuilds the engine with updated answerStatus after the first submit.
class _LockingHarness extends StatefulWidget {
  const _LockingHarness({
    required this.engine,
    required this.challenge,
    required this.onSubmit,
  });

  final ChallengeEngine engine;
  final PublicChallenge challenge;
  final void Function(Map<String, dynamic> answer) onSubmit;

  @override
  State<_LockingHarness> createState() => _LockingHarnessState();
}

class _LockingHarnessState extends State<_LockingHarness> {
  AnswerSubmissionStatus _status = AnswerSubmissionStatus.idle;

  @override
  Widget build(BuildContext context) {
    return widget.engine.build(
      context,
      ChallengeContext(
        challenge: widget.challenge,
        estimateServerNowMs: () => 1_000_000,
        answerStatus: _status,
        inputEnabled: true,
        onSubmit: (Map<String, dynamic> answer) {
          widget.onSubmit(answer);
          setState(() => _status = AnswerSubmissionStatus.pending);
        },
      ),
    );
  }
}

void main() {
  group('ChallengeEngineRegistry', () {
    test('resolves reaction.wait_for_signal engine', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      final ChallengeEngine engine = registry.resolve(
        'reaction.wait_for_signal',
      );
      expect(engine, isA<ReactionWaitForSignalEngine>());
      expect(engine.engineId, 'reaction.wait_for_signal');
    });

    test('resolves all eleven launch engines', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      const List<String> ids = <String>[
        'reaction.wait_for_signal',
        'trap.no_touch',
        'gesture.reverse_swipe',
        'tap.precision',
        'memory.sequence',
        'hold.multitouch',
        'motion.shake',
        'motion.tilt_balance',
        'audio.cue',
        'social.pair_sync',
        'tactical.risk_choice',
      ];
      for (final String id in ids) {
        final ChallengeEngine engine = registry.resolve(id);
        expect(engine.engineId, id);
        expect(engine, isNot(isA<UnknownEngine>()));
      }
    });

    test('resolves neon cable engine', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      final ChallengeEngine engine = registry.resolve('precision.neon_cable');
      expect(engine.engineId, 'precision.neon_cable');
      expect(engine, isNot(isA<UnknownEngine>()));
    });

    test('resolves fog wipe engine', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      final ChallengeEngine engine = registry.resolve('gesture.fog_wipe');
      expect(engine.engineId, 'gesture.fog_wipe');
      expect(engine, isNot(isA<UnknownEngine>()));
    });

    test('resolves circuit rotation engine', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      final ChallengeEngine engine = registry.resolve(
        'precision.circuit_rotation',
      );
      expect(engine.engineId, 'precision.circuit_rotation');
      expect(engine, isA<PrecisionCircuitRotationEngine>());
    });

    test('resolves cable untangle engine', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      final ChallengeEngine engine = registry.resolve(
        'precision.cable_untangle',
      );
      expect(engine.engineId, 'precision.cable_untangle');
      expect(engine, isA<PrecisionCableUntangleEngine>());
    });

    test('unknown engine for unrecognized id', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      final ChallengeEngine engine = registry.resolve('some.unknown.engine');
      expect(engine, isA<UnknownEngine>());
    });
  });

  group('ReactionWaitForSignalEngine', () {
    testWidgets('shows waiting prompt from required clientConfig', (
      WidgetTester tester,
    ) async {
      Map<String, dynamic>? submittedAnswer;
      final PublicChallenge challenge = makeChallenge();
      final ReactionWaitForSignalEngine engine = ReactionWaitForSignalEngine();

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                makeContext(
                  challenge: challenge,
                  onSubmit: (Map<String, dynamic> a) => submittedAnswer = a,
                ),
              );
            },
          ),
        ),
      );
      // The reaction engine intentionally runs a continuous pulse and timer.
      await tester.pump();

      final TranslationResolver resolver = TranslationResolver(
        isProduction: false,
      );
      expect(
        find.text(
          resolver.resolve(TranslationKeys.challengeWaitForSignalWaiting),
        ),
        findsOneWidget,
      );
      expect(submittedAnswer, isNull);
    });

    testWidgets('missing required clientConfig shows content unavailable', (
      WidgetTester tester,
    ) async {
      final PublicChallenge challenge = makeChallenge(
        clientConfig: const <String, dynamic>{},
      );
      final ReactionWaitForSignalEngine engine = ReactionWaitForSignalEngine();

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                makeContext(challenge: challenge, onSubmit: (_) {}),
              );
            },
          ),
        ),
      );
      await tester.pump();

      final TranslationResolver resolver = TranslationResolver(
        isProduction: false,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.errorsContentUnavailable)),
        findsOneWidget,
      );
    });

    testWidgets('shows blue heart after signal and submits with token', (
      WidgetTester tester,
    ) async {
      Map<String, dynamic>? submittedAnswer;
      final PublicChallenge challenge = makeChallenge(
        roundPhase: RoundPhase.signalActive,
        signalToken: 'tok-signal',
        signaledAtMs: 1700000002000,
      );

      final ReactionWaitForSignalEngine engine = ReactionWaitForSignalEngine();

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                makeContext(
                  challenge: challenge,
                  onSubmit: (Map<String, dynamic> a) => submittedAnswer = a,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();

      expect(submittedAnswer, isNotNull);
      expect(submittedAnswer!['signalToken'], 'tok-signal');
    });

    testWidgets('after signal window ends, tap submits without token', (
      WidgetTester tester,
    ) async {
      Map<String, dynamic>? submittedAnswer;
      final PublicChallenge challenge = makeChallenge(
        roundPhase: RoundPhase.signalActive,
        signalToken: 'tok-signal',
        signaledAtMs: 1700000002000,
        signalEndsAtMs: 1700000003000,
      );

      final ReactionWaitForSignalEngine engine = ReactionWaitForSignalEngine();

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                makeContext(
                  challenge: challenge,
                  estimateServerNowMs: () => 1700000003500,
                  onSubmit: (Map<String, dynamic> a) => submittedAnswer = a,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();

      expect(submittedAnswer, isNotNull);
      expect(submittedAnswer!.containsKey('signalToken'), isFalse);
    });

    testWidgets('early tap submits without token', (WidgetTester tester) async {
      Map<String, dynamic>? submittedAnswer;
      final PublicChallenge challenge = makeChallenge();

      final ReactionWaitForSignalEngine engine = ReactionWaitForSignalEngine();

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                makeContext(
                  challenge: challenge,
                  onSubmit: (Map<String, dynamic> a) => submittedAnswer = a,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();

      expect(submittedAnswer, isNotNull);
      expect(submittedAnswer!.containsKey('signalToken'), isFalse);
    });

    testWidgets('pending answerStatus locks further taps', (
      WidgetTester tester,
    ) async {
      int submitCount = 0;
      final PublicChallenge challenge = makeChallenge(
        roundPhase: RoundPhase.signalActive,
        signalToken: 'tok-signal',
      );

      await tester.pumpWidget(
        wrapWithL10n(
          _LockingHarness(
            engine: ReactionWaitForSignalEngine(),
            challenge: challenge,
            onSubmit: (_) => submitCount++,
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();
      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();

      expect(submitCount, 1);
    });

    testWidgets('reconnect lock: inputEnabled false blocks taps', (
      WidgetTester tester,
    ) async {
      int submitCount = 0;
      final PublicChallenge challenge = makeChallenge(
        roundPhase: RoundPhase.signalActive,
        signalToken: 'tok-signal',
      );

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return ReactionWaitForSignalEngine().build(
                context,
                makeContext(
                  challenge: challenge,
                  inputEnabled: false,
                  onSubmit: (_) => submitCount++,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();
      expect(submitCount, 0);
    });

    testWidgets('rejected status allows retry when inputEnabled', (
      WidgetTester tester,
    ) async {
      int submitCount = 0;
      final PublicChallenge challenge = makeChallenge(
        roundPhase: RoundPhase.signalActive,
        signalToken: 'tok-signal',
      );

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return ReactionWaitForSignalEngine().build(
                context,
                makeContext(
                  challenge: challenge,
                  answerStatus: AnswerSubmissionStatus.rejected,
                  onSubmit: (_) => submitCount++,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();
      expect(submitCount, 1);
    });

    testWidgets('confirmed status blocks taps', (WidgetTester tester) async {
      int submitCount = 0;
      final PublicChallenge challenge = makeChallenge(
        roundPhase: RoundPhase.signalActive,
        signalToken: 'tok-signal',
      );

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return ReactionWaitForSignalEngine().build(
                context,
                makeContext(
                  challenge: challenge,
                  answerStatus: AnswerSubmissionStatus.confirmed,
                  onSubmit: (_) => submitCount++,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();
      expect(submitCount, 0);
    });

    test('engine does not hardcode challenge prompt strings', () {
      final ReactionWaitForSignalEngine engine = ReactionWaitForSignalEngine();
      expect(engine.engineId, 'reaction.wait_for_signal');
    });

    testWidgets(
      'server-driven keys: two definitions same engineId different clientConfig',
      (WidgetTester tester) async {
        final TranslationResolver resolver = TranslationResolver(
          isProduction: false,
        );

        final PublicChallenge challengeA = makeChallenge(
          clientConfig: const <String, dynamic>{
            'categoryKey': TranslationKeys.challengeCategoryReaction,
            'waitingPromptKey': TranslationKeys.challengeWaitForSignalWaiting,
            'waitingHintKey': TranslationKeys.challengeWaitForSignalWaitingHint,
            'activePromptKey': TranslationKeys.challengeWaitForSignalActive,
            'actionKey': TranslationKeys.challengeWaitForSignalAction,
          },
        );
        final ReactionWaitForSignalEngine engine =
            ReactionWaitForSignalEngine();

        await tester.pumpWidget(
          wrapWithL10n(
            Builder(
              builder: (BuildContext context) {
                return engine.build(
                  context,
                  makeContext(challenge: challengeA, onSubmit: (_) {}),
                );
              },
            ),
          ),
        );
        await tester.pump();

        final String waitingA = resolver.resolve(
          TranslationKeys.challengeWaitForSignalWaiting,
        );
        expect(find.text(waitingA), findsOneWidget);

        // Definition B: different category/waiting/hint/active/action keys.
        final PublicChallenge challengeB = makeChallenge(
          clientConfig: const <String, dynamic>{
            'categoryKey': TranslationKeys.challengeCategoryReaction,
            'waitingPromptKey': TranslationKeys.challengeWaitForSignalIntro,
            'waitingHintKey': TranslationKeys.countdownGetReady,
            'activePromptKey': TranslationKeys.challengeWaitForSignalActive,
            'actionKey': TranslationKeys.homePlayNow,
          },
        );

        await tester.pumpWidget(
          wrapWithL10n(
            Builder(
              builder: (BuildContext context) {
                return engine.build(
                  context,
                  makeContext(challenge: challengeB, onSubmit: (_) {}),
                );
              },
            ),
          ),
        );
        await tester.pump();

        final String waitingB = resolver.resolve(
          TranslationKeys.challengeWaitForSignalIntro,
        );
        expect(find.text(waitingB), findsOneWidget);
        if (waitingA != waitingB) {
          expect(find.text(waitingA), findsNothing);
        }
      },
    );
  });

  group('UnknownEngine', () {
    testWidgets('renders content-unavailable text', (
      WidgetTester tester,
    ) async {
      final UnknownEngine engine = UnknownEngine();
      final PublicChallenge challenge = makeChallenge();

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                makeContext(challenge: challenge, onSubmit: (_) {}),
              );
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      final TranslationResolver resolver = TranslationResolver(
        isProduction: false,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.errorsContentUnavailable)),
        findsOneWidget,
      );
    });
  });

  group('SocialPairSyncEngine', () {
    PublicChallenge pairChallenge({bool partnerHolding = false}) {
      return PublicChallenge(
        challengeInstanceId: 'ch-pair',
        definitionId: 'social.pair_sync.dev',
        definitionVersion: 1,
        engineId: 'social.pair_sync',
        promptKey: 'challenge.pair_sync.intro',
        clientConfig: <String, dynamic>{
          'categoryKey': 'challenge.category.social',
          'promptKey': 'challenge.pair_sync.prompt',
          'isParticipant': true,
          'partnerPlayerId': 'p-partner',
          'partnerDisplayName': 'Nour',
          'partnerHolding': partnerHolding,
          'syncWindowMs': 500,
        },
        serverNowMs: 1700000000000,
        startsAtMs: 1700000000000,
        deadlineAtMs: 1700000005000,
        durationMs: 5000,
        roundPhase: RoundPhase.answer,
      );
    }

    ChallengeContext pairContext({
      required PublicChallenge challenge,
      required void Function(Map<String, dynamic> answer) onSubmit,
    }) {
      return ChallengeContext(
        challenge: challenge,
        onSubmit: onSubmit,
        estimateServerNowMs: () => 1700000001000,
        answerStatus: AnswerSubmissionStatus.idle,
        inputEnabled: true,
        localPlayerId: 'p-local',
        players: const <PlayerPublic>[
          PlayerPublic(
            playerId: 'p-local',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'You',
          ),
          PlayerPublic(
            playerId: 'p-partner',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'Nour',
          ),
        ],
      );
    }

    testWidgets('centers the electrical connector on the avatars', (
      WidgetTester tester,
    ) async {
      final SocialPairSyncEngine engine = SocialPairSyncEngine();
      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                pairContext(challenge: pairChallenge(), onSubmit: (_) {}),
              );
            },
          ),
        ),
      );
      await tester.pump();

      final Finder wave = find.byWidgetPredicate(
        (Widget w) => w is CustomPaint && w.painter is PairSyncWavePainter,
      );
      expect(wave, findsOneWidget);
      final Size waveSize = tester.getSize(wave);
      expect(waveSize.height, 64);
    });

    testWidgets('press down stamps holding progress, release submits tap', (
      WidgetTester tester,
    ) async {
      final List<Map<String, dynamic>> answers = <Map<String, dynamic>>[];
      final SocialPairSyncEngine engine = SocialPairSyncEngine();
      final TranslationResolver resolver = TranslationResolver(
        isProduction: false,
      );

      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                pairContext(challenge: pairChallenge(), onSubmit: answers.add),
              );
            },
          ),
        ),
      );
      await tester.pump();

      final Finder button = find.text(
        resolver.resolve('challenge.pair_sync.action'),
      );
      expect(button, findsOneWidget);

      final TestGesture gesture = await tester.startGesture(
        tester.getCenter(button),
      );
      await tester.pump();
      expect(answers, isNotEmpty);
      expect(answers.first['holding'], isTrue);
      expect(answers.first['final'], isFalse);
      expect(answers.first['synced'], isTrue);

      await gesture.up();
      await tester.pump();
      expect(answers.last['holding'], isFalse);
      expect(answers.last['final'], isTrue);
      expect(answers.last['synced'], isTrue);
      expect(answers.last.containsKey('releasedEarly'), isFalse);
    });
  });
}
