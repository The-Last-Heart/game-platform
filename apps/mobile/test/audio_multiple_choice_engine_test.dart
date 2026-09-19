import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/audio_multiple_choice_engine.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/trivia_multiple_choice_engine.dart';
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
  Size surfaceSize = const Size(400, 800),
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

Map<String, dynamic> visualizationJson() {
  return <String, dynamic>{
    'schemaVersion': 1,
    'audioContentHash': 'test',
    'durationMs': 2000,
    'frameIntervalMs': 40,
    'waveform': List<double>.filled(160, 0.2),
    'spectrumFrames': List<List<double>>.generate(
      50,
      (int i) => List<double>.filled(32, i == 10 ? 0.8 : 0.05),
    ),
  };
}

PublicChallenge makeAudioChallenge({
  String answerTarget = 'artist',
  String challengeInstanceId = 'audio-1',
  int playAtMs = 1_000_000,
  int nowMs = 1_000_000,
  int durationMs = 8000,
  Map<String, dynamic>? extraConfig,
}) {
  final bool track = answerTarget == 'track';
  return PublicChallenge(
    challengeInstanceId: challengeInstanceId,
    definitionId: 'audio.multiple_choice.dev',
    definitionVersion: 1,
    engineId: 'audio.multiple_choice',
    promptKey: 'challenge.audio_mc.intro',
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.audio',
      'titleKey': 'challenge.audio_mc.intro',
      'promptKey': track
          ? 'challenge.audio_mc.prompt_track'
          : 'challenge.audio_mc.prompt_artist',
      'questionKey': track ? 'audio_mc.q.track_1' : 'audio_mc.q.artist_1',
      'questionText': track ? 'ما اسم الأغنية؟' : 'من صاحب هذا الصوت؟',
      'targetBadgeKey': track
          ? 'challenge.audio_mc.badge_track'
          : 'challenge.audio_mc.badge_artist',
      'answerTarget': answerTarget,
      'optionKeys': track
          ? <String>[
              'audio_mc.opt.track_1_a',
              'audio_mc.opt.track_1_b',
              'audio_mc.opt.track_1_c',
              'audio_mc.opt.track_1_d',
            ]
          : <String>[
              'audio_mc.opt.artist_1_a',
              'audio_mc.opt.artist_1_b',
              'audio_mc.opt.artist_1_c',
              'audio_mc.opt.artist_1_d',
            ],
      'optionTexts': track
          ? <String, String>{
              'audio_mc.opt.track_1_a': 'نبض أخير',
              'audio_mc.opt.track_1_b': 'ليل بعيد',
              'audio_mc.opt.track_1_c': 'صوت القلب',
              'audio_mc.opt.track_1_d': 'بعد الغياب',
            }
          : <String, String>{
              'audio_mc.opt.artist_1_a': 'رامي',
              'audio_mc.opt.artist_1_b': 'نور',
              'audio_mc.opt.artist_1_c': 'ليان',
              'audio_mc.opt.artist_1_d': 'سليم',
            },
      'audioDurationMs': 2000,
      'playAtMs': playAtMs,
      'visualization': visualizationJson(),
      ...?extraConfig,
    },
    serverNowMs: nowMs,
    startsAtMs: playAtMs,
    deadlineAtMs: playAtMs + durationMs,
    durationMs: durationMs,
    roundPhase: RoundPhase.answer,
  );
}

ChallengeContext makeContext({
  required PublicChallenge challenge,
  void Function(Map<String, dynamic> answer)? onSubmit,
  AnswerSubmissionStatus answerStatus = AnswerSubmissionStatus.idle,
  bool inputEnabled = true,
  String? localOutcome,
  int Function()? estimateServerNowMs,
}) {
  return ChallengeContext(
    challenge: challenge,
    onSubmit: onSubmit ?? (_) {},
    estimateServerNowMs: estimateServerNowMs ?? () => challenge.startsAtMs,
    answerStatus: answerStatus,
    inputEnabled: inputEnabled,
    localOutcome: localOutcome,
  );
}

