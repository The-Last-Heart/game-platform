import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/challenge_engine_registry.dart';
import 'package:game/features/match/engines/cipher_symbols.dart';
import 'package:game/features/match/engines/symbol_cipher_word_engine.dart';
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

PublicChallenge makeCipherChallenge({
  String challengeInstanceId = 'sc-1',
  int? deadlineAtMs,
}) {
  const int nowMs = 1_000_000;
  return PublicChallenge(
    challengeInstanceId: challengeInstanceId,
    definitionId: 'trivia.symbol_cipher_word.dev',
    definitionVersion: 1,
    engineId: 'trivia.symbol_cipher_word',
    promptKey: 'challenge.symbol_cipher.intro',
    serverNowMs: nowMs,
    startsAtMs: nowMs,
    deadlineAtMs: deadlineAtMs ?? nowMs + 7_000,
    durationMs: 12_000,
    roundPhase: RoundPhase.answer,
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.trivia',
      'promptKey': 'challenge.symbol_cipher.prompt',
      'titleText': 'فكّ الشفرة',
      'instructionText': 'استخدم المفتاح لاكتشاف الكلمة',
      'questionId': 'symbol_cipher.q.miftah',
      'keyMappings': <Map<String, String>>[
        <String, String>{'symbolId': 'hexagon', 'letter': 'م'},
        <String, String>{'symbolId': 'circle', 'letter': 'ف'},
        <String, String>{'symbolId': 'triangle', 'letter': 'ت'},
        <String, String>{'symbolId': 'diamond', 'letter': 'ا'},
        <String, String>{'symbolId': 'square', 'letter': 'ح'},
      ],
      'encodedSymbols': <String>[
        'hexagon',
        'circle',
        'triangle',
        'diamond',
        'square',
      ],
      'optionKeys': <String>[
        'symbol_cipher.opt.miftah',
        'symbol_cipher.opt.misbah',
        'symbol_cipher.opt.tuffaha',
        'symbol_cipher.opt.minshar',
      ],
      'optionTexts': <String, String>{
        'symbol_cipher.opt.miftah': 'مفتاح',
        'symbol_cipher.opt.misbah': 'مصباح',
        'symbol_cipher.opt.tuffaha': 'تفاحة',
        'symbol_cipher.opt.minshar': 'منشار',
      },
      'backgroundAssetId': 'symbol_cipher_word.background',
    },
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('cipher symbols', () {
    test('logical index 0 maps to rightmost visual LTR slot', () {
      expect(logicalIndexToVisualLtrIndex(0, 5), 4);
      expect(logicalIndexToVisualLtrIndex(4, 5), 0);
      final List<String> logical = <String>[
        'hexagon',
        'circle',
        'triangle',
        'diamond',
        'square',
      ];
      expect(cipherLogicalOrderForRtlRow(logical), logical);
      expect(logical[0], 'hexagon');
      expect(logical[4], 'square');
    });

    test('parses all registry ids and builds paths', () {
      for (final CipherSymbolId id in CipherSymbolId.values) {
        expect(CipherSymbolId.tryParse(id.wireId), id);
        expect(cipherSymbolPath(id, const Size(40, 40)), isA<Path>());
      }
    });
  });

  group('SymbolCipherWordEngine', () {
    test('registry resolves engine', () {
      final ChallengeEngineRegistry registry = ChallengeEngineRegistry();
      expect(
        registry.resolve('trivia.symbol_cipher_word'),
        isA<SymbolCipherWordEngine>(),
      );
    });

    testWidgets('renders title, instruction, letters, and options', (
      WidgetTester tester,
    ) async {
      String? submitted;
      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return SymbolCipherWordEngine().build(
                context,
                ChallengeContext(
                  challenge: makeCipherChallenge(),
                  onSubmit: (Map<String, dynamic> answer) {
                    submitted = answer['chosenOptionKey'] as String?;
                  },
                  estimateServerNowMs: () => 1_000_000,
                  answerStatus: AnswerSubmissionStatus.idle,
                  inputEnabled: true,
                ),
              );
            },
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1300));

      expect(find.text('فكّ الشفرة'), findsOneWidget);
      expect(find.text('استخدم المفتاح لاكتشاف الكلمة'), findsOneWidget);
      expect(find.text('مفتاح'), findsOneWidget);
      expect(find.text('مصباح'), findsOneWidget);
      expect(find.text('تفاحة'), findsOneWidget);
      expect(find.text('منشار'), findsOneWidget);
      expect(find.text('الوقت المتبقي'), findsOneWidget);
      expect(find.text('00:07'), findsOneWidget);

      await tester.tap(find.text('مفتاح'));
      await tester.pump();
      expect(submitted, 'symbol_cipher.opt.miftah');

      final SemanticsNode selected = tester.getSemantics(find.text('مفتاح'));
      expect(selected.hasFlag(SemanticsFlag.isSelected), isTrue);
      expect(selected.value, anyOf('pending', 'selected'));
    });

    testWidgets('highlights the chosen option after submit', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        wrapWithL10n(
          Builder(
            builder: (BuildContext context) {
              return SymbolCipherWordEngine().build(
                context,
                ChallengeContext(
                  challenge: makeCipherChallenge(
                    challengeInstanceId: 'sc-highlight',
                  ),
                  onSubmit: (_) {},
                  estimateServerNowMs: () => 1_000_000,
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

      await tester.tap(find.text('مصباح'));
      await tester.pump();

      final SemanticsNode selected = tester.getSemantics(find.text('مصباح'));
      expect(selected.hasFlag(SemanticsFlag.isSelected), isTrue);
      expect(selected.value, anyOf('pending', 'selected'));

      final SemanticsNode other = tester.getSemantics(find.text('مفتاح'));
      expect(other.hasFlag(SemanticsFlag.isSelected), isFalse);
    });

    testWidgets('layouts do not overflow', (WidgetTester tester) async {
      Future<void> pumpSize(Size size) async {
        await tester.pumpWidget(
          wrapWithL10n(
            Builder(
              builder: (BuildContext context) {
                return SymbolCipherWordEngine().build(
                  context,
                  ChallengeContext(
                    challenge: makeCipherChallenge(
                      challengeInstanceId: 'sc-${size.width}',
                    ),
                    onSubmit: (_) {},
                    estimateServerNowMs: () => 1_000_000,
                    answerStatus: AnswerSubmissionStatus.idle,
                    inputEnabled: true,
                  ),
                );
              },
            ),
            surfaceSize: size,
            disableAnimations: true,
          ),
        );
        await tester.pump();
        expect(tester.takeException(), isNull);
      }

      await pumpSize(const Size(320, 640));
      await pumpSize(const Size(390, 844));
      await pumpSize(const Size(430, 932));
      await pumpSize(const Size(884, 1100));
    });
  });
}
