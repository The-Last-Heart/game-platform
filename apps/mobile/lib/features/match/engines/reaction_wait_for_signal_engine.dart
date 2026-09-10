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
/// All prompt text comes from validated server-provided clientConfig keys.
/// Missing/invalid config renders the generic content-unavailable state.
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
    extends State<_ReactionWaitForSignalWidget> {
  Timer? _timer;
  double _progress = 1.0;
  String _timerLabel = '';

  PublicChallenge get challenge => widget.challengeContext.challenge;

  bool get _isSignalActive => challenge.roundPhase == RoundPhase.signalActive;

  @override
  void initState() {
    super.initState();
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
    super.dispose();
  }

  void _handleTap() {
    if (widget.challengeContext.isInteractionLocked) return;

    if (_isSignalActive && challenge.signalToken != null) {
      widget.challengeContext.onSubmit(<String, dynamic>{
        'signalToken': challenge.signalToken,
      });
    } else {
      widget.challengeContext.onSubmit(<String, dynamic>{});
    }
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

    return GestureDetector(
      onTap: locked ? null : _handleTap,
      behavior: HitTestBehavior.opaque,
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
          Semantics(
            label: promptText,
            button: true,
            enabled: !locked,
            child: LhHeartLogo(
              size: 120,
              color: locked ? LhColors.disabled : accentColor,
            ),
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
              color: _isSignalActive ? LhColors.success : LhColors.textMuted,
            ),
            textAlign: TextAlign.center,
            semanticsLabel: hintText,
          ),
          // Keep category available for tests/semantics without inventing copy.
          Opacity(
            opacity: 0,
            child: Text(
              resolver.resolve(categoryKey),
              semanticsLabel: resolver.resolve(categoryKey),
            ),
          ),
          const Spacer(),
          if (_isSignalActive && !locked)
            Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _handleTap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: LhColors.success,
                    foregroundColor: LhColors.bg,
                    shape: const RoundedRectangleBorder(
                      borderRadius: LhRadii.mdAll,
                    ),
                    elevation: 0,
                    shadowColor: LhColors.success.withValues(alpha: 0.4),
                  ),
                  child: Text(
                    resolver.resolve(actionKey),
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
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
    );
  }
}