void main() {
  test('registry resolves audio.multiple_choice', () {
    final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
    final ChallengeEngine engine = registry.resolve('audio.multiple_choice');
    expect(engine, isA<AudioMultipleChoiceEngine>());
    expect(engine.engineId, 'audio.multiple_choice');
    expect(registry.resolve('unknown.x'), isA<UnknownEngine>());
    expect(
      registry.resolve('trivia.multiple_choice'),
      isA<TriviaMultipleChoiceEngine>(),
    );
  });

  testWidgets('artist prompt, badge, RTL, and 2×2 options', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(challenge: makeAudioChallenge()),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('خَمّن الصوت'), findsWidgets);
    expect(find.text('من صاحب هذا الصوت؟'), findsOneWidget);
    expect(find.text('المطلوب: اسم المغني'), findsOneWidget);
    expect(find.text('رامي'), findsOneWidget);
    expect(find.text('نور'), findsOneWidget);
    expect(find.text('ليان'), findsOneWidget);
    expect(find.text('سليم'), findsOneWidget);
    expect(
      tester
          .widgetList<Directionality>(find.byType(Directionality))
          .any((Directionality d) => d.textDirection == TextDirection.rtl),
      isTrue,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('track-mode prompt and badge', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(challenge: makeAudioChallenge(answerTarget: 'track')),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('ما اسم الأغنية؟'), findsOneWidget);
    expect(find.text('المطلوب: اسم الأغنية'), findsOneWidget);
  });

  testWidgets('seat overlay swaps question and options without remounting', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(
                challenge: makeAudioChallenge(
                  extraConfig: <String, dynamic>{
                    'audioAssetId': 'ca_shared_room_clip',
                  },
                ),
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('من صاحب هذا الصوت؟'), findsOneWidget);
    expect(find.text('رامي'), findsOneWidget);

    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(
                challenge: makeAudioChallenge(
                  answerTarget: 'track',
                  extraConfig: <String, dynamic>{
                    'audioAssetId': 'ca_seat_private_clip',
                  },
                ),
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('ما اسم الأغنية؟'), findsOneWidget);
    expect(find.text('نبض أخير'), findsOneWidget);
    expect(find.text('من صاحب هذا الصوت؟'), findsNothing);
    expect(find.text('رامي'), findsNothing);
  });

  testWidgets('song question wins over a stale singer badge', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(
                challenge: makeAudioChallenge(
                  answerTarget: 'artist',
                  extraConfig: <String, dynamic>{
                    'questionKey': 'audio_mc.q.track_1',
                    'questionText': 'ما اسم الأغنية؟',
                    'promptKey': 'challenge.audio_mc.prompt_artist',
                    'targetBadgeKey': 'challenge.audio_mc.badge_artist',
                    'optionKeys': <String>[
                      'audio_mc.opt.track_1_a',
                      'audio_mc.opt.track_1_b',
                      'audio_mc.opt.track_1_c',
                      'audio_mc.opt.track_1_d',
                    ],
                    'optionTexts': <String, String>{
                      'audio_mc.opt.track_1_a': 'نبض أخير',
                      'audio_mc.opt.track_1_b': 'ليل بعيد',
                      'audio_mc.opt.track_1_c': 'صوت القلب',
                      'audio_mc.opt.track_1_d': 'بعد الغياب',
                    },
                  },
                ),
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('ما اسم الأغنية؟'), findsOneWidget);
    expect(find.text('المطلوب: اسم الأغنية'), findsOneWidget);
    expect(find.text('المطلوب: اسم المغني'), findsNothing);
  });

  testWidgets('reactor play/pause control toggles playback state', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(challenge: makeAudioChallenge()),
            );
          },
        ),
      ),
    );
    await tester.pump();
    final Finder reactor = find.byWidgetPredicate((Widget widget) {
      return widget is Semantics &&
          widget.properties.button == true &&
          (widget.properties.label?.contains('مفاعل الصوت') ?? false);
    });
    expect(reactor, findsOneWidget);
    expect(
      tester.widget<Semantics>(reactor).properties.label,
      contains('تشغيل الصوت'),
    );
    await tester.tap(reactor);
    await tester.pump();
    expect(
      tester.widget<Semantics>(reactor).properties.label,
      contains('إيقاف الصوت'),
    );
    await tester.tap(reactor);
    await tester.pump();
    expect(
      tester.widget<Semantics>(reactor).properties.label,
      contains('تشغيل الصوت'),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('round timer keeps counting independently of clip playback', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    int nowMs = 1_000_000;
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(
                challenge: makeAudioChallenge(
                  playAtMs: 1_000_000,
                  nowMs: 1_000_000,
                  durationMs: 8000,
                ),
                estimateServerNowMs: () => nowMs,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('00:08'), findsWidgets);
    nowMs += 2000;
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.text('00:06'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending answer submits chosenOptionKey once', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final List<Map<String, dynamic>> answers = <Map<String, dynamic>>[];
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(
                challenge: makeAudioChallenge(),
                onSubmit: answers.add,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('نور'));
    await tester.pump();
    await tester.tap(find.text('رامي'));
    await tester.pump();
    expect(answers, hasLength(1));
    expect(answers.first['chosenOptionKey'], 'audio_mc.opt.artist_1_b');
  });

  testWidgets('authoritative correct and incorrect states', (
    WidgetTester tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(
                challenge: makeAudioChallenge(),
                answerStatus: AnswerSubmissionStatus.confirmed,
                localOutcome: 'success',
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('timeout disables input', (WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(400, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final List<Map<String, dynamic>> answers = <Map<String, dynamic>>[];
    final PublicChallenge challenge = makeAudioChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(
                challenge: challenge,
                onSubmit: answers.add,
                localOutcome: 'timeout',
                estimateServerNowMs: () => challenge.deadlineAtMs + 10,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('رامي'));
    await tester.pump();
    expect(answers, isEmpty);
  });

  testWidgets('reduced-motion and compact/foldable layouts do not overflow', (
    WidgetTester tester,
  ) async {
    for (final Size size in <Size>[
      const Size(320, 640),
      const Size(430, 932),
      const Size(884, 1104),
    ]) {
      await tester.binding.setSurfaceSize(size);
      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return AudioMultipleChoiceEngine().build(
                context,
                makeContext(
                  challenge: makeAudioChallenge(playAtMs: 1, nowMs: 5000),
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
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('disposes animation controllers without errors', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return AudioMultipleChoiceEngine().build(
              context,
              makeContext(challenge: makeAudioChallenge()),
            );
          },
        ),
      ),
    );
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });

  testWidgets('existing trivia multiple choice still renders', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return TriviaMultipleChoiceEngine().build(
              context,
              ChallengeContext(
                challenge: PublicChallenge(
                  challengeInstanceId: 't1',
                  definitionId: 'trivia.multiple_choice.dev',
                  definitionVersion: 1,
                  engineId: 'trivia.multiple_choice',
                  promptKey: 'challenge.trivia.intro',
                  clientConfig: const <String, dynamic>{
                    'questionKey': 'trivia.q.japan_capital',
                    'questionText': 'ما عاصمة اليابان؟',
                    'optionKeys': <String>[
                      'trivia.opt.osaka',
                      'trivia.opt.tokyo',
                    ],
                    'optionTexts': <String, String>{
                      'trivia.opt.osaka': 'أوساكا',
                      'trivia.opt.tokyo': 'طوكيو',
                    },
                  },
                  serverNowMs: 1,
                  startsAtMs: 1,
                  deadlineAtMs: 8000,
                  durationMs: 8000,
                  roundPhase: RoundPhase.answer,
                ),
                onSubmit: (_) {},
                estimateServerNowMs: () => 1,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('ما عاصمة اليابان؟'), findsOneWidget);
    expect(find.text('طوكيو'), findsOneWidget);
  });
}
