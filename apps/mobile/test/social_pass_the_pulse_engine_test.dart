import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/social_pass_the_pulse_engine.dart';
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
        home: Scaffold(body: child),
      ),
    ),
  );
}

List<Map<String, dynamic>> _participants(List<String> names) {
  return <Map<String, dynamic>>[
    for (int i = 0; i < names.length; i += 1)
      <String, dynamic>{
        'playerId': 'p$i',
        'displayName': names[i],
      },
  ];
}

List<Map<String, dynamic>> _legs(int count, {int start = 1_000_000}) {
  return <Map<String, dynamic>>[
    for (int i = 0; i < count; i += 1)
      <String, dynamic>{
        'legId': 'leg-$i',
        'playerId': 'p$i',
        'routeIndex': i,
        'travelStartAtMs': start + 800 + i * 1800,
        'expectedArrivalAtMs': start + 800 + (i + 1) * 1800,
        'windowOpensAtMs': start + 800 + (i + 1) * 1800 - 280,
        'windowClosesAtMs': start + 800 + (i + 1) * 1800 + 320,
      },
  ];
}

PublicChallenge makePulseChallenge({
  required List<String> names,
  String? currentTargetPlayerId,
  String? currentLegId,
  Map<String, String>? results,
  int stateSequence = 1,
  int serverNowMs = 1_000_000,
  bool? isParticipant = true,
}) {
  final List<Map<String, dynamic>> participants = _participants(names);
  final Map<String, String> resolved = results ??
      <String, String>{
        for (int i = 0; i < names.length; i += 1) 'p$i': 'waiting',
      };
  final Map<String, dynamic> clientConfig = <String, dynamic>{
    'categoryKey': 'challenge.category.social',
    'titleKey': 'challenge.pass_the_pulse.intro',
    'promptKey': 'challenge.pass_the_pulse.prompt',
    'actionKey': 'challenge.pass_the_pulse.action',
    'youKey': 'challenge.pass_the_pulse.you',
    'timeRemainingKey': 'challenge.pass_the_pulse.time_remaining',
    'a11yTapReadyKey': 'challenge.pass_the_pulse.a11y_tap_ready',
    'a11yTapWaitKey': 'challenge.pass_the_pulse.a11y_tap_wait',
    'schemaVersion': 1,
    'participants': participants,
    'routePlayerIds': <String>[
      for (int i = 0; i < names.length; i += 1) 'p$i',
    ],
    'pulseStartAtMs': serverNowMs,
    'startDelayMs': 800,
    'segmentDurationMs': 1800,
    'hitWindowEarlyMs': 280,
    'hitWindowLateMs': 320,
    'resultTransitionMs': 900,
    'legs': _legs(names.length, start: serverNowMs),
    'currentLegId': currentLegId ?? 'leg-0',
    'currentTargetPlayerId': currentTargetPlayerId ?? 'p0',
    'results': resolved,
    'stateSequence': stateSequence,
    'challengeStatus': 'active',
  };
  if (isParticipant != null) {
    clientConfig['isParticipant'] = isParticipant;
  }
  return PublicChallenge(
    challengeInstanceId: 'ch-pulse',
    definitionId: 'social.pass_the_pulse.dev',
    definitionVersion: 1,
    engineId: 'social.pass_the_pulse',
    promptKey: 'challenge.pass_the_pulse.intro',
    clientConfig: clientConfig,
    serverNowMs: serverNowMs,
    startsAtMs: serverNowMs,
    deadlineAtMs: serverNowMs + 12000,
    durationMs: 12000,
    roundPhase: RoundPhase.answer,
  );
}

List<PlayerPublic> playersFor(List<String> names) {
  return <PlayerPublic>[
    for (int i = 0; i < names.length; i += 1)
      PlayerPublic(
        playerId: 'p$i',
        hearts: 3,
        energy: 0,
        status: PlayerStatus.active,
        presence: Presence.connected,
        submittedForCurrentChallenge: false,
        displayName: names[i],
      ),
  ];
}

