import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/logic_complete_sum_engine.dart';
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
  Widget body = child;
  if (surfaceSize != null) {
    body = SizedBox(
      width: surfaceSize.width,
      height: surfaceSize.height,
      child: child,
    );
  }
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
        home: Scaffold(body: body),
      ),
    ),
  );
}

List<String> _ids(int count) {
  return List<String>.generate(count, (int i) => 'p$i');
}

Map<String, int?> _nullSelections(int count) {
  return <String, int?>{
    for (final String id in _ids(count)) id: null,
  };
}

List<PlayerPublic> _players(int count) {
  return List<PlayerPublic>.generate(count, (int i) {
    return PlayerPublic(
      playerId: 'p$i',
      hearts: 3,
      energy: 0,
      status: PlayerStatus.active,
      presence: Presence.connected,
      submittedForCurrentChallenge: false,
      displayName: 'Player $i',
    );
  });
}

PublicChallenge makeCompleteSumChallenge({
  required int playerCount,
  Map<String, int?>? selections,
  int currentTotal = 0,
  int target = 12,
  int stateSequence = 1,
  bool allSelected = false,
  bool incorrectTotal = false,
  List<int>? myChoices,
  bool isParticipant = true,
  RoundPhase roundPhase = RoundPhase.answer,
}) {
  final List<String> ids = _ids(playerCount);
  return PublicChallenge(
    challengeInstanceId: 'ch-sum',
    definitionId: 'logic.complete_sum.dev',
    definitionVersion: 1,
    engineId: 'logic.complete_sum',
    promptKey: 'challenge.complete_sum.intro',
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.logic',
      'titleKey': 'challenge.complete_sum.intro',
      'promptKey': 'challenge.complete_sum.prompt',
      'currentTotalKey': 'challenge.complete_sum.current_total',
      'chooseNumberKey': 'challenge.complete_sum.choose',
      'readyKey': 'challenge.complete_sum.ready',
      'thinkingKey': 'challenge.complete_sum.thinking',
      'youKey': 'challenge.complete_sum.you',
      'footerKey': 'challenge.complete_sum.footer',
      'participantIds': ids,
      'target': target,
      'selections': selections ?? _nullSelections(playerCount),
      'currentTotal': currentTotal,
      'allSelected': allSelected,
      'stateSequence': stateSequence,
      'incorrectTotal': incorrectTotal,
      if (isParticipant) 'myChoices': myChoices ?? <int>[0, 1, 2, 3],
      'isParticipant': isParticipant,
    },
    serverNowMs: 1700000000000,
    startsAtMs: 1700000000000,
    deadlineAtMs: 1700000015000,
    durationMs: 15000,
    roundPhase: roundPhase,
  );
}

class _Harness extends StatefulWidget {
  const _Harness({
    super.key,
    required this.challenge,
    required this.onSubmit,
    this.playerCount = 2,
    this.disableAnimations = false,
    this.surfaceSize,
    this.textDirection = TextDirection.rtl,
  });

  final PublicChallenge challenge;
  final void Function(Map<String, dynamic> answer) onSubmit;
  final int playerCount;
  final bool disableAnimations;
  final Size? surfaceSize;
  final TextDirection textDirection;

  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  late PublicChallenge _challenge = widget.challenge;

  void updateChallenge(PublicChallenge next) {
    setState(() => _challenge = next);
  }

  @override
  void didUpdateWidget(covariant _Harness oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.challenge != widget.challenge) {
      _challenge = widget.challenge;
    }
  }

  @override
  Widget build(BuildContext context) {
    return wrapWithL10n(
      Builder(
        builder: (BuildContext innerContext) {
          return LogicCompleteSumEngine().build(
            innerContext,
            ChallengeContext(
              challenge: _challenge,
              onSubmit: widget.onSubmit,
              estimateServerNowMs: () => 1700000000500,
              answerStatus: AnswerSubmissionStatus.idle,
              inputEnabled: true,
              localPlayerId: 'p0',
              players: _players(widget.playerCount),
            ),
          );
        },
      ),
      disableAnimations: widget.disableAnimations,
      surfaceSize: widget.surfaceSize,
      textDirection: widget.textDirection,
    );
  }
}

