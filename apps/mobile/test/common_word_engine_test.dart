import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/common_word_engine.dart';
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

PublicChallenge makeCommonWordChallenge({
  String challengeInstanceId = 'cw-1',
  List<String>? optionKeys,
  List<Map<String, dynamic>>? clues,
  Map<String, String>? optionTexts,
  String? titleText,
  String? instructionText,
}) {
  const int nowMs = 1_000_000;
  return PublicChallenge(
    challengeInstanceId: challengeInstanceId,
    definitionId: 'trivia.common_word.dev',
    definitionVersion: 1,
    engineId: 'trivia.common_word',
    promptKey: 'challenge.common_word.intro',
    serverNowMs: nowMs,
    startsAtMs: nowMs,
    deadlineAtMs: nowMs + 10_000,
    durationMs: 10_000,
    roundPhase: RoundPhase.answer,
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.trivia',
      'promptKey': 'challenge.common_word.prompt',
      'titleKey': 'challenge.common_word.title',
      'titleText': titleText ?? 'الكلمة المشتركة',
      'instructionText':
          instructionText ?? 'اختر كلمة ترتبط بالعبارات الثلاث',
      'questionKey': 'common_word.q.eye',
      'clues':
          clues ??
          <Map<String, dynamic>>[
            <String, dynamic>{
              'id': 'clue.needle',
              'text': 'الإبرة',
              'visualHint': 'needle',
            },
            <String, dynamic>{
              'id': 'clue.storm',
              'text': 'العاصفة',
              'visualHint': 'storm',
            },
            <String, dynamic>{
              'id': 'clue.water',
              'text': 'الماء',
              'visualHint': 'water',
            },
          ],
      'optionKeys':
          optionKeys ??
          <String>['opt.eye', 'opt.heart', 'opt.head', 'opt.door'],
      'optionTexts':
          optionTexts ??
          <String, String>{
            'opt.eye': 'عين',
            'opt.heart': 'قلب',
            'opt.head': 'رأس',
            'opt.door': 'باب',
          },
    },
  );
}

void main() {
  test('registry resolves common word engine', () {
    final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
    expect(registry.resolve('trivia.common_word'), isA<CommonWordEngine>());
  });

  testWidgets('binding layout shows title, clues, center node, and options', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeCommonWordChallenge();
    String? submitted;
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return CommonWordEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: (Map<String, dynamic> answer) {
                  submitted = answer['chosenOptionKey'] as String?;
                },
                estimateServerNowMs: () => 1_002_000,
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

    expect(find.text('الكلمة المشتركة'), findsOneWidget);
    expect(find.text('اختر كلمة ترتبط بالعبارات الثلاث'), findsOneWidget);
    expect(find.text('الإبرة'), findsOneWidget);
    expect(find.text('العاصفة'), findsOneWidget);
    expect(find.text('الماء'), findsOneWidget);
    expect(find.text('?'), findsOneWidget);
    expect(find.text('عين'), findsOneWidget);
    expect(find.text('قلب'), findsOneWidget);
    expect(find.text('رأس'), findsOneWidget);
    expect(find.text('باب'), findsOneWidget);

    await tester.tap(find.text('عين'));
    await tester.pump();
    expect(submitted, 'opt.eye');
  });

  testWidgets('renders dynamic server content without hardcoded reference clues', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return CommonWordEngine().build(
              context,
              ChallengeContext(
                challenge: makeCommonWordChallenge(
                  titleText: 'عنوان مخصص',
                  instructionText: 'تعليمات مخصصة',
                  clues: <Map<String, dynamic>>[
                    <String, dynamic>{'id': 'a', 'text': 'كتاب'},
                    <String, dynamic>{'id': 'b', 'text': 'قلم'},
                    <String, dynamic>{'id': 'c', 'text': 'ورقة'},
                  ],
                  optionKeys: <String>['opt.x', 'opt.y'],
                  optionTexts: <String, String>{
                    'opt.x': 'حبر',
                    'opt.y': 'ضوء',
                  },
                ),
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_002_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('كتاب'), findsOneWidget);
    expect(find.text('حبر'), findsOneWidget);
    expect(find.text('الإبرة'), findsNothing);
  });

  testWidgets('reconnect does not throw and keeps content', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeCommonWordChallenge(
      challengeInstanceId: 'cw-reconnect',
    );
    Widget build() => wrapWithL10n(
      Builder(
        builder: (BuildContext context) {
          return CommonWordEngine().build(
            context,
            ChallengeContext(
              challenge: challenge,
              onSubmit: (_) {},
              estimateServerNowMs: () => 1_002_000,
              answerStatus: AnswerSubmissionStatus.idle,
              inputEnabled: true,
            ),
          );
        },
      ),
    );
    await tester.pumpWidget(build());
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(build());
    await tester.pump();
    expect(find.text('الكلمة المشتركة'), findsOneWidget);
  });

  testWidgets('reduced motion compact layout does not overflow', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return CommonWordEngine().build(
              context,
              ChallengeContext(
                challenge: makeCommonWordChallenge(),
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_002_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
        disableAnimations: true,
        surfaceSize: const Size(320, 640),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.takeException(), isNull);
    expect(find.text('الكلمة المشتركة'), findsOneWidget);
  });

  testWidgets('narrow screen shows full challenge title without ellipsis', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return CommonWordEngine().build(
              context,
              ChallengeContext(
                challenge: makeCommonWordChallenge(),
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_002_000,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
        surfaceSize: const Size(300, 640),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('الكلمة المشتركة'), findsOneWidget);
    expect(find.textContaining('...'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending then authoritative failure still shows options', (
    WidgetTester tester,
  ) async {
    final PublicChallenge challenge = makeCommonWordChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return CommonWordEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: (_) {},
                estimateServerNowMs: () => 1_002_000,
                answerStatus: AnswerSubmissionStatus.confirmed,
                inputEnabled: false,
                localOutcome: 'failure',
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    expect(find.text('عين'), findsOneWidget);
    expect(find.text('?'), findsOneWidget);
  });
}
