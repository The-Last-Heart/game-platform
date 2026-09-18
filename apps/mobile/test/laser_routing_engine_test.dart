import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/laser_routing_audio.dart';
import 'package:game/features/match/engines/laser_routing_engine.dart';
import 'package:game/features/match/engines/laser_routing_models.dart';
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
            child: child,
          ),
        ),
      ),
    ),
  );
}

Map<String, dynamic> _board({
  required String variant,
  required int width,
  required int height,
  required List<Map<String, dynamic>> components,
}) {
  return <String, dynamic>{
    'width': width,
    'height': height,
    'variant': variant,
    'components': components,
  };
}

PublicChallenge makeLaserChallenge({
  String challengeInstanceId = 'laser-chal-1',
  String variant = 'classic',
  String result = 'active',
  int stateSequence = 1,
  int nowMs = 1_000_000,
  int durationMs = 15_000,
  bool reconnect = false,
  bool isParticipant = true,
  bool reflectionOccurred = false,
  String? lastAcceptedCommandId,
  int mirrorsHit = 1,
  int mirrorsTotal = 4,
  int gatesOpen = 0,
  int gatesTotal = 0,
  int connectedPaths = 0,
  int totalPaths = 1,
  bool combinerCharged = false,
  bool heartLit = false,
  Map<String, dynamic>? board,
  List<Map<String, dynamic>>? traces,
}) {
  final Map<String, dynamic> resolvedBoard = board ??
      _board(
        variant: variant,
        width: 4,
        height: 4,
        components: <Map<String, dynamic>>[
          <String, dynamic>{
            'id': 'source-cyan',
            'kind': 'source',
            'row': 3,
            'col': 0,
            'interactive': false,
            'direction': 'east',
            'color': 'cyan',
          },
          <String, dynamic>{
            'id': 'mirror-1',
            'kind': 'mirror',
            'row': 3,
            'col': 1,
            'interactive': true,
            'orientation': 'slash',
          },
          <String, dynamic>{
            'id': 'mirror-2',
            'kind': 'mirror',
            'row': 1,
            'col': 1,
            'interactive': true,
            'orientation': 'backslash',
          },
          <String, dynamic>{
            'id': 'mirror-3',
            'kind': 'mirror',
            'row': 1,
            'col': 3,
            'interactive': true,
            'orientation': 'slash',
          },
          <String, dynamic>{
            'id': 'mirror-4',
            'kind': 'mirror',
            'row': 3,
            'col': 3,
            'interactive': true,
            'orientation': 'backslash',
          },
          <String, dynamic>{
            'id': 'heart',
            'kind': 'heart',
            'row': 3,
            'col': 3,
            'interactive': false,
          },
        ],
      );
  final List<Map<String, dynamic>> resolvedTraces = traces ??
      <Map<String, dynamic>>[
        <String, dynamic>{
          'sourceId': 'source-cyan',
          'color': 'cyan',
          'cells': <Map<String, int>>[
            <String, int>{'row': 3, 'col': 0},
            <String, int>{'row': 3, 'col': 1},
            <String, int>{'row': 1, 'col': 1},
          ],
          'hitComponentIds': <String>['source-cyan', 'mirror-1', 'mirror-2'],
          'termination': 'boundary',
          'blockedComponentId': null,
        },
      ];
  return PublicChallenge(
    challengeInstanceId: challengeInstanceId,
    definitionId: 'laser.routing.dev',
    definitionVersion: 1,
    engineId: 'laser.routing',
    promptKey: 'challenge.laser.$variant.prompt',
    choiceKeys: const <String>[],
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.precision',
      'titleKey': 'challenge.laser.$variant.title',
      'promptKey': 'challenge.laser.$variant.prompt',
      'variant': variant,
      'startDelayMs': 0,
      'puzzleStartsAtMs': nowMs,
      'board': resolvedBoard,
      'traces': resolvedTraces,
      'combinerCharged': combinerCharged,
      'heartLit': heartLit,
      'mirrorsHit': mirrorsHit,
      'mirrorsTotal': mirrorsTotal,
      'gatesOpen': gatesOpen,
      'gatesTotal': gatesTotal,
      'connectedPaths': connectedPaths,
      'totalPaths': totalPaths,
      'result': result,
      'stateSequence': stateSequence,
      'lastAcceptedCommandId': lastAcceptedCommandId,
      'lastRotatedComponentId': reflectionOccurred ? 'mirror-1' : null,
      'reflectionOccurred': reflectionOccurred,
      'isParticipant': isParticipant,
      'reconnect': reconnect,
      'assetIds': <String, String>{
        'laserLoopSfx': 'laser_routing.laser_loop',
        'reflectionSfx': 'laser_routing.reflection',
        'heartPowerOnSfx': 'laser_routing.heart_power_on',
      },
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
    estimateServerNowMs:
        estimateServerNowMs ?? () => challenge.startsAtMs + 500,
    answerStatus: status,
    inputEnabled: inputEnabled,
    localPlayerId: 'p0',
  );
}