void main() {
  group('LogicCompleteSumEngine registry', () {
    test('resolves logic.complete_sum', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      final ChallengeEngine engine = registry.resolve('logic.complete_sum');
      expect(engine, isA<LogicCompleteSumEngine>());
      expect(engine.engineId, 'logic.complete_sum');
      expect(engine, isNot(isA<UnknownEngine>()));
    });
  });

  group('LogicCompleteSumEngine widget', () {
    testWidgets('renders for 2–6 players without overflow', (
      WidgetTester tester,
    ) async {
      final List<Size> sizes = <Size>[
        const Size(320, 640),
        const Size(360, 720),
        const Size(390, 844),
        const Size(412, 915),
        const Size(400, 700),
      ];

      for (int n = 2; n <= 6; n++) {
        final Size size = sizes[n - 2];
        await tester.binding.setSurfaceSize(size);
        addTearDown(() => tester.binding.setSurfaceSize(null));

        await tester.pumpWidget(
          _Harness(
            challenge: makeCompleteSumChallenge(playerCount: n),
            onSubmit: (_) {},
            playerCount: n,
            surfaceSize: size,
            disableAnimations: true,
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));

        expect(tester.takeException(), isNull);
        expect(find.text('أكملوا المجموع'), findsOneWidget);
        expect(find.byKey(const ValueKey<String>('complete_sum_total')), findsOneWidget);
        expect(find.byKey(const ValueKey<String>('choice-0')), findsOneWidget);
      }
    });

    testWidgets('shows zero distinctly from unselected (null)', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        _Harness(
          challenge: makeCompleteSumChallenge(
            playerCount: 3,
            selections: <String, int?>{
              'p0': 0,
              'p1': null,
              'p2': null,
            },
            currentTotal: 0,
            stateSequence: 2,
          ),
          onSubmit: (_) {},
          playerCount: 3,
          disableAnimations: true,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // Selected zero on local seat — number badge, not identity replacement.
      expect(find.text('0'), findsWidgets);
      expect(find.text('P'), findsWidgets);
      // Local keeps "you"; remotes keep thinking while unselected.
      expect(find.text('أنت'), findsOneWidget);
      expect(find.text('يفكر...'), findsWidgets);
      expect(find.text('Player 1'), findsOneWidget);
      expect(find.text('Player 2'), findsOneWidget);
    });

    testWidgets('local pending selection submits without changing total', (
      WidgetTester tester,
    ) async {
      Map<String, dynamic>? submitted;
      await tester.pumpWidget(
        _Harness(
          challenge: makeCompleteSumChallenge(
            playerCount: 2,
            currentTotal: 4,
            target: 10,
            selections: <String, int?>{'p0': null, 'p1': 4},
          ),
          onSubmit: (Map<String, dynamic> a) => submitted = a,
          disableAnimations: true,
        ),
      );
      await tester.pump();

      expect(find.text('4 / 10'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey<String>('choice-2')));
      await tester.pump();

      expect(submitted, isNotNull);
      expect(submitted!['selectedValue'], 2);
      expect(submitted!['final'], isFalse);
      // Optimistic pick must not invent a new total.
      expect(find.text('4 / 10'), findsOneWidget);
      expect(find.text('6 / 10'), findsNothing);
    });

    testWidgets('authoritative total update animates display', (
      WidgetTester tester,
    ) async {
      final GlobalKey<_HarnessState> key = GlobalKey<_HarnessState>();
      await tester.pumpWidget(
        _Harness(
          key: key,
          challenge: makeCompleteSumChallenge(
            playerCount: 2,
            currentTotal: 3,
            target: 10,
            stateSequence: 1,
            selections: <String, int?>{'p0': 3, 'p1': null},
          ),
          onSubmit: (_) {},
          disableAnimations: true,
        ),
      );
      await tester.pump();
      expect(find.text('3 / 10'), findsOneWidget);

      key.currentState!.updateChallenge(
        makeCompleteSumChallenge(
          playerCount: 2,
          currentTotal: 7,
          target: 10,
          stateSequence: 2,
          selections: <String, int?>{'p0': 3, 'p1': 4},
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('7 / 10'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 600));
    });

    testWidgets('RTL smoke renders title and LTR total span', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        _Harness(
          challenge: makeCompleteSumChallenge(
            playerCount: 4,
            currentTotal: 5,
            target: 14,
          ),
          onSubmit: (_) {},
          playerCount: 4,
          textDirection: TextDirection.rtl,
          disableAnimations: true,
        ),
      );
      await tester.pump();

      expect(find.text('أكملوا المجموع'), findsOneWidget);
      expect(find.text('5 / 14'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('reduced motion smoke', (WidgetTester tester) async {
      await tester.pumpWidget(
        _Harness(
          challenge: makeCompleteSumChallenge(playerCount: 3),
          onSubmit: (_) {},
          playerCount: 3,
          disableAnimations: true,
        ),
      );
      await tester.pump();
      expect(find.text('أكملوا المجموع'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('stale stateSequence is ignored', (WidgetTester tester) async {
      final GlobalKey<_HarnessState> key = GlobalKey<_HarnessState>();
      await tester.pumpWidget(
        _Harness(
          key: key,
          challenge: makeCompleteSumChallenge(
            playerCount: 2,
            currentTotal: 8,
            target: 10,
            stateSequence: 5,
            selections: <String, int?>{'p0': 5, 'p1': 3},
          ),
          onSubmit: (_) {},
          disableAnimations: true,
        ),
      );
      await tester.pump();
      expect(find.text('8 / 10'), findsOneWidget);

      key.currentState!.updateChallenge(
        makeCompleteSumChallenge(
          playerCount: 2,
          currentTotal: 1,
          target: 10,
          stateSequence: 3,
          selections: <String, int?>{'p0': 1, 'p1': null},
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('8 / 10'), findsOneWidget);
      expect(find.text('1 / 10'), findsNothing);
    });
  });
}
