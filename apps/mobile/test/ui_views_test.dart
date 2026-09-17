import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/reaction_wait_for_signal_engine.dart';
import 'package:game/features/match/protocol/realtime_messages.dart';
import 'package:game/features/match/state/match_snapshot.dart';
import 'package:game/features/match/ui/challenge_play_view.dart';
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
        mode: MatchMode.privateRoom,
        roomCode: 'AB12CD',
        hostPlayerId: 'p1',
        players: <PlayerPublic>[
          PlayerPublic(
            playerId: 'p1',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'Host',
            ready: false,
            isHost: true,
          ),
          PlayerPublic(
            playerId: 'p2',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'Guest',
            ready: true,
          ),
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(
          LobbyView(
            state: state,
            onReady: () {},
            onLeave: () {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Lobby shows the private room title and room code.
      expect(
        find.text(resolver.resolve(TranslationKeys.lobbyPrivateRoom)),
        findsOneWidget,
      );
      expect(find.text('AB12CD'), findsOneWidget);
      expect(find.text('Host'), findsOneWidget);
    });

    testWidgets('training lobby hides player roster', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        matchId: 'train-1',
        mode: MatchMode.training,
        players: <PlayerPublic>[
          PlayerPublic(
            playerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'وجدي',
            ready: true,
            isHost: true,
          ),
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(
          LobbyView(state: state, onReady: () {}, onLeave: () {}),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.trainingTitle)),
        findsOneWidget,
      );
      expect(find.text('وجدي'), findsNothing);
      expect(find.text('aaaaaaaa'), findsNothing);
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
      expect(find.text('تابع التحدي'), findsNothing);
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
        players: <PlayerPublic>[
          PlayerPublic(
            playerId: 'p1',
            hearts: 2,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'وجدي',
          ),
          PlayerPublic(
            playerId: 'p2',
            hearts: 0,
            energy: 0,
            status: PlayerStatus.spectator,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'خصم',
          ),
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(WinnerView(state: state, onBackHome: () {})),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(
          resolver.resolve(
            TranslationKeys.winnerOther,
            params: const <String, String>{'name': 'وجدي'},
          ),
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          resolver.resolve(
            TranslationKeys.winnerPlayerWins,
            params: const <String, String>{'name': 'وجدي'},
          ),
        ),
        findsOneWidget,
      );
      expect(find.textContaining('p1'), findsNothing);
      expect(find.textContaining('٨٥٠'), findsNothing);
      expect(find.textContaining('850'), findsNothing);
    });

    testWidgets('shows standings with names hearts and claimed points', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p1',
        winnerId: 'p1',
        phase: MatchPhase.completed,
        players: <PlayerPublic>[
          PlayerPublic(
            playerId: 'p2',
            hearts: 1,
            energy: 4,
            claimedPoints: 15,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'سارة',
          ),
          PlayerPublic(
            playerId: 'p1',
            hearts: 2,
            energy: 1,
            claimedPoints: 30,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'أحمد',
          ),
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(WinnerView(state: state, onBackHome: () {})),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.winnerStandings)),
        findsOneWidget,
      );
      expect(find.text('أحمد'), findsWidgets);
      expect(find.text('سارة'), findsOneWidget);
      expect(
        find.textContaining(
          resolver.resolve(TranslationKeys.winnerEnergyScore),
        ),
        findsWidgets,
      );
      expect(find.textContaining('30'), findsOneWidget);
      expect(find.textContaining('15'), findsOneWidget);
    });

    testWidgets('shows left badge for departed players in standings', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p1',
        winnerId: 'p1',
        phase: MatchPhase.completed,
        players: <PlayerPublic>[
          PlayerPublic(
            playerId: 'p1',
            hearts: 2,
            energy: 1,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
            displayName: 'أحمد',
          ),
          PlayerPublic(
            playerId: 'p2',
            hearts: 2,
            energy: 0,
            status: PlayerStatus.left,
            presence: Presence.disconnected,
            submittedForCurrentChallenge: false,
            displayName: 'ليان',
          ),
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(WinnerView(state: state, onBackHome: () {})),
      );
      await tester.pumpAndSettle();

      expect(find.text('ليان'), findsOneWidget);
      expect(
        find.text(resolver.resolve(TranslationKeys.playerStatusLeft)),
        findsOneWidget,
      );
    });

    testWidgets('does not show truncated playerId as winner name', (
      WidgetTester tester,
    ) async {
      const MatchViewState state = MatchViewState(
        playerId: 'p2',
        winnerId: '1a5b6c4d-dead-beef-cafe-000000000001',
        phase: MatchPhase.completed,
        players: <PlayerPublic>[
          PlayerPublic(
            playerId: '1a5b6c4d-dead-beef-cafe-000000000001',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: false,
          ),
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(WinnerView(state: state, onBackHome: () {})),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('1a5b6c4d'), findsNothing);
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
      expect(find.textContaining('فاز'), findsNothing);
      expect(
        find.text(resolver.resolve(TranslationKeys.winnerFirstPlace)),
        findsNothing,
      );
      expect(find.byIcon(Icons.emoji_events), findsNothing);

      expect(
        find.text(resolver.resolve(TranslationKeys.winnerPlayAgain)),
        findsOneWidget,
      );

      await tester.ensureVisible(
        find.text(resolver.resolve(TranslationKeys.winnerPlayAgain)),
      );
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

    testWidgets('training mode shows retry, fresh start, and back home', (
      WidgetTester tester,
    ) async {
      var retryPressed = false;
      var freshPressed = false;
      var homePressed = false;
      const MatchViewState state = MatchViewState(
        playerId: 'p1',
        mode: MatchMode.training,
        phase: MatchPhase.roundResult,
        lastRoundResult: LastRoundResult(
          challengeInstanceId: 'ch-1',
          resolutions: <PlayerChallengeResolution>[
            PlayerChallengeResolution(
              playerId: 'p1',
              outcome: 'timeout',
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
          RoundResultView(
            state: state,
            estimateServerNowMs: () => 1_000_000,
            onRetry: () => retryPressed = true,
            onFreshStart: () => freshPressed = true,
            onBackHome: () => homePressed = true,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(resolver.resolve(TranslationKeys.resultAutoContinue)),
        findsNothing,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.trainingRetry)),
        findsOneWidget,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.trainingRestart)),
        findsOneWidget,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.winnerBackHome)),
        findsOneWidget,
      );

      await tester.ensureVisible(
        find.text(resolver.resolve(TranslationKeys.trainingRetry)),
      );
      await tester.tap(find.text(resolver.resolve(TranslationKeys.trainingRetry)));
      await tester.pump();
      expect(retryPressed, isTrue);

      await tester.ensureVisible(
        find.text(resolver.resolve(TranslationKeys.trainingRestart)),
      );
      await tester.tap(
        find.text(resolver.resolve(TranslationKeys.trainingRestart)),
      );
      await tester.pump();
      expect(freshPressed, isTrue);

      await tester.ensureVisible(
        find.text(resolver.resolve(TranslationKeys.winnerBackHome)),
      );
      await tester.tap(
        find.text(resolver.resolve(TranslationKeys.winnerBackHome)),
      );
      await tester.pump();
      expect(homePressed, isTrue);
    });
  });

  group('ChallengePlayView', () {
    PublicChallenge challenge() => const PublicChallenge(
      challengeInstanceId: 'ch-1',
      engineId: 'reaction.wait_for_signal',
      definitionId: 'reaction.wait_for_signal.v1',
      definitionVersion: 1,
      promptKey: 'challenge.wait_for_signal.intro',
      startsAtMs: 1_000_000,
      deadlineAtMs: 1_005_000,
      durationMs: 5000,
      roundPhase: RoundPhase.waitingSignal,
      clientConfig: <String, dynamic>{
        'waitingPromptKey': 'challenge.wait_for_signal.waiting',
        'waitingHintKey': 'challenge.wait_for_signal.waiting_hint',
        'activePromptKey': 'challenge.wait_for_signal.active',
        'actionKey': 'challenge.wait_for_signal.action',
        'categoryKey': 'challenge.category.reaction',
      },
      serverNowMs: 1_000_000,
    );

    testWidgets('early submit shows تسرعت not recovering', (
      WidgetTester tester,
    ) async {
      final MatchViewState state = MatchViewState(
        playerId: 'p1',
        phase: MatchPhase.challengeActive,
        lifecycle: SessionLifecycle.bound,
        isConnected: true,
        answerStatus: AnswerSubmissionStatus.confirmed,
        answerSubmittedEarly: true,
        currentChallenge: challenge(),
        players: const <PlayerPublic>[
          PlayerPublic(
            playerId: 'p1',
            hearts: 2,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: true,
          ),
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(
          ChallengePlayView(
            state: state,
            engine: ReactionWaitForSignalEngine(),
            estimateServerNowMs: () => 1_000_000,
            onSubmit: (_) {},
          ),
        ),
      );
      await tester.pump();

      expect(
        find.text(resolver.resolve(TranslationKeys.resultTooEarlyTitle)),
        findsOneWidget,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.sessionRecoveringState)),
        findsNothing,
      );
    });

    testWidgets('successful submit wait does not show recovering', (
      WidgetTester tester,
    ) async {
      final MatchViewState state = MatchViewState(
        playerId: 'p1',
        phase: MatchPhase.challengeActive,
        lifecycle: SessionLifecycle.bound,
        isConnected: true,
        answerStatus: AnswerSubmissionStatus.confirmed,
        answerSubmittedEarly: false,
        currentChallenge: challenge(),
        players: const <PlayerPublic>[
          PlayerPublic(
            playerId: 'p1',
            hearts: 3,
            energy: 0,
            status: PlayerStatus.active,
            presence: Presence.connected,
            submittedForCurrentChallenge: true,
          ),
        ],
      );

      await tester.pumpWidget(
        wrapWithL10n(
          ChallengePlayView(
            state: state,
            engine: ReactionWaitForSignalEngine(),
            estimateServerNowMs: () => 1_000_000,
            onSubmit: (_) {},
          ),
        ),
      );
      await tester.pump();

      expect(
        find.text(resolver.resolve(TranslationKeys.challengeAnswerWaiting)),
        findsOneWidget,
      );
      expect(
        find.text(resolver.resolve(TranslationKeys.sessionRecoveringState)),
        findsNothing,
      );
    });
  });

  group('RTL', () {
    testWidgets('app renders in RTL direction', (WidgetTester tester) async {
      const MatchViewState state = MatchViewState(
        matchId: 'match-1',
        players: <PlayerPublic>[],
      );
      await tester.pumpWidget(wrapWithL10n(LobbyView(state: state)));
      await tester.pumpAndSettle();

      final BuildContext context = tester.element(find.byType(LobbyView));
      expect(Directionality.of(context), TextDirection.rtl);
    });
  });
}
