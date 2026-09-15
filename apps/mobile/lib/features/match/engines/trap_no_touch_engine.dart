import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

/// Trap: do not touch the glowing danger zone (bait).
class TrapNoTouchEngine implements ChallengeEngine {
  @override
  String get engineId => 'trap.no_touch';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _TrapNoTouchWidget(challengeContext: challengeContext);
  }
}

class _TrapNoTouchWidget extends StatefulWidget {
  const _TrapNoTouchWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_TrapNoTouchWidget> createState() => _TrapNoTouchWidgetState();
}

class _TrapNoTouchWidgetState extends State<_TrapNoTouchWidget>
    with SingleTickerProviderStateMixin {
  bool _submitted = false;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Rect _zoneRect(Size size) {
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final Object? raw = cfg['zone'];
    double x = 0.15;
    double y = 0.28;
    double w = 0.70;
    double h = 0.42;
    if (raw is Map) {
      x = (raw['x'] as num?)?.toDouble() ?? x;
      y = (raw['y'] as num?)?.toDouble() ?? y;
      w = (raw['width'] as num?)?.toDouble() ?? w;
      h = (raw['height'] as num?)?.toDouble() ?? h;
    }
    return Rect.fromLTWH(x * size.width, y * size.height, w * size.width, h * size.height);
  }

  void _failTouch() {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    _submitted = true;
    widget.challengeContext.onSubmit(<String, dynamic>{'touched': true});
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;
    final String baitKey =
        (cfg['baitActionKey'] as String?) ?? 'challenge.no_touch.bait';
    final String warnKey =
        (cfg['zoneHintKey'] as String?) ?? 'challenge.no_touch.zone_hint';

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final Size size = Size(constraints.maxWidth, constraints.maxHeight);
        final Rect zone = _zoneRect(size);
        return Stack(
          fit: StackFit.expand,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: <Widget>[
                  const SizedBox(height: 36),
                  ChallengeCountdown(
                    challenge: widget.challengeContext.challenge,
                    estimateServerNowMs:
                        widget.challengeContext.estimateServerNowMs,
                    ringColor: LhColors.primary,
                  ),
                  const SizedBox(height: 20),
                  Text(
                    resolver.resolve(promptKey),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 28),
                    child: Text(
                      resolver.resolve(warnKey),
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: LhColors.textMuted,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Animated danger zone — only touches inside fail.
            Positioned.fromRect(
              rect: zone,
              child: AnimatedBuilder(
                animation: _pulse,
                builder: (BuildContext context, Widget? child) {
                  final double t = _pulse.value;
                  final double scale = 1 + math.sin(t * math.pi) * 0.035;
                  return Transform.scale(
                    scale: scale,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTapDown: (_) => _failTouch(),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(28),
                          border: Border.all(
                            color: LhColors.primaryBright.withValues(
                              alpha: 0.55 + t * 0.35,
                            ),
                            width: 2.4 + t * 1.2,
                          ),
                          gradient: RadialGradient(
                            colors: <Color>[
                              LhColors.primaryBright.withValues(
                                alpha: 0.35 + t * 0.25,
                              ),
                              LhColors.primary.withValues(alpha: 0.18),
                              Colors.transparent,
                            ],
                          ),
                          boxShadow: <BoxShadow>[
                            BoxShadow(
                              color: LhColors.primary.withValues(
                                alpha: 0.35 + t * 0.35,
                              ),
                              blurRadius: 22 + t * 18,
                              spreadRadius: 1 + t * 3,
                            ),
                          ],
                        ),
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Text(
                              resolver.resolve(baitKey),
                              textAlign: TextAlign.center,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    shadows: <Shadow>[
                                      Shadow(
                                        color: LhColors.primary.withValues(
                                          alpha: 0.8,
                                        ),
                                        blurRadius: 12,
                                      ),
                                    ],
                                  ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}