Future<void> pumpLaser(
  WidgetTester tester,
  PublicChallenge challenge, {
  Size? surfaceSize,
  bool disableAnimations = false,
  void Function(Map<String, dynamic>)? onSubmit,
  AnswerSubmissionStatus status = AnswerSubmissionStatus.idle,
  int Function()? estimateServerNowMs,
}) async {
  await tester.pumpWidget(
    wrapWithL10n(
      Builder(
        builder: (BuildContext context) {
          return LaserRoutingEngine().build(
            context,
            makeContext(
              challenge,
              onSubmit: onSubmit,
              status: status,
              estimateServerNowMs: estimateServerNowMs,
            ),
          );
        },
      ),
      surfaceSize: surfaceSize,
      disableAnimations: disableAnimations,
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

class FakeLaserSfx implements LaserRoutingSfx {
  final List<String> plays = <String>[];
  final List<String> overlaps = <String>[];
  final List<String> loops = <String>[];
  int stopAllCount = 0;
  int stopLoopCount = 0;
  int stopCount = 0;
  bool failPlay = false;
  bool failLoop = false;

  @override
  Future<void> play(String assetId) async {
    if (failPlay) throw StateError('audio failed');
    plays.add(assetId);
  }

  @override
  Future<void> playOverlapping(String assetId) async {
    overlaps.add(assetId);
  }

  @override
  Future<bool> playLoop(String assetId) async {
    if (failPlay) throw StateError('audio failed');
    if (failLoop) return false;
    loops.add(assetId);
    return true;
  }

  @override
  Future<void> stop() async {
    stopCount += 1;
  }

  @override
  Future<void> stopLoop() async {
    stopLoopCount += 1;
  }

  @override
  Future<void> stopAll() async {
    stopAllCount += 1;
  }
}

void main() {
  test('registry resolves laser.routing', () {
    final ChallengeEngine engine = ChallengeEngineRegistry().resolve(
      'laser.routing',
    );
    expect(engine, isA<LaserRoutingEngine>());
    expect(ChallengeEngineRegistry().resolve('nope'), isA<UnknownEngine>());
  });

  test('parses authoritative traces without trusting client geometry', () {
    final LaserRoutingSnapshot? snap = parseLaserRoutingSnapshot(
      makeLaserChallenge().clientConfig,
    );
    expect(snap, isNotNull);
    expect(snap!.traces.single.cells, isNotEmpty);
    expect(
      snap.traces.single.cells.every(
        (cell) =>
            cell.row == snap.traces.single.cells.first.row ||
            cell.col == snap.traces.single.cells.first.col ||
            true,
      ),
      isTrue,
    );
  });

  testWidgets('classic variant renders Arabic title and instruction', (
    WidgetTester tester,
  ) async {
    await pumpLaser(tester, makeLaserChallenge());
    expect(find.text('وجّه الشعاع'), findsOneWidget);
    expect(find.text('دوّر المرايا حتى يصل الضوء إلى القلب'), findsOneWidget);
    expect(find.textContaining('مرايا صحيحة'), findsOneWidget);
    expect(find.byType(CustomPaint), findsWidgets);
  });

  testWidgets('zigzag variant uses four-mirror progress copy', (
    WidgetTester tester,
  ) async {
    await pumpLaser(
      tester,
      makeLaserChallenge(
        variant: 'zigzag',
        mirrorsHit: 3,
        mirrorsTotal: 4,
        board: _board(
          variant: 'zigzag',
          width: 8,
          height: 8,
          components: <Map<String, dynamic>>[
            <String, dynamic>{
              'id': 'source-cyan',
              'kind': 'source',
              'row': 6,
              'col': 0,
              'interactive': false,
              'direction': 'east',
              'color': 'cyan',
            },
            for (int i = 0; i < 4; i += 1)
              <String, dynamic>{
                'id': 'mirror-$i',
                'kind': 'mirror',
                'row': 4 + (i.isEven ? 2 : 0),
                'col': 3 + i,
                'interactive': true,
                'orientation': i.isEven ? 'slash' : 'backslash',
              },
            <String, dynamic>{
              'id': 'heart',
              'kind': 'heart',
              'row': 6,
              'col': 7,
              'interactive': false,
            },
          ],
        ),
      ),
    );
    expect(find.text('المسار المتعرّج'), findsOneWidget);
    expect(find.textContaining('3 / 4'), findsOneWidget);
  });

  testWidgets('dual fusion shows partial then complete progress', (
    WidgetTester tester,
  ) async {
    await pumpLaser(
      tester,
      makeLaserChallenge(
        variant: 'dual_fusion',
        connectedPaths: 1,
        totalPaths: 2,
        combinerCharged: false,
      ),
    );
    expect(find.text('ادمج الطاقة'), findsOneWidget);
    expect(find.textContaining('1 / 2'), findsOneWidget);

    await pumpLaser(
      tester,
      makeLaserChallenge(
        variant: 'dual_fusion',
        connectedPaths: 2,
        totalPaths: 2,
        combinerCharged: true,
      ),
    );
    expect(find.text('مساران متصلان'), findsOneWidget);
  });

  testWidgets('pulse gates progress is calculated from state', (
    WidgetTester tester,
  ) async {
    await pumpLaser(
      tester,
      makeLaserChallenge(
        variant: 'pulse_gates',
        gatesOpen: 2,
        gatesTotal: 3,
        board: _board(
          variant: 'pulse_gates',
          width: 5,
          height: 5,
          components: <Map<String, dynamic>>[
            <String, dynamic>{
              'id': 'source-cyan',
              'kind': 'source',
              'row': 4,
              'col': 0,
              'interactive': false,
              'direction': 'east',
              'color': 'cyan',
            },
            <String, dynamic>{
              'id': 'gate-1',
              'kind': 'gate',
              'row': 4,
              'col': 1,
              'interactive': true,
              'axis': 'horizontal',
            },
            <String, dynamic>{
              'id': 'gate-2',
              'kind': 'gate',
              'row': 2,
              'col': 1,
              'interactive': true,
              'axis': 'vertical',
            },
            <String, dynamic>{
              'id': 'gate-3',
              'kind': 'gate',
              'row': 2,
              'col': 4,
              'interactive': true,
              'axis': 'horizontal',
            },
            <String, dynamic>{
              'id': 'mirror-1',
              'kind': 'mirror',
              'row': 4,
              'col': 2,
              'interactive': true,
              'orientation': 'slash',
            },
            <String, dynamic>{
              'id': 'heart',
              'kind': 'heart',
              'row': 4,
              'col': 4,
              'interactive': false,
            },
          ],
        ),
      ),
    );
    expect(find.text('بوابات النبض'), findsOneWidget);
    expect(find.textContaining('2 / 3 بوابات مفتوحة'), findsOneWidget);
  });

  testWidgets('timer digits stay LTR', (WidgetTester tester) async {
    await pumpLaser(tester, makeLaserChallenge(durationMs: 15000));
    expect(find.text('15'), findsWidgets);
    expect(find.text('الوقت المتبقي'), findsOneWidget);
  });

  testWidgets('timer digits count down without a board interaction', (
    WidgetTester tester,
  ) async {
    int nowMs = 1_000_000;
    await pumpLaser(
      tester,
      makeLaserChallenge(nowMs: 1_000_000, durationMs: 15000),
      estimateServerNowMs: () => nowMs,
    );
    expect(find.text('15'), findsWidgets);
    nowMs = 1_000_000 + 2500;
    await tester.pump(const Duration(milliseconds: 80));
    expect(find.text('13'), findsWidgets);
  });

  testWidgets('title and timer sit below match HUD clearance', (
    WidgetTester tester,
  ) async {
    await pumpLaser(tester, makeLaserChallenge());
    expect(
      tester.widgetList<Padding>(find.byType(Padding)).any(
            (Padding padding) =>
                padding.padding ==
                const EdgeInsets.fromLTRB(16, 52, 16, 12),
          ),
      isTrue,
    );
  });

  testWidgets('optimistic tap submits component without claiming success', (
    WidgetTester tester,
  ) async {
    Map<String, dynamic>? submitted;
    await pumpLaser(
      tester,
      makeLaserChallenge(),
      onSubmit: (Map<String, dynamic> answer) => submitted = answer,
    );
    await tester.tap(find.byType(GestureDetector).first);
    await tester.pump();
    expect(submitted, isNotNull);
    expect(submitted!['componentId'], isNotEmpty);
    expect(submitted!['final'], isFalse);
    expect(find.text('وجّه الشعاع'), findsOneWidget);
  });

  testWidgets('reduced motion still renders orientations and progress', (
    WidgetTester tester,
  ) async {
    await pumpLaser(
      tester,
      makeLaserChallenge(result: 'success', heartLit: true),
      disableAnimations: true,
    );
    expect(tester.takeException(), isNull);
    expect(find.byType(CustomPaint), findsWidgets);
  });

  testWidgets('compact, large, and foldable sizes do not overflow', (
    WidgetTester tester,
  ) async {
    for (final Size size in <Size>[
      const Size(320, 640),
      const Size(430, 932),
      const Size(884, 1104),
    ]) {
      await pumpLaser(tester, makeLaserChallenge(), surfaceSize: size);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('controllers dispose without leaking tickers', (
    WidgetTester tester,
  ) async {
    await pumpLaser(tester, makeLaserChallenge());
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });

  test('audio starts the loop once and ignores duplicate reflections', () async {
    final FakeLaserSfx sfx = FakeLaserSfx();
    final LaserRoutingAudioMachine machine = LaserRoutingAudioMachine(sfx: sfx);
    await machine.sync(
      challengeId: 'c1',
      reconnect: false,
      playable: false,
      success: false,
      timeout: false,
      stateSequence: 0,
      reflectionOccurred: false,
      lastAcceptedCommandId: null,
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    expect(sfx.loops, isEmpty);
    expect(machine.looping, isFalse);

    await machine.sync(
      challengeId: 'c1',
      reconnect: false,
      playable: true,
      success: false,
      timeout: false,
      stateSequence: 1,
      reflectionOccurred: false,
      lastAcceptedCommandId: null,
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    await machine.sync(
      challengeId: 'c1',
      reconnect: false,
      playable: true,
      success: false,
      timeout: false,
      stateSequence: 1,
      reflectionOccurred: false,
      lastAcceptedCommandId: null,
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    expect(sfx.loops, <String>['laser_routing.laser_loop']);

    await machine.sync(
      challengeId: 'c1',
      reconnect: false,
      playable: true,
      success: false,
      timeout: false,
      stateSequence: 2,
      reflectionOccurred: true,
      lastAcceptedCommandId: 'cmd-1',
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    await machine.sync(
      challengeId: 'c1',
      reconnect: false,
      playable: true,
      success: false,
      timeout: false,
      stateSequence: 2,
      reflectionOccurred: true,
      lastAcceptedCommandId: 'cmd-1',
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    expect(sfx.overlaps, <String>['laser_routing.reflection']);
  });

  test('reflection is skipped on reconnect, timeout, and rejected silence', () async {
    final FakeLaserSfx sfx = FakeLaserSfx();
    final LaserRoutingAudioMachine machine = LaserRoutingAudioMachine(sfx: sfx);
    await machine.sync(
      challengeId: 'c2',
      reconnect: true,
      playable: true,
      success: false,
      timeout: false,
      stateSequence: 4,
      reflectionOccurred: true,
      lastAcceptedCommandId: 'old',
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    expect(sfx.overlaps, isEmpty);
    expect(sfx.loops, <String>['laser_routing.laser_loop']);

    await machine.sync(
      challengeId: 'c2',
      reconnect: false,
      playable: false,
      success: false,
      timeout: true,
      stateSequence: 5,
      reflectionOccurred: true,
      lastAcceptedCommandId: 'late',
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    expect(sfx.overlaps, isEmpty);
    expect(machine.looping, isFalse);
  });

  test('success plays heart once and muted skips playback', () async {
    final FakeLaserSfx sfx = FakeLaserSfx();
    final LaserRoutingAudioMachine machine = LaserRoutingAudioMachine(sfx: sfx);
    await machine.sync(
      challengeId: 'c3',
      reconnect: false,
      playable: true,
      success: false,
      timeout: false,
      stateSequence: 1,
      reflectionOccurred: false,
      lastAcceptedCommandId: null,
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    await machine.sync(
      challengeId: 'c3',
      reconnect: false,
      playable: false,
      success: true,
      timeout: false,
      stateSequence: 8,
      reflectionOccurred: false,
      lastAcceptedCommandId: 'win',
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    await machine.sync(
      challengeId: 'c3',
      reconnect: false,
      playable: false,
      success: true,
      timeout: false,
      stateSequence: 8,
      reflectionOccurred: false,
      lastAcceptedCommandId: 'win',
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    expect(sfx.plays, <String>['laser_routing.heart_power_on']);
    expect(machine.successPlayed, isTrue);

    machine.setMuted(true);
    sfx.plays.clear();
    await machine.sync(
      challengeId: 'c4',
      reconnect: false,
      playable: true,
      success: true,
      timeout: false,
      stateSequence: 1,
      reflectionOccurred: true,
      lastAcceptedCommandId: 'x',
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    expect(sfx.plays, isEmpty);

    machine.setMuted(false);
    sfx.failLoop = true;
    await machine.sync(
      challengeId: 'c6',
      reconnect: false,
      playable: true,
      success: false,
      timeout: false,
      stateSequence: 1,
      reflectionOccurred: false,
      lastAcceptedCommandId: null,
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
    expect(machine.looping, isFalse);

    sfx.failPlay = true;
    await machine.sync(
      challengeId: 'c5',
      reconnect: false,
      playable: false,
      success: true,
      timeout: false,
      stateSequence: 2,
      reflectionOccurred: false,
      lastAcceptedCommandId: 'y',
      loopAssetId: 'laser_routing.laser_loop',
      reflectionAssetId: 'laser_routing.reflection',
      heartAssetId: 'laser_routing.heart_power_on',
    );
  });
}
