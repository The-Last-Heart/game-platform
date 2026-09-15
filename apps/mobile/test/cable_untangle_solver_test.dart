import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/cable_untangle_solver.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/precision_cable_untangle_engine.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_snapshot.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/theme/lh_tokens.dart';

Map<String, dynamic> validConfig({
  List<Map<String, dynamic>>? cables,
  bool mirrorHorizontally = false,
}) {
  return <String, dynamic>{
    'categoryKey': 'challenge.category.precision',
    'titleKey': 'challenge.cable_untangle.intro',
    'promptKey': 'challenge.cable_untangle.prompt',
    'layout': <String, dynamic>{
      'leftColumnX': 0.12,
      'rightColumnX': 0.88,
      'topPadding': 0.1,
      'bottomPadding': 0.1,
    },
    'sockets': <String, dynamic>{
      'left': <Map<String, dynamic>>[
        <String, dynamic>{'id': 'left-1', 'order': 0},
        <String, dynamic>{'id': 'left-2', 'order': 1},
        <String, dynamic>{'id': 'left-3', 'order': 2},
        <String, dynamic>{'id': 'left-4', 'order': 3},
      ],
      'right': <Map<String, dynamic>>[
        <String, dynamic>{'id': 'right-1', 'order': 0},
        <String, dynamic>{'id': 'right-2', 'order': 1},
        <String, dynamic>{'id': 'right-3', 'order': 2},
        <String, dynamic>{'id': 'right-4', 'order': 3},
      ],
    },
    'cables':
        cables ??
        <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'cable-1',
            'leftSocketId': 'left-1',
            'initialRightSocketId': 'right-3',
          },
          <String, dynamic>{
            'id': 'cable-2',
            'leftSocketId': 'left-2',
            'initialRightSocketId': 'right-1',
          },
          <String, dynamic>{
            'id': 'cable-3',
            'leftSocketId': 'left-3',
            'initialRightSocketId': 'right-4',
          },
          <String, dynamic>{
            'id': 'cable-4',
            'leftSocketId': 'left-4',
            'initialRightSocketId': 'right-2',
          },
        ],
    'theme': <String, dynamic>{
      'backgroundColor': '#07131D',
      'gridColor': '#143143',
      'cableColor': '#69E7FF',
      'cableCoreColor': '#E8FCFF',
      'socketColor': '#91EFFF',
    },
    'assetIds': <String, dynamic>{'swingSfx': 'cable_untangle.swing'},
    'snapRadiusNorm': 0.08,
    'mirrorHorizontally': mirrorHorizontally,
  };
}

