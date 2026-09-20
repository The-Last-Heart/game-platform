import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/countdown_ring.dart';
import 'widgets/hearts_display.dart';
import 'widgets/lh_heart_logo.dart';

/// Brief pre-challenge hold showing the upcoming prompt so players can read
/// before the active timer starts.
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
  int _introTotalSeconds = 3;

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
        if (remaining > _introTotalSeconds) {
          _introTotalSeconds = remaining;
        }
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
    final PublicChallenge? challenge = widget.state.currentChallenge;
    final _IntroCopy copy = _resolveIntroCopy(challenge, resolver);
    final int ringDenom = _introTotalSeconds <= 0 ? 1 : _introTotalSeconds;

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
          const LhHeartLogo(size: 96),
          const SizedBox(height: 20),
          if (copy.title.isNotEmpty) ...<Widget>[
            Text(
              copy.title,
              style: Theme.of(context).textTheme.headlineLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
          ],
          if (copy.subtitle != null) ...<Widget>[
            Text(
              copy.subtitle!,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: LhColors.textMuted,
                    height: 1.35,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
          ],
          if (copy.hint != null) ...<Widget>[
            Text(
              '${resolver.resolve(TranslationKeys.introHintLabel)}: ${copy.hint}',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: LhColors.warning,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
          ],
          Text(
            resolver.resolve(TranslationKeys.introGetReady),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: LhColors.textMuted,
                ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          CountdownRing(
            progress: _secondsRemaining / ringDenom,
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

class _IntroCopy {
  const _IntroCopy({
    required this.title,
    this.subtitle,
    this.hint,
  });

  final String title;
  final String? subtitle;
  final String? hint;
}

/// Mirrors in-challenge title/subtitle resolution: prefer Studio/engine
/// literal overlays, then translation keys from clientConfig / promptKey.
_IntroCopy _resolveIntroCopy(
  PublicChallenge? challenge,
  TranslationResolver resolver,
) {
  if (challenge == null) {
    return const _IntroCopy(title: '');
  }

  final Map<String, dynamic> cfg = challenge.clientConfig;
  final String titleKey =
      _asNonEmptyString(cfg['titleKey']) ?? challenge.promptKey;
  final String title = _resolvePinnedOrKey(
    resolver,
    titleKey,
    cfg['titleText'],
  );

  // Prefer the same prompt key engines show in-play; fall back to Studio
  // instructionAr (mirrored as instructionText) when no separate prompt exists.
  final String? promptKey = _asNonEmptyString(cfg['promptKey']);
  final String? instructionText = _asNonEmptyString(cfg['instructionText']);
  String? subtitle;
  if (promptKey != null && promptKey != titleKey) {
    subtitle = _resolvePinnedOrKey(resolver, promptKey, instructionText);
  } else if (instructionText != null) {
    subtitle = instructionText;
  } else if (challenge.promptKey != titleKey) {
    subtitle = resolver.resolve(challenge.promptKey);
  }

  // Avoid repeating the same line under the title.
  if (subtitle != null && subtitle.trim() == title.trim()) {
    subtitle = null;
  }

  final String? hint = _asNonEmptyString(cfg['hintText']);

  return _IntroCopy(title: title, subtitle: subtitle, hint: hint);
}

String _resolvePinnedOrKey(
  TranslationResolver resolver,
  String key,
  Object? pinned,
) {
  if (pinned is String && pinned.trim().isNotEmpty) {
    return pinned.trim();
  }
  if (key.isEmpty) {
    return '';
  }
  return resolver.resolve(key);
}

String? _asNonEmptyString(Object? value) {
  if (value is! String) {
    return null;
  }
  final String trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
