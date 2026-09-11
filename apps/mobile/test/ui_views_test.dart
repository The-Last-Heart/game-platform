import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_snapshot.dart';
import 'package:game/features/match/ui/halted_view.dart';
import 'package:game/features/match/ui/lobby_view.dart';
import 'package:game/features/match/ui/round_result_view.dart';
import 'package:game/features/match/ui/spectator_view.dart';
import 'package:game/features/match/ui/winner_view.dart';
import 'package:game/l10n/app_localization.dart';
import 'package:game/l10n/translation_catalog.dart';
import 'package:game/l10n/translation_resolver.dart';
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

void main() {
  final TranslationResolver resolver = TranslationResolver(isProduction: false);

  group('LobbyView', () {
    testWidgets('renders player count and room code section', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        matchId: 'match-abcdef12',
        players: <PlayerPublic>[
          PlayerPublic(
            playerId: 'p1',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
          ),
          PlayerPublic(
            playerId: 'p2',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
          ),
        ],
      );

      await tester.pumpWidget(wrapWithL10n(const LobbyView(state: state)));
      await tester.pumpAndSettle();

      // Lobby shows the private room title and room code label.
      expect(
        find.text(resolver.resolve(TranslationKeys.lobbyPrivateRoom)),
        findsOneWidget,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.lobbyRoomCode)),
        findsOneWidget,
      );
    });
  });

  group('SpectatorView', () {
    testWidgets('renders spectator message with live remaining count', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p1',
        roundNumber: 2,
        players: <PlayerPublic>[
          PlayerPublic(
            playerId: 'p1',
            hearts: 0,
            energy: 5,
            status: PlayerStatus.spectator,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
          ),
          PlayerPublic(
            playerId: 'p2',
            hearts: 2,
            energy: 10,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
          ),
          PlayerPublic(
            playerId: 'p3',
            hearts: 1,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
          ),
        ],
      );

      await tester.pumpWidget(wrapWithL10n(const SpectatorView(state: state)));
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.spectatorMatchOngoing)),
        findsOneWidget,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.spectatorLostLastHeart)),
        findsOneWidget,
      );
      // Remaining count comes from active players only — never invent a total like 12.
      expect(
        find.text(
          resolver.resolve(
            TranslationKeys.spectatorRemainingPlayers,
            params: const <String, String>{'count': '2'},
          ),
        ),
        findsOneWidget,
      );
      expect(find.textContaining('12'), findsNothing);
      expect(find.text('Watch Match'), findsNothing);
      expect(find.text('تابع المباراة'), findsNothing);
    });
  });

  group('WinnerView', () {
    testWidgets('shows you win when local player is winner', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p1',
        winnerId: 'p1',
        phase: MatchPhase.completed,
      );

      bool backPressed = false;
      await tester.pumpWidget(
        wrapWithL10n(
          WinnerView(state: state, onBackHome: () => backPressed = true),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.winnerYouLastHeart)),
        findsOneWidget,
      );

      // Tap play again.
      await tester.tap(
        find.text(resolver.resolve(TranslationKeys.winnerPlayAgain)),
      );
      expect(backPressed, isTrue);
    });

    testWidgets('shows other winner when local player lost', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p2',
        winnerId: 'p1',
        phase: MatchPhase.completed,
      );

      await tester.pumpWidget(
        wrapWithL10n(WinnerView(state: state, onBackHome: () {})),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.winnerOther)),
        findsOneWidget,
      );
      expect(
        find.text(
          resolver.resolve(
            TranslationKeys.winnerPlayerWins,
            params: const <String, String>{'name': 'p1'},
          ),
        ),
        findsOneWidget,
      );
      expect(find.textContaining('٨٥٠'), findsNothing);
      expect(find.textContaining('850'), findsNothing);
    });
  });

  group('HaltedView', () {
    testWidgets('shows neutral unavailable text without winner UI', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p1',
        phase: MatchPhase.halted,
        winnerId: null,
      );

      bool backPressed = false;
      await tester.pumpWidget(
        wrapWithL10n(
          HaltedView(state: state, onBackHome: () => backPressed = true),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.errorsContentUnavailable)),
        findsOneWidget,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.winnerYouLastHeart)),
        findsNothing,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.winnerOther)),
        findsNothing,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.winnerFirstPlace)),
        findsNothing,
      );
      expect(find.byIcon(Icons.emoji_events), findsNothing);

      await tester.tap(
        find.text(resolver.resolve(TranslationKeys.winnerPlayAgain)),
      );
      expect(backPressed, isTrue);
    });
  });

  group('RoundResultView', () {
    testWidgets('renders survived result for local player', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p1',
        phase: MatchPhase.roundResult,
        nextPhaseAtMs: 1_003_000,
        lastRoundResult: LastRoundResult(
          challengeInstanceId: 'ch-1',
          resolutions: <PlayerChallengeResolution>[
            PlayerChallengeResolution(
              playerId: 'p1',
              outcome: 'success',
              heartsDelta: 0,
              energyDelta: 10,
              heartsAfter: 3,
              energyAfter: 10,
              statusAfter: PlayerStatus.active,
            ),
          ],
        ),
      );

      await tester.pumpWidget(
        wrapWithL10n(
          RoundResultView(state: state, estimateServerNowMs: () => 1_000_000),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.resultSurvived)),
        findsOneWidget,
      );
      expect(
        find.text(
          resolver.resolve(
            TranslationKeys.resultNextChallengeIn,
            params: const <String, String>{'seconds': '3'},
          ),
        ),
        findsOneWidget,
      );
    });

    testWidgets('renders heart lost for failed local player', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p1',
        phase: MatchPhase.roundResult,
        lastRoundResult: LastRoundResult(
          challengeInstanceId: 'ch-1',
          resolutions: <PlayerChallengeResolution>[
            PlayerChallengeResolution(
              playerId: 'p1',
              outcome: 'failure',
              heartsDelta: -1,
              energyDelta: 0,
              heartsAfter: 2,
              energyAfter: 0,
              statusAfter: PlayerStatus.active,
            ),
          ],
        ),
      );

      await tester.pumpWidget(
        wrapWithL10n(
          RoundResultView(state: state, estimateServerNowMs: () => 1_000_000),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.resultLostHeartLabel)),
        findsOneWidget,
      );
    });
  });

  group('RTL', () {
    testWidgets('app renders in RTL direction', (WidgetTester tester) async {
      const MatchViewState state = MatchViewState(
        matchId: 'match-1',
        players: <PlayerPublic>[],
      );
      await tester.pumpWidget(wrapWithL10n(const LobbyView(state: state)));
      await tester.pumpAndSettle();

      final BuildContext context = tester.element(find.byType(LobbyView));
      expect(Directionality.of(context), TextDirection.rtl);
    });
  });
}
