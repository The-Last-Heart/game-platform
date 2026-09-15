import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class GestureReverseSwipeEngine implements ChallengeEngine {
  @override
  String get engineId => 'gesture.reverse_swipe';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _ReverseSwipeWidget(challengeContext: challengeContext);
  }
}

class _ReverseSwipeWidget extends StatefulWidget {
  const _ReverseSwipeWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_ReverseSwipeWidget> createState() => _ReverseSwipeWidgetState();
}

class _ReverseSwipeWidgetState extends State<_ReverseSwipeWidget>
    with SingleTickerProviderStateMixin {
  static const double _trackWidth = 280;
  static const double _ballSize = 44;

  /// Ball center along the track, 0 = left edge, 1 = right edge. Rest = center.
  double _t = 0.5;
  double _dragOriginT = 0.5;
  DateTime? _startedAt;
  bool _submitted = false;
  bool _tooShortFlash = false;
  late final AnimationController _arrowBounce;

  /// Geometric displayed direction from definition (not RTL-mirrored).
  String get _displayed {
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    return (cfg['displayedDirection'] as String?) ?? 'right';
  }

  /// Pull opposite the displayed arrow on the horizontal track.
  String get _pullToward {
    return switch (_displayed) {
      'left' => 'right',
      'right' => 'left',
      'up' => 'down',
      'down' => 'up',
      _ => 'left',
    };
  }

  int get _minDistancePx {
    final num? v =
        widget.challengeContext.challenge.clientConfig['minDistancePx'] as num?;
    return v?.toInt() ?? 80;
  }

  IconData get _arrowIcon {
    return switch (_displayed) {
      'up' => Icons.arrow_upward,
      'down' => Icons.arrow_downward,
      'left' => Icons.arrow_back,
      _ => Icons.arrow_forward,
    };
  }

  @override
  void initState() {
    super.initState();
    _arrowBounce = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _arrowBounce.dispose();
    super.dispose();
  }

  void _finishDrag() {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    final DateTime started = _startedAt ?? DateTime.now();
    // Cap reported duration so a careful pull is not rejected as "invalid"
    // solely for thinking time (server max is definition-driven).
    final int rawMs = DateTime.now().difference(started).inMilliseconds;
    final int durationMs = rawMs.clamp(1, 8000);

    // Net displacement of this gesture (not absolute position from center),
    // so a pull starting slightly off-center still counts correctly.
    const double travel = _trackWidth - _ballSize;
    final double dx = (_t - _dragOriginT) * travel;
    if (dx.abs() < _minDistancePx) {
      setState(() {
        _t = 0.5;
        _tooShortFlash = true;
      });
      _startedAt = null;
      Future<void>.delayed(const Duration(milliseconds: 600), () {
        if (mounted) setState(() => _tooShortFlash = false);
      });
      return;
    }
    _submitted = true;
    widget.challengeContext.onSubmit(<String, dynamic>{
      'dx': dx,
      'dy': 0,
      'durationMs': durationMs,
    });
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;
    final bool locked =
        widget.challengeContext.isInteractionLocked || _submitted;
    const double travel = _trackWidth - _ballSize;
    final double ballLeft = _t * travel;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            size: 118,
            ringColor: LhColors.success,
          ),
          const SizedBox(height: 16),
          TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: 1),
            duration: const Duration(milliseconds: 280),
            builder: (BuildContext context, double t, Widget? child) {
              return Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, (1 - t) * 8),
                  child: child,
                ),
              );
            },
            child: Text(
              resolver.resolve(promptKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: 18),
          // Force LTR so Arabic RTL does not mirror arrow_forward/back —
          // screen geometry must match dx sign used by the evaluator.
          AnimatedBuilder(
            animation: _arrowBounce,
            builder: (BuildContext context, Widget? child) {
              final double nudge = (_arrowBounce.value - 0.5) * 10;
              final double dx = switch (_displayed) {
                'left' => -nudge,
                'right' => nudge,
                _ => 0,
              };
              return Transform.translate(offset: Offset(dx, 0), child: child);
            },
            child: Icon(
              _arrowIcon,
              size: 72,
              color: LhColors.primaryBright,
              textDirection: TextDirection.ltr,
            ),
          ),
          const SizedBox(height: 28),
          AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            width: _trackWidth,
            height: 56,
            decoration: BoxDecoration(
              color: LhColors.elevated,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: locked ? LhColors.success : LhColors.border,
                width: 1.5,
              ),
              boxShadow: locked
                  ? <BoxShadow>[
                      BoxShadow(
                        color: LhColors.success.withValues(alpha: 0.35),
                        blurRadius: 14,
                      ),
                    ]
                  : null,
            ),
            child: Stack(
              alignment: Alignment.center,
              children: <Widget>[
                Positioned(
                  left: 10,
                  child: Icon(
                    Icons.chevron_left,
                    color: _pullToward == 'left'
                        ? LhColors.success
                        : LhColors.border,
                    textDirection: TextDirection.ltr,
                  ),
                ),
                Positioned(
                  right: 10,
                  child: Icon(
                    Icons.chevron_right,
                    color: _pullToward == 'right'
                        ? LhColors.success
                        : LhColors.border,
                    textDirection: TextDirection.ltr,
                  ),
                ),
                Positioned(
                  left: ballLeft,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onHorizontalDragStart: locked
                        ? null
                        : (_) {
                            _dragOriginT = _t;
                            _startedAt = DateTime.now();
                            setState(() => _tooShortFlash = false);
                          },
                    onHorizontalDragUpdate: locked
                        ? null
                        : (DragUpdateDetails d) {
                            setState(() {
                              _t = (_t + d.delta.dx / travel).clamp(0.0, 1.0);
                            });
                          },
                    onHorizontalDragEnd: locked ? null : (_) => _finishDrag(),
                    onHorizontalDragCancel: locked
                        ? null
                        : () {
                            setState(() => _t = 0.5);
                            _startedAt = null;
                          },
                    child: Container(
                      width: _ballSize,
                      height: _ballSize,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.35),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Text(
            resolver.resolve(
              _tooShortFlash
                  ? 'challenge.reverse_swipe.too_short'
                  : 'challenge.reverse_swipe.hint',
            ),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: _tooShortFlash ? LhColors.warning : LhColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}
