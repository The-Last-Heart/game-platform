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

/// Brief pre-challenge hold. Must not reveal challenge type/category —
/// the active challenge prompt is the surprise.
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
    _timer = Timer.periodic(const Duration(milliseconds: 100), (_) {
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
          Row(
            children: <Widget>[
              const LhHeartLogo(size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  resolver.resolve(TranslationKeys.appTitle),
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              HeartsDisplay(hearts: hearts),
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
          const Spacer(flex: 2),
          const LhHeartLogo(size: 120),
          const SizedBox(height: 24),
          Text(
            resolver.resolve(TranslationKeys.introGetReady),
            style: Theme.of(context).textTheme.headlineLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          CountdownRing(
            progress: _secondsRemaining / 3.0,
            label: _toArabicDigit(_secondsRemaining),
            size: 80,
            ringColor: LhColors.primary,
            glow: true,
          ),
          const Spacer(),
          Text(
            resolver.resolve(TranslationKeys.introReadInstructions),
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: LhColors.textMuted),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  static String _toArabicDigit(int n) {
    const String western = '0123456789';
    const String arabic = '٠١٢٣٤٥٦٧٨٩';
    return n
        .toString()
        .split('')
        .map((String c) {
          final int i = western.indexOf(c);
          return i >= 0 ? arabic[i] : c;
        })
        .join();
  }
}
