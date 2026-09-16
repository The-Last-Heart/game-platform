import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import '../ui/widgets/countdown_ring.dart';
import '../ui/widgets/lh_heart_logo.dart';
import 'challenge_engine.dart';

/// Engine for the "reaction.wait_for_signal" challenge.
///
/// The whole play surface is the input: any tap while the heart is red fails;
/// any tap after the heart turns blue (signal active) succeeds.
/// All prompt text comes from validated server-provided clientConfig keys.
class ReactionWaitForSignalEngine implements ChallengeEngine {
  @override
  String get engineId => 'reaction.wait_for_signal';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _ReactionWaitForSignalWidget(challengeContext: challengeContext);
  }
}

class _ReactionWaitForSignalWidget extends StatefulWidget {
  const _ReactionWaitForSignalWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_ReactionWaitForSignalWidget> createState() =>
      _ReactionWaitForSignalWidgetState();
}

class _ReactionWaitForSignalWidgetState
    extends State<_ReactionWaitForSignalWidget>
    with SingleTickerProviderStateMixin {
  Timer? _timer;
  double _progress = 1.0;
  String _timerLabel = '';
  bool _submitted = false;
  late final AnimationController _heartPulse;

  PublicChallenge get challenge => widget.challengeContext.challenge;

  /// Blue while the server says the window is open.
  ///
  /// Prefer roundPhase + token. Local endsAt is only a soft fallback after a
  /// grace window so a slightly skewed clock / late envelope still shows blue
  /// long enough to tap; challenge.signal_ended is the hard close.
  bool get _isSignalActive {
    if (challenge.roundPhase != RoundPhase.signalActive) {
      return false;
    }
    if (challenge.signalToken == null) {
      return false;
    }
    final int? endsAt = challenge.signalEndsAtMs;
    if (endsAt == null) {
      return true;
    }
    final int nowMs = widget.challengeContext.estimateServerNowMs();
    if (nowMs <= 0) {
      return true;
    }
    // 300ms grace covers typical LAN delivery skew without extending late taps
    // much past the server mono window (server still validates mono bounds).
    return nowMs < endsAt + 300;
  }

  @override
  void initState() {
    super.initState();
    _heartPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _computeProgress();
    _timer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      _computeProgress();
    });
  }

  void _computeProgress() {
    final int nowMs = widget.challengeContext.estimateServerNowMs();
    if (nowMs <= 0) {
      return;
    }
    final int elapsed = nowMs - challenge.startsAtMs;
    final double prog = 1.0 - (elapsed / challenge.durationMs);
    final double remaining = ((challenge.deadlineAtMs - nowMs) / 1000.0).clamp(
      0.0,
      99.0,
    );
    setState(() {
      _progress = prog.clamp(0.0, 1.0);
      _timerLabel = remaining.toStringAsFixed(1);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _heartPulse.dispose();
    super.dispose();
  }

  void _handleTap() {
    if (_submitted) return;
    if (widget.challengeContext.isInteractionLocked) return;

    _submitted = true;
    // Prefer token submit whenever the server opened the window for this seat,
    // even if the local endsAt soft-close already flipped the heart red.
    if (challenge.roundPhase == RoundPhase.signalActive &&
        challenge.signalToken != null) {
      widget.challengeContext.onSubmit(<String, dynamic>{
        'signalToken': challenge.signalToken,
      });
      return;
    }

    // Early tap (heart still red): intentional fail — empty answer, no token.
    widget.challengeContext.onSubmit(<String, dynamic>{});
  }

  /// Resolve a required non-empty clientConfig translation key.
  /// Returns null when missing/invalid so the widget can show unavailable.
  String? _requiredConfigKey(String field) {
    final Object? value = challenge.clientConfig[field];
    if (value is! String) return null;
    final String trimmed = value.trim();
    if (trimmed.isEmpty) return null;
    return trimmed;
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);

    final String? waitingPromptKey = _requiredConfigKey('waitingPromptKey');
    final String? waitingHintKey = _requiredConfigKey('waitingHintKey');
    final String? activePromptKey = _requiredConfigKey('activePromptKey');
    final String? actionKey = _requiredConfigKey('actionKey');
    final String? categoryKey = _requiredConfigKey('categoryKey');

    if (waitingPromptKey == null ||
        waitingHintKey == null ||
        activePromptKey == null ||
        actionKey == null ||
        categoryKey == null) {
      return Center(
        child: Text(
          resolver.resolve(TranslationKeys.errorsContentUnavailable),
          textAlign: TextAlign.center,
        ),
      );
    }

    final Color accentColor = _isSignalActive
        ? LhColors.success
        : LhColors.primary;

    final String promptText = resolver.resolve(
      _isSignalActive ? activePromptKey : waitingPromptKey,
    );
    final String hintText = resolver.resolve(
      _isSignalActive ? actionKey : waitingHintKey,
    );
    final bool locked = widget.challengeContext.isInteractionLocked;
    final bool showWaiting =
        widget.challengeContext.answerStatus ==
            AnswerSubmissionStatus.pending ||
        widget.challengeContext.answerStatus ==
            AnswerSubmissionStatus.confirmed;

    return Semantics(
      label: promptText,
      button: true,
      enabled: !locked && !_submitted,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        // onTapDown: reaction games need immediate recognition, not tap settle.
        onTapDown: (locked || _submitted) ? null : (_) => _handleTap(),
        child: SizedBox.expand(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              const Spacer(flex: 2),
              CountdownRing(
                progress: _progress,
                label: _timerLabel,
                size: 160,
                ringColor: accentColor,
                glow: _isSignalActive,
              ),
              const SizedBox(height: 32),
              AnimatedBuilder(
                animation: _heartPulse,
                builder: (BuildContext context, Widget? child) {
                  // Stronger pulse while the signal is active (blue window).
                  final double pulse = _isSignalActive
                      ? 0.35 + _heartPulse.value * 0.65
                      : 0.15 + _heartPulse.value * 0.35;
                  return LhHeartLogo(
                    size: 120,
                    color: locked ? LhColors.disabled : accentColor,
                    pulse: pulse,
                  );
                },
              ),
              const SizedBox(height: 28),
              Text(
                promptText,
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  color: _isSignalActive ? LhColors.success : LhColors.text,
                  shadows: _isSignalActive
                      ? <Shadow>[
                          Shadow(
                            color: LhColors.success.withValues(alpha: 0.5),
                            blurRadius: 16,
                          ),
                        ]
                      : null,
                ),
                textAlign: TextAlign.center,
                semanticsLabel: promptText,
              ),
              const SizedBox(height: 8),
              Text(
                hintText,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: _isSignalActive
                      ? LhColors.success
                      : LhColors.textMuted,
                ),
                textAlign: TextAlign.center,
                semanticsLabel: hintText,
              ),
              // Keep category for semantics/tests only — never reveal on-screen.
              Opacity(
                opacity: 0,
                child: Text(
                  resolver.resolve(categoryKey),
                  semanticsLabel: resolver.resolve(categoryKey),
                ),
              ),
              const Spacer(),
              if (showWaiting)
                Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: Text(
                    resolver.resolve(TranslationKeys.resultWaiting),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
