import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../engines/challenge_engine.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/energy_display.dart';
import 'widgets/hearts_display.dart';

/// Active challenge view: header chrome over a full-bleed engine surface.
///
/// The engine fills the play area so full-screen tap engines (e.g. wait-for-
/// signal) receive taps anywhere, including under the non-interactive header.
class ChallengePlayView extends StatefulWidget {
  const ChallengePlayView({
    required this.state,
    required this.engine,
    required this.onSubmit,
    required this.estimateServerNowMs,
    super.key,
  });

  final MatchViewState state;
  final ChallengeEngine engine;
  final void Function(Map<String, dynamic> answer) onSubmit;
  final int Function() estimateServerNowMs;

  @override
  State<ChallengePlayView> createState() => _ChallengePlayViewState();
}

class _ChallengePlayViewState extends State<ChallengePlayView> {
  String? _localOutcome(PublicChallenge challenge) {
    final LastRoundResult? result = widget.state.lastRoundResult;
    if (result == null ||
        result.challengeInstanceId != challenge.challengeInstanceId) {
      return null;
    }
    final String? playerId = widget.state.playerId;
    for (final PlayerChallengeResolution resolution in result.resolutions) {
      if (resolution.playerId == playerId) {
        return resolution.outcome;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final PlayerPublic? local = widget.state.localPlayer;
    final int round = widget.state.roundNumber;
    final PublicChallenge? challenge = widget.state.currentChallenge;

    final bool recovering = widget.state.needsSnapshot;
    final bool reconnecting =
        widget.state.lifecycle == SessionLifecycle.resuming ||
        widget.state.lifecycle == SessionLifecycle.connecting ||
        !widget.state.isConnected;
    final bool showRecoveryOverlay = recovering || reconnecting;

    // Only block the play surface while the ACK is in flight. After confirm,
    // keep the engine visible so multiplayer wait-for-others does not feel like
    // submit lag / "المحتوى غير متاح" freezes.
    final bool answerPending =
        widget.state.answerStatus == AnswerSubmissionStatus.pending;
    final bool answerConfirmed =
        widget.state.answerStatus == AnswerSubmissionStatus.confirmed;
    final bool showEarlyFailPanel =
        (answerPending || answerConfirmed) &&
        widget.state.answerSubmittedEarly;
    final bool showWaitingPanel =
        answerPending && !widget.state.answerSubmittedEarly;
    final bool showSubmittedChip =
        answerConfirmed && !widget.state.answerSubmittedEarly;

    final bool inputEnabled =
        !widget.state.blocksGameplayInput &&
        widget.state.lifecycle == SessionLifecycle.bound &&
        widget.state.isConnected &&
        !widget.state.isSpectator;

    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        // Full-bleed engine — taps anywhere on the play surface reach it.
        if (challenge != null)
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: widget.engine.build(
                context,
                ChallengeContext(
                  challenge: challenge,
                  onSubmit: widget.onSubmit,
                  estimateServerNowMs: widget.estimateServerNowMs,
                  answerStatus: widget.state.answerStatus,
                  inputEnabled: inputEnabled,
                  localPlayerId: widget.state.playerId,
                  players: widget.state.players,
                  localOutcome: _localOutcome(challenge),
                ),
              ),
            ),
          ),
        // Header chrome — visual only; taps pass through to the engine.
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  HeartsDisplay(hearts: local?.hearts ?? 0),
                  const SizedBox(width: 12),
                  EnergyDisplay(energy: local?.energy ?? 0),
                  const Spacer(),
                  Text(
                    resolver.resolve(
                      TranslationKeys.introRound,
                      params: <String, String>{'round': '$round'},
                    ),
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                ],
              ),
            ),
          ),
        ),
        if (showEarlyFailPanel)
          Positioned.fill(
            child: ColoredBox(
              color: LhColors.bg.withValues(alpha: 0.82),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text(
                        resolver.resolve(TranslationKeys.resultTooEarlyTitle),
                        style: Theme.of(context).textTheme.displayLarge
                            ?.copyWith(color: LhColors.primary),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        resolver.resolve(
                          TranslationKeys.resultPressedEarlyReason,
                        ),
                        style: Theme.of(context).textTheme.titleMedium,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          )
        else if (showWaitingPanel)
          Positioned.fill(
            child: ColoredBox(
              color: LhColors.bg.withValues(alpha: 0.72),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    resolver.resolve(TranslationKeys.challengeAnswerWaiting),
                    style: Theme.of(context).textTheme.titleMedium,
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          )
        else if (showSubmittedChip)
          Positioned(
            left: 20,
            right: 20,
            bottom: 28,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: LhColors.elevated.withValues(alpha: 0.92),
                  borderRadius: LhRadii.mdAll,
                  border: Border.all(color: LhColors.border),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Text(
                    resolver.resolve(TranslationKeys.challengeAnswerWaiting),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ),
            ),
          )
        else if (showRecoveryOverlay)
          Positioned.fill(
            child: ColoredBox(
              color: LhColors.bg.withValues(alpha: 0.72),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    recovering
                        ? resolver.resolve(
                            TranslationKeys.sessionRecoveringState,
                          )
                        : resolver.resolve(
                            TranslationKeys.sessionReconnecting,
                          ),
                    style: Theme.of(context).textTheme.titleMedium,
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
