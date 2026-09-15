import 'package:flutter/material.dart';

import '../engines/challenge_engine.dart';
import '../engines/challenge_engine_registry.dart';
import '../protocol/realtime_messages.dart';
import '../session/match_session_controller.dart';
import '../state/match_snapshot.dart';
import 'challenge_intro_view.dart';
import 'challenge_play_view.dart';
import 'draw_view.dart';
import 'halted_view.dart';
import 'lobby_view.dart';
import 'power_action_view.dart';
import 'power_defense_view.dart';
import 'ready_countdown_view.dart';
import 'round_result_view.dart';
import 'spectator_view.dart';
import 'widgets/lh_background.dart';
import 'winner_view.dart';

/// Top-level match container that switches on [MatchPhase].
class MatchShell extends StatefulWidget {
  const MatchShell({
    required this.controller,
    required this.onBackHome,
    this.onRematch,
    this.registry,
    super.key,
  });

  final MatchSessionController controller;
  final VoidCallback onBackHome;
  final VoidCallback? onRematch;
  final ChallengeEngineRegistry? registry;

  @override
  State<MatchShell> createState() => _MatchShellState();
}

class _MatchShellState extends State<MatchShell> {
  late final ChallengeEngineRegistry _registry;

  @override
  void initState() {
    super.initState();
    _registry = widget.registry ?? ChallengeEngineRegistry();
  }

  @override
  Widget build(BuildContext context) {
    return LhBackground(
      child: SafeArea(
        child: ValueListenableBuilder<MatchViewState>(
          valueListenable: widget.controller.state,
          builder: (BuildContext context, MatchViewState state, Widget? child) {
            return _buildPhase(context, state);
          },
        ),
      ),
    );
  }

  Widget _buildPhase(BuildContext context, MatchViewState state) {
    // Spectators watch remaining challenges; do not steal round_result so a
    // last-heart miss can still show the fail screen for the hold window.
    // Power phases stay on tactical views so the whole room sees strike events.
    if (state.isSpectator &&
        (state.phase == MatchPhase.challengeIntro ||
            state.phase == MatchPhase.challengeActive)) {
      return SpectatorView(state: state);
    }

    switch (state.phase) {
      case MatchPhase.lobby:
        return LobbyView(
          state: state,
          onReady: () {
            widget.controller.setReady();
          },
          onLeave: widget.onBackHome,
          onExtendLobbyFill: () {
            widget.controller.extendLobbyFill();
          },
          onStartLobby: () {
            widget.controller.startLobbyNow();
          },
          estimateServerNowMs:
              widget.controller.serverClock.estimateServerNowMs,
        );
      case MatchPhase.readyCountdown:
        return ReadyCountdownView(
          state: state,
          estimateServerNowMs:
              widget.controller.serverClock.estimateServerNowMs,
        );
      case MatchPhase.challengeIntro:
        if (state.currentChallenge == null) {
          return const Center(child: CircularProgressIndicator());
        }
        return ChallengeIntroView(
          state: state,
          estimateServerNowMs:
              widget.controller.serverClock.estimateServerNowMs,
        );
      case MatchPhase.challengeActive:
        if (state.currentChallenge != null) {
          final ChallengeEngine engine = _registry.resolve(
            state.currentChallenge!.engineId,
          );
          return ChallengePlayView(
            state: state,
            engine: engine,
            estimateServerNowMs:
                widget.controller.serverClock.estimateServerNowMs,
            onSubmit: (Map<String, dynamic> answer) {
              widget.controller.submitAnswer(
                state.currentChallenge!.challengeInstanceId,
                answer,
              );
            },
          );
        }
        // Never fall back to lobby mid-match — waiting for round_result /
        // snapshot after resolve can briefly clear currentChallenge.
        if (state.lastRoundResult != null) {
          return RoundResultView(
            state: state,
            estimateServerNowMs:
                widget.controller.serverClock.estimateServerNowMs,
            onBackHome: widget.onBackHome,
            onRetry: state.mode == MatchMode.training
                ? () {
                    widget.controller.retryTraining();
                  }
                : null,
          );
        }
        return const Center(child: CircularProgressIndicator());
      case MatchPhase.roundResult:
        return RoundResultView(
          state: state,
          estimateServerNowMs:
              widget.controller.serverClock.estimateServerNowMs,
          onBackHome: widget.onBackHome,
          onRetry: state.mode == MatchMode.training
              ? () {
                  // Always training.retry — do not route through rematch
                  // (rematch rejects round_result and leaves the fail screen).
                  widget.controller.retryTraining();
                }
              : null,
        );
      case MatchPhase.powerAction:
        return PowerActionView(
          state: state,
          estimateServerNowMs:
              widget.controller.serverClock.estimateServerNowMs,
          onUseDangerPulse: (String targetPlayerId) {
            widget.controller.useDangerPulse(targetPlayerId);
          },
          onSkip: () {
            widget.controller.skipPowerAction();
          },
        );
      case MatchPhase.powerDefense:
        return PowerDefenseView(
          state: state,
          estimateServerNowMs:
              widget.controller.serverClock.estimateServerNowMs,
          onDefend: (PowerDefenseChoice choice) {
            widget.controller.defendPower(choice);
          },
        );
      case MatchPhase.completed:
        return WinnerView(
          state: state,
          onBackHome: widget.onBackHome,
          onRematch: widget.onRematch,
        );
      case MatchPhase.draw:
        return DrawView(
          state: state,
          onBackHome: widget.onBackHome,
          onRematch: widget.onRematch,
        );
      case MatchPhase.halted:
        return HaltedView(
          state: state,
          onBackHome: widget.onBackHome,
          onRematch: widget.onRematch,
        );
    }
  }
}
