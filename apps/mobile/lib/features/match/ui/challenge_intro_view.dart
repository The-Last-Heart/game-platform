import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../state/match_snapshot.dart';
import 'widgets/countdown_ring.dart';
import 'widgets/hearts_display.dart';
import 'widgets/lh_heart_logo.dart';

/// Brief challenge intro screen showing round, category, and heart logo.
class ChallengeIntroView extends StatefulWidget {
  const ChallengeIntroView({
    required this.state,
    required this.estimateServerNowMs,
    super.key,
  });

  final MatchViewState state;
  final int Function() estimateServerNowMs;

  @override
  State<ChallengeIntroView> createState() => _ChallengeIntroViewState();
}

class _ChallengeIntroViewState extends State<ChallengeIntroView> {
  Timer? _timer;
  int _secondsRemaining = 3;

  @override
  void initState() {
    super.initState();
    _computeRemaining();
    _timer = Timer.periodic(const Duration(milliseconds: 500), (_) {
      _computeRemaining();
    });
  }

  void _computeRemaining() {
    final int? deadline = widget.state.phaseDeadlineAtMs;
    if (deadline != null) {
      final int nowMs = widget.estimateServerNowMs();
      final int remaining = nowMs > 0
          ? ((deadline - nowMs) / 1000).ceil().clamp(0, 10)
          : 0;
      setState(() {
        _secondsRemaining = remaining;
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final int round = widget.state.roundNumber;
    final int hearts = widget.state.localPlayer?.hearts ?? 3;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: <Widget>[
          const SizedBox(height: 8),
          // Header
          Row(
            children: <Widget>[
              const LhHeartLogo(size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      resolver.resolve(TranslationKeys.appTitle),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      resolver.resolve(
                        TranslationKeys.introRound,
                        params: <String, String>{'round': '$round'},
                      ),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.settings_outlined,
                color: LhColors.textMuted,
                size: 22,
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.notifications_outlined,
                color: LhColors.textMuted,
                size: 22,
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Hearts + challenge label row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              HeartsDisplay(hearts: hearts),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  Text(
                    resolver.resolve(
                      TranslationKeys.introChallengeLabel,
                      params: <String, String>{'number': '$round'},
                    ),
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  if (widget.state.currentChallenge != null)
                    Text(
                      _resolveCategory(resolver),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                ],
              ),
            ],
          ),

          const Spacer(flex: 2),

          // Challenge type label
          Text(
            resolver.resolve(TranslationKeys.introChallengeType),
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(color: LhColors.success),
          ),
          const SizedBox(height: 8),

          // Category name (cyan glow)
          Text(
            _resolveCategory(resolver),
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
              color: LhColors.success,
              shadows: <Shadow>[
                Shadow(
                  color: LhColors.success.withValues(alpha: 0.6),
                  blurRadius: 24,
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),

          // Large heart logo
          const LhHeartLogo(size: 120),
          const SizedBox(height: 32),

          // Small countdown ring
          CountdownRing(
            progress: _secondsRemaining / 3.0,
            label: _toArabicDigit(_secondsRemaining),
            size: 80,
            ringColor: LhColors.primary,
            glow: true,
          ),

          const Spacer(),

          // Footer instruction
          Text(
            resolver.resolve(TranslationKeys.introReadInstructions),
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  String _resolveCategory(TranslationResolver resolver) {
    final String? categoryKey =
        widget.state.currentChallenge?.clientConfig['categoryKey'] as String?;
    if (categoryKey != null && categoryKey.isNotEmpty) {
      return resolver.resolve(categoryKey);
    }
    return resolver.resolve(TranslationKeys.challengeCategoryReaction);
  }

  static String _toArabicDigit(int n) {
    const List<String> digits = <String>[
      '٠',
      '١',
      '٢',
      '٣',
      '٤',
      '٥',
      '٦',
      '٧',
      '٨',
      '٩',
    ];
    return n.toString().split('').map((String c) {
      final int? d = int.tryParse(c);
      return d != null && d < 10 ? digits[d] : c;
    }).join();
  }
}