Widget wrapEngine(Widget child) {
  return AppLocalization(
    resolver: TranslationResolver(isProduction: false),
    child: MaterialApp(
      theme: buildLhTheme(),
      locale: const Locale('ar'),
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

PublicChallenge makeCableChallenge(Map<String, dynamic> clientConfig) {
  return PublicChallenge(
    challengeInstanceId: 'ch-cable',
    definitionId: 'precision.cable_untangle.dev',
    definitionVersion: 1,
    engineId: 'precision.cable_untangle',
    promptKey: 'challenge.cable_untangle.intro',
    clientConfig: clientConfig,
    serverNowMs: 1_000,
    startsAtMs: 1_000,
    deadlineAtMs: 9_000,
    durationMs: 8_000,
    roundPhase: RoundPhase.answer,
  );
}

void main() {
  group('cable_untangle_solver validation', () {
    test('accepts a valid tangled payload', () {
      final CableUntangleParseResult result = parseCableUntanglePuzzle(
        validConfig(),
      );
      expect(result.isValid, isTrue);
      expect(result.puzzle, isNotNull);
      expect(
        countCableIntersections(
          puzzle: result.puzzle!,
          rightAssignment: initialRightAssignment(result.puzzle!),
        ),
        greaterThan(0),
      );
    });

    test('rejects duplicate cable ids', () {
      final Map<String, dynamic> cfg = validConfig(
        cables: <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'cable-1',
            'leftSocketId': 'left-1',
            'initialRightSocketId': 'right-1',
          },
          <String, dynamic>{
            'id': 'cable-1',
            'leftSocketId': 'left-2',
            'initialRightSocketId': 'right-2',
          },
          <String, dynamic>{
            'id': 'cable-3',
            'leftSocketId': 'left-3',
            'initialRightSocketId': 'right-3',
          },
          <String, dynamic>{
            'id': 'cable-4',
            'leftSocketId': 'left-4',
            'initialRightSocketId': 'right-4',
          },
        ],
      );
      expect(parseCableUntanglePuzzle(cfg).isValid, isFalse);
    });

    test('rejects already-solved configurations', () {
      final Map<String, dynamic> cfg = validConfig(
        cables: <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'cable-1',
            'leftSocketId': 'left-1',
            'initialRightSocketId': 'right-1',
          },
          <String, dynamic>{
            'id': 'cable-2',
            'leftSocketId': 'left-2',
            'initialRightSocketId': 'right-2',
          },
          <String, dynamic>{
            'id': 'cable-3',
            'leftSocketId': 'left-3',
            'initialRightSocketId': 'right-3',
          },
          <String, dynamic>{
            'id': 'cable-4',
            'leftSocketId': 'left-4',
            'initialRightSocketId': 'right-4',
          },
        ],
      );
      expect(parseCableUntanglePuzzle(cfg).error, 'already solved');
    });

    test('rejects mismatched left/right occupancy', () {
      final Map<String, dynamic> cfg = validConfig(
        cables: <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'cable-1',
            'leftSocketId': 'left-1',
            'initialRightSocketId': 'right-3',
          },
          <String, dynamic>{
            'id': 'cable-2',
            'leftSocketId': 'left-2',
            'initialRightSocketId': 'right-3',
          },
          <String, dynamic>{
            'id': 'cable-3',
            'leftSocketId': 'left-3',
            'initialRightSocketId': 'right-4',
          },
          <String, dynamic>{
            'id': 'cable-4',
            'leftSocketId': 'left-4',
            'initialRightSocketId': 'right-2',
          },
        ],
      );
      expect(parseCableUntanglePuzzle(cfg).isValid, isFalse);
    });
  });

  group('cable_untangle swap + intersections', () {
    late CableUntanglePuzzle puzzle;
    late Map<String, String> assignment;

    setUp(() {
      puzzle = parseCableUntanglePuzzle(validConfig()).puzzle!;
      assignment = initialRightAssignment(puzzle);
    });

    test('pairwise crossing detection matches inversion rule', () {
      expect(
        cablePairIntersects(leftA: 0, rightA: 2, leftB: 1, rightB: 0),
        isTrue,
      );
      expect(
        cablePairIntersects(leftA: 0, rightA: 0, leftB: 1, rightB: 1),
        isFalse,
      );
    });

    test('atomic swap of two occupied sockets preserves bijection', () {
      final Map<String, String>? next = applyCableSwap(
        assignment: assignment,
        draggedCableId: 'cable-1',
        toRightSocketId: 'right-1',
      );
      expect(next, isNotNull);
      expect(next!['cable-1'], 'right-1');
      expect(next['cable-2'], 'right-3');
      expect(next.values.toSet().length, next.length);
    });

    test('drop onto current socket is a no-op', () {
      final Map<String, String>? next = applyCableSwap(
        assignment: assignment,
        draggedCableId: 'cable-1',
        toRightSocketId: 'right-3',
      );
      expect(assignmentsEqual(next!, assignment), isTrue);
    });

    test('invalid target returns null without mutating caller map', () {
      final Map<String, String> snapshot = Map<String, String>.from(assignment);
      final Map<String, String>? next = applyCableSwap(
        assignment: assignment,
        draggedCableId: 'missing',
        toRightSocketId: 'right-1',
      );
      expect(next, isNull);
      expect(assignmentsEqual(assignment, snapshot), isTrue);
    });

    test('a valid swap series reaches zero intersections', () {
      Map<String, String> current = assignment;
      current = applyCableSwap(
        assignment: current,
        draggedCableId: 'cable-1',
        toRightSocketId: 'right-1',
      )!;
      current = applyCableSwap(
        assignment: current,
        draggedCableId: 'cable-2',
        toRightSocketId: 'right-2',
      )!;
      current = applyCableSwap(
        assignment: current,
        draggedCableId: 'cable-3',
        toRightSocketId: 'right-3',
      )!;
      expect(
        countCableIntersections(puzzle: puzzle, rightAssignment: current),
        0,
      );
    });

    test('rapid swaps do not corrupt one-to-one assignments', () {
      Map<String, String> current = assignment;
      final List<String> rights = puzzle.rightSockets
          .map((CableUntangleSocket s) => s.id)
          .toList();
      for (int i = 0; i < 40; i += 1) {
        final String cableId = puzzle.cables[i % puzzle.cables.length].id;
        final String target = rights[(i * 3) % rights.length];
        final Map<String, String>? next = applyCableSwap(
          assignment: current,
          draggedCableId: cableId,
          toRightSocketId: target,
        );
        expect(next, isNotNull);
        current = next!;
        expect(current.values.toSet().length, current.length);
        expect(current.length, puzzle.cables.length);
      }
    });

    test('replay reproduces final permutation from swap history', () {
      final List<CableUntangleSwap> swaps = <CableUntangleSwap>[
        const CableUntangleSwap(
          sequence: 1,
          draggedCableId: 'cable-1',
          displacedCableId: 'cable-2',
          fromRightSocketId: 'right-3',
          toRightSocketId: 'right-1',
          elapsedMs: 100,
        ),
      ];
      final Map<String, String>? replayed = replayCableSwaps(
        puzzle: puzzle,
        swaps: swaps,
      );
      expect(replayed?['cable-1'], 'right-1');
      expect(replayed?['cable-2'], 'right-3');
    });
  });

  group('precision.cable_untangle engine', () {
    test('registry resolves engine', () {
      final ChallengeEngine engine = ChallengeEngineRegistry().resolve(
        'precision.cable_untangle',
      );
      expect(engine, isA<PrecisionCableUntangleEngine>());
      expect(engine.engineId, 'precision.cable_untangle');
    });

    testWidgets('RTL ambient layout keeps board Directionality LTR', (
      WidgetTester tester,
    ) async {
      final List<Map<String, dynamic>> submits = <Map<String, dynamic>>[];
      final PublicChallenge challenge = makeCableChallenge(validConfig());
      final ChallengeEngine engine = PrecisionCableUntangleEngine();

      await tester.pumpWidget(
        wrapEngine(
          Builder(
            builder: (BuildContext context) {
              return engine.build(
                context,
                ChallengeContext(
                  challenge: challenge,
                  onSubmit: submits.add,
                  estimateServerNowMs: () => 1_500,
                  answerStatus: AnswerSubmissionStatus.idle,
                  inputEnabled: true,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();

      expect(find.textContaining('فك التشابك'), findsWidgets);
      expect(find.byType(CustomPaint), findsWidgets);
      final Finder boardDirectionality = find.descendant(
        of: find.byType(RepaintBoundary),
        matching: find.byWidgetPredicate(
          (Widget w) =>
              w is Directionality && w.textDirection == TextDirection.ltr,
        ),
      );
      expect(boardDirectionality, findsWidgets);
      expect(submits, isEmpty);
    });

    testWidgets('already-solved config shows unavailable and needs no assets', (
      WidgetTester tester,
    ) async {
      final PublicChallenge challenge = makeCableChallenge(
        validConfig(
          cables: <Map<String, dynamic>>[
            <String, dynamic>{
              'id': 'cable-1',
              'leftSocketId': 'left-1',
              'initialRightSocketId': 'right-1',
            },
            <String, dynamic>{
              'id': 'cable-2',
              'leftSocketId': 'left-2',
              'initialRightSocketId': 'right-2',
            },
            <String, dynamic>{
              'id': 'cable-3',
              'leftSocketId': 'left-3',
              'initialRightSocketId': 'right-3',
            },
            <String, dynamic>{
              'id': 'cable-4',
              'leftSocketId': 'left-4',
              'initialRightSocketId': 'right-4',
            },
          ],
        ),
      );

      await tester.pumpWidget(
        wrapEngine(
          Builder(
            builder: (BuildContext context) {
              return PrecisionCableUntangleEngine().build(
                context,
                ChallengeContext(
                  challenge: challenge,
                  onSubmit: (_) {},
                  estimateServerNowMs: () => 1_500,
                  answerStatus: AnswerSubmissionStatus.idle,
                  inputEnabled: true,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();
      expect(
        find.byKey(const ValueKey<String>('cable_untangle_board')),
        findsNothing,
      );
    });
  });
}