Future<void> pumpPulse(
  WidgetTester tester, {
  required List<String> names,
  required void Function(Map<String, dynamic>) onSubmit,
  String localId = 'p0',
  String? currentTargetPlayerId,
  String? currentLegId,
  Map<String, String>? results,
  int stateSequence = 1,
  int nowMs = 1_000_500,
  bool disableAnimations = false,
  bool omitIsParticipant = false,
  Size surfaceSize = const Size(390, 844),
}) async {
  await tester.pumpWidget(
    wrapWithL10n(
      Builder(
        builder: (BuildContext context) {
          return SocialPassThePulseEngine().build(
            context,
            ChallengeContext(
              challenge: makePulseChallenge(
                names: names,
                currentTargetPlayerId: currentTargetPlayerId,
                currentLegId: currentLegId,
                results: results,
                stateSequence: stateSequence,
                serverNowMs: 1_000_000,
                isParticipant: omitIsParticipant ? null : true,
              ),
              onSubmit: onSubmit,
              estimateServerNowMs: () => nowMs,
              answerStatus: AnswerSubmissionStatus.idle,
              inputEnabled: true,
              localPlayerId: localId,
              players: playersFor(names),
            ),
          );
        },
      ),
      disableAnimations: disableAnimations,
      surfaceSize: surfaceSize,
    ),
  );
  await tester.pump();
}

void main() {
  test('registry resolves social.pass_the_pulse', () {
    final ChallengeEngine engine =
        ChallengeEngineRegistry().resolve('social.pass_the_pulse');
    expect(engine, isA<SocialPassThePulseEngine>());
    expect(ChallengeEngineRegistry().resolve('nope'), isA<UnknownEngine>());
  });

  testWidgets('shows display names not indexes for 2–6 players', (
    WidgetTester tester,
  ) async {
    for (final int count in <int>[2, 3, 4, 5, 6]) {
      final List<String> names = <String>[
        'وجدي',
        'أحمد',
        'Hajar',
        'محمد علي',
        'Very Long Display Name That Should Truncate',
        'وجدي',
      ].take(count).toList();
      await pumpPulse(
        tester,
        names: names,
        onSubmit: (_) {},
        surfaceSize: count >= 5 ? const Size(360, 780) : const Size(390, 844),
      );
      expect(find.text('مرّروا النبضة'), findsOneWidget);
      expect(find.textContaining('وجدي'), findsWidgets);
      expect(find.text('1'), findsNothing);
      expect(find.text('2'), findsNothing);
      expect(find.text('p0'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  testWidgets('local node shows أنت and tap submits legId', (
    WidgetTester tester,
  ) async {
    final List<Map<String, dynamic>> submitted = <Map<String, dynamic>>[];
    await pumpPulse(
      tester,
      names: <String>['وجدي', 'أحمد'],
      onSubmit: submitted.add,
      currentTargetPlayerId: 'p0',
      currentLegId: 'leg-0',
      nowMs: 1_002_600,
      omitIsParticipant: true,
    );
    expect(find.text('أنت'), findsOneWidget);
    await tester.tap(find.text('اضغط'));
    await tester.pump();
    expect(submitted, isNotEmpty);
    expect(submitted.first['legId'], 'leg-0');
    expect(submitted.first['final'], false);
  });

  testWidgets('stale lower sequence does not clear names', (
    WidgetTester tester,
  ) async {
    final ValueNotifier<PublicChallenge> challenge =
        ValueNotifier<PublicChallenge>(
      makePulseChallenge(
        names: <String>['وجدي', 'أحمد'],
        results: <String, String>{'p0': 'hit', 'p1': 'waiting'},
        stateSequence: 3,
      ),
    );
    await tester.pumpWidget(
      wrapWithL10n(
        ValueListenableBuilder<PublicChallenge>(
          valueListenable: challenge,
          builder: (BuildContext context, PublicChallenge value, _) {
            return SocialPassThePulseEngine().build(
              context,
              ChallengeContext(
                challenge: value,
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_003_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
                localPlayerId: 'p0',
                players: playersFor(<String>['وجدي', 'أحمد']),
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    challenge.value = makePulseChallenge(
      names: <String>['وجدي', 'أحمد'],
      results: <String, String>{'p0': 'waiting', 'p1': 'waiting'},
      stateSequence: 1,
    );
    await tester.pump();
    expect(find.textContaining('وجدي'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('RTL reduced-motion compact layout has no overflow', (
    WidgetTester tester,
  ) async {
    await pumpPulse(
      tester,
      names: <String>['وجدي', 'Hajar', 'محمد علي'],
      onSubmit: (_) {},
      disableAnimations: true,
      surfaceSize: const Size(320, 640),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('reconnect mid-round shows local name marker', (
    WidgetTester tester,
  ) async {
    await pumpPulse(
      tester,
      names: <String>['وجدي', 'أحمد', 'Hajar'],
      onSubmit: (_) {},
      localId: 'p1',
      nowMs: 1_002_000,
    );
    expect(find.textContaining('أحمد'), findsWidgets);
    expect(find.text('أنت'), findsOneWidget);
  });
}
