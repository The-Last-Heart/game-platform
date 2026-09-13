import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

class AudioCueEngine implements ChallengeEngine {
  @override
  String get engineId => 'audio.cue';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _AudioCueWidget(challengeContext: challengeContext);
  }
}

class _AudioCueWidget extends StatefulWidget {
  const _AudioCueWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_AudioCueWidget> createState() => _AudioCueWidgetState();
}

class _AudioCueWidgetState extends State<_AudioCueWidget> {
  int _played = 0;
  bool _pulseOn = false;
  bool _listening = false;
  bool _submitted = false;
  Timer? _pulseTimer;

  int get _pulseCount {
    final num? v =
        widget.challengeContext.challenge.clientConfig['pulseCount'] as num?;
    return v?.toInt() ?? 3;
  }

  @override
  void initState() {
    super.initState();
    _startPulses();
  }

  @override
  void dispose() {
    _pulseTimer?.cancel();
    super.dispose();
  }

  void _startPulses() {
    _pulseTimer = Timer.periodic(const Duration(milliseconds: 700), (Timer t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_played >= _pulseCount) {
        t.cancel();
        setState(() {
          _pulseOn = false;
          _listening = true;
        });
        return;
      }
      _played += 1;
      HapticFeedback.mediumImpact();
      setState(() => _pulseOn = true);
      Future<void>.delayed(const Duration(milliseconds: 220), () {
        if (mounted) setState(() => _pulseOn = false);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (widget.challengeContext.challenge.clientConfig['promptKey']
            as String?) ??
        widget.challengeContext.challenge.promptKey;
    final String visualKey =
        (widget.challengeContext.challenge.clientConfig['visualFallbackKey']
            as String?) ??
        'challenge.audio.visual_fallback';
    final String hapticKey =
        (widget.challengeContext.challenge.clientConfig['hapticFallbackKey']
            as String?) ??
        'challenge.audio.haptic_fallback';

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            resolver.resolve(promptKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Text(
            resolver.resolve(visualKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: LhColors.textMuted,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            resolver.resolve(hapticKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: LhColors.textMuted,
            ),
          ),
          const SizedBox(height: 28),
          AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: _pulseOn ? 96 : 72,
            height: _pulseOn ? 96 : 72,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _pulseOn
                  ? LhColors.success
                  : LhColors.border.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 28),
          if (_listening)
            Wrap(
              spacing: 8,
              children: <Widget>[
                for (int n = 1; n <= 5; n++)
                  ElevatedButton(
                    onPressed:
                        widget.challengeContext.isInteractionLocked || _submitted
                        ? null
                        : () {
                            setState(() => _submitted = true);
                            widget.challengeContext.onSubmit(<String, dynamic>{
                              'reportedPulseCount': n,
                            });
                          },
                    child: Text('$n'),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}
