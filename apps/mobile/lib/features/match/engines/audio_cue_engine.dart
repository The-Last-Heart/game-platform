import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import '../ui/widgets/challenge_sfx.dart';
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

class _AudioCueWidgetState extends State<_AudioCueWidget>
    with SingleTickerProviderStateMixin {
  int _played = 0;
  bool _pulseOn = false;
  bool _listening = false;
  bool _submitted = false;
  Timer? _pulseTimer;
  late final AnimationController _breathe;

  int get _pulseCount {
    final num? v =
        widget.challengeContext.challenge.clientConfig['pulseCount'] as num?;
    return v?.toInt() ?? 3;
  }

  int get _pulseIntervalMs {
    final num? v =
        widget.challengeContext.challenge.clientConfig['pulseIntervalMs']
            as num?;
    return v?.toInt().clamp(250, 2000) ?? 700;
  }

  @override
  void initState() {
    super.initState();
    _breathe = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _startPulses();
  }

  @override
  void dispose() {
    _pulseTimer?.cancel();
    _breathe.dispose();
    super.dispose();
  }

  void _startPulses() {
    _pulseTimer = Timer.periodic(Duration(milliseconds: _pulseIntervalMs), (
      Timer t,
    ) {
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
      final String pulseAssetId =
          (widget.challengeContext.challenge.clientConfig['pulseSfxAssetId']
              as String?) ??
          ChallengeSfx.defaultPulseAssetId;
      unawaited(ChallengeSfx.instance.pulse(assetId: pulseAssetId));
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
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.success,
          ),
          const SizedBox(height: 20),
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
          AnimatedBuilder(
            animation: _breathe,
            builder: (BuildContext context, Widget? child) {
              final double breath = 1 + (_breathe.value * 0.06);
              final double scale = _pulseOn ? 1.35 * breath : breath;
              return Transform.scale(
                scale: scale,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 120),
                  width: 84,
                  height: 84,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _pulseOn
                        ? LhColors.success
                        : LhColors.border.withValues(alpha: 0.5),
                    boxShadow: _pulseOn
                        ? <BoxShadow>[
                            BoxShadow(
                              color: LhColors.success.withValues(alpha: 0.55),
                              blurRadius: 28,
                              spreadRadius: 4,
                            ),
                          ]
                        : null,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 28),
          if (_listening)
            Wrap(
              spacing: 8,
              children: <Widget>[
                for (int n = 1; n <= 5; n++)
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: LhColors.elevated,
                      foregroundColor: LhColors.text,
                    ),
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
