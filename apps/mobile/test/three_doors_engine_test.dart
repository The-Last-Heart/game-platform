import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/challenge_engine.dart';
import 'package:game/features/match/engines/three_doors_asset_layout.dart';
import 'package:game/features/match/engines/three_doors_engine.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_snapshot.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/translation_resolver.dart';
import 'package:game/theme/lh_tokens.dart';

Widget wrapWithL10n(Widget child, {Size surfaceSize = const Size(400, 800)}) {
  return AppLocalization(
    resolver: TranslationResolver(isProduction: false),
    child: MediaQuery(
      data: MediaQueryData(size: surfaceSize),
      child: MaterialApp(
        theme: buildLhTheme(),
        locale: const Locale('ar'),
        supportedLocales: const <Locale>[Locale('ar'), Locale('en')],
        localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
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

PublicChallenge makeChallenge({int nowMs = 1_000_000}) {
  return PublicChallenge(
    challengeInstanceId: 'td-1',
    definitionId: 'logic.three_doors.dev',
    definitionVersion: 1,
    engineId: 'logic.three_doors',
    promptKey: 'challenge.three_doors.intro',
    clientConfig: <String, dynamic>{
      'categoryKey': 'challenge.category.logic',
      'promptKey': 'challenge.three_doors.prompt',
      'titleKey': 'challenge.three_doors.title',
      'titleText': 'باب الحقيقة',
      'instructionText': 'عبارة واحدة فقط صحيحة — أين المفتاح؟',
      'truthRule': 'exactly_one_true',
      'questionId': 'three_doors.q.reference_exactly_one_true',
      'doors': <Map<String, String>>[
        <String, String>{'id': 'A', 'statement': 'المفتاح ليس هنا'},
        <String, String>{'id': 'B', 'statement': 'المفتاح خلف الباب A'},
        <String, String>{'id': 'C', 'statement': 'المفتاح ليس خلف الباب B'},
      ],
      'roomAssetId': 'three_doors.room',
    },
    serverNowMs: nowMs,
    startsAtMs: nowMs,
    deadlineAtMs: nowMs + 12_000,
    durationMs: 12_000,
    roundPhase: RoundPhase.answer,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('renders dynamic overlays and submits selectedDoorId', (
    WidgetTester tester,
  ) async {
    final List<Map<String, dynamic>> submitted = <Map<String, dynamic>>[];
    final PublicChallenge challenge = makeChallenge();
    await tester.pumpWidget(
      wrapWithL10n(
        Builder(
          builder: (BuildContext context) {
            return ThreeDoorsLogicEngine().build(
              context,
              ChallengeContext(
                challenge: challenge,
                onSubmit: submitted.add,
                estimateServerNowMs: () => challenge.startsAtMs + 500,
                answerStatus: AnswerSubmissionStatus.idle,
                inputEnabled: true,
              ),
            );
          },
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1800));

    expect(find.text('باب الحقيقة'), findsOneWidget);
    expect(find.text('عبارة واحدة فقط صحيحة — أين المفتاح؟'), findsOneWidget);
    expect(find.text('المفتاح ليس هنا'), findsOneWidget);
    expect(find.text('المفتاح خلف الباب A'), findsOneWidget);
    expect(find.text('المفتاح ليس خلف الباب B'), findsOneWidget);
    expect(find.textContaining('is_not_here'), findsNothing);

    // Answer buttons are LTR A → B → C (reference order), not RTL-reversed.
    final Finder answerB = find.text('B');
    expect(answerB, findsWidgets);
    await tester.tap(answerB.last);
    await tester.pump();
    expect(submitted, isNotEmpty);
    expect(submitted.first['selectedDoorId'], 'B');
  });

  test('room asset path is registered and layout is uniform', () {
    expect(kThreeDoorsRoomAsset, contains('three_doors_room.jpg'));
    final Size canvas = const Size(288, 512);
    final Rect a = ThreeDoorsAssetLayout.mapRect(
      design: ThreeDoorsAssetLayout.doorAMedallion,
      displayedSize: canvas,
      displayedOrigin: Offset.zero,
    );
    final Rect c = ThreeDoorsAssetLayout.mapRect(
      design: ThreeDoorsAssetLayout.doorCMedallion,
      displayedSize: canvas,
      displayedOrigin: Offset.zero,
    );
    expect(a.width, closeTo(c.width, 0.01));
    expect(a.center.dx < c.center.dx, isTrue);
  });

  test('doorFocusFit fills width and keeps door plaques on-screen', () {
    const Size viewport = Size(320, 700);
    final ({Size size, Offset origin}) fit = ThreeDoorsAssetLayout.doorFocusFit(
      viewport: viewport,
      topGuard: 120,
      bottomGuard: 60,
      zoom: 1.14,
    );
    // Light zoom may overhang left/right; door plaques must stay inside.
    expect(fit.size.width, greaterThan(viewport.width));

    final Rect doorA = ThreeDoorsAssetLayout.mapRect(
      design: ThreeDoorsAssetLayout.doorAStatement,
      displayedSize: fit.size,
      displayedOrigin: fit.origin,
    );
    final Rect doorC = ThreeDoorsAssetLayout.mapRect(
      design: ThreeDoorsAssetLayout.doorCStatement,
      displayedSize: fit.size,
      displayedOrigin: fit.origin,
    );
    expect(doorA.left, greaterThanOrEqualTo(-0.5));
    expect(doorC.right, lessThanOrEqualTo(viewport.width + 0.5));
    expect(doorA.height, greaterThan(40));
  });
}
