import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

class MotionTiltBalanceEngine implements ChallengeEngine {
  @override
  String get engineId => 'motion.tilt_balance';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _MotionTiltWidget(challengeContext: challengeContext);
  }
}

class _MotionTiltWidget extends StatefulWidget {
  const _MotionTiltWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_MotionTiltWidget> createState() => _MotionTiltWidgetState();
}

class _MotionTiltWidgetState extends State<_MotionTiltWidget>
    with SingleTickerProviderStateMixin {
  StreamSubscription<AccelerometerEvent>? _sub;
  late final Ticker _ticker;

  /// Smoothed display position in [-1, 1].
  double _x = 0;
  double _y = 0;

  /// Filtered sensor target, relative to rest pose.
  double _sensorX = 0;
  double _sensorY = 0;

  double _restX = 0;
  double _restY = 0;
  int _restSamples = 0;
  bool _restReady = false;

  DateTime? _inTargetSince;
  bool _submitted = false;
  int _holdProgressMs = 0;

  static const int _restSampleTarget = 12;
  static const double _tiltScale = 2.6;

  double get _targetX {
    final num? v =
        widget.challengeContext.challenge.clientConfig['targetX'] as num?;
    return v?.toDouble() ?? 0;
  }

  double get _targetY {
    final num? v =
        widget.challengeContext.challenge.clientConfig['targetY'] as num?;
    return v?.toDouble() ?? 0;
  }

  double get _tolerance {
    final num? v =
        widget.challengeContext.challenge.clientConfig['varianceTolerance']
            as num?;
    return v?.toDouble() ?? 0.22;
  }

  int get _holdMs {
    final num? v =
        widget.challengeContext.challenge.clientConfig['holdMs'] as num?;
    return v?.toInt() ?? 1500;
  }

  String get _targetShape {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['targetShape'];
    if (raw is String && raw.isNotEmpty) return raw;
    return 'circle';
  }

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick)..start();
    _listenAccelerometer();
  }

  void _listenAccelerometer() {
    void onSample(double gx, double gy) {
      if (_submitted || widget.challengeContext.isInteractionLocked) return;
      final double rawX = (-gx / 9.8).clamp(-1.0, 1.0);
      final double rawY = (gy / 9.8).clamp(-1.0, 1.0);
      if (!_restReady) {
        _restSamples += 1;
        _restX += rawX;
        _restY += rawY;
        if (_restSamples >= _restSampleTarget) {
          _restX /= _restSamples;
          _restY /= _restSamples;
          _restReady = true;
        }
        return;
      }
      const double alpha = 0.18;
      final double tiltX = ((rawX - _restX) * _tiltScale).clamp(-1.0, 1.0);
      final double tiltY = ((rawY - _restY) * _tiltScale).clamp(-1.0, 1.0);
      _sensorX = _sensorX + (tiltX - _sensorX) * alpha;
      _sensorY = _sensorY + (tiltY - _sensorY) * alpha;
    }

    _sub = accelerometerEventStream(
      samplingPeriod: SensorInterval.gameInterval,
    ).listen((AccelerometerEvent e) => onSample(e.x, e.y));
  }

  void _onTick(Duration elapsed) {
    if (!mounted || _submitted) return;
    const double follow = 0.22;
    final double nextX = _x + (_sensorX - _x) * follow;
    final double nextY = _y + (_sensorY - _y) * follow;
    final double dist = sqrt(
      (nextX - _targetX) * (nextX - _targetX) +
          (nextY - _targetY) * (nextY - _targetY),
    );
    int held = 0;
    if (_restReady && dist <= _tolerance) {
      _inTargetSince ??= DateTime.now();
      held = DateTime.now().difference(_inTargetSince!).inMilliseconds;
      if (held >= _holdMs) {
        _submitted = true;
        widget.challengeContext.onSubmit(<String, dynamic>{
          'finalX': nextX,
          'finalY': nextY,
          'heldMs': held,
        });
      }
    } else {
      _inTargetSince = null;
      held = 0;
    }
    setState(() {
      _x = nextX;
      _y = nextY;
      _holdProgressMs = held;
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (widget.challengeContext.challenge.clientConfig['promptKey']
            as String?) ??
        widget.challengeContext.challenge.promptKey;

    return Column(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 48, 16, 8),
          child: Text(
            resolver.resolve(promptKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints c) {
              final double width = min(c.maxWidth * 0.92, 360);
              final double height = min(c.maxHeight * 0.7, 220);
              const double ball = 28;
              final double rangeX = (width - ball) / 2;
              final double rangeY = (height - ball) / 2;
              final double goal = max(
                ball + 8,
                min(width, height) * _tolerance,
              );
              final double ballLeft = (width / 2) + _x * rangeX - ball / 2;
              final double ballTop = (height / 2) + _y * rangeY - ball / 2;
              final double goalLeft =
                  (width / 2) + _targetX * rangeX - goal / 2;
              final double goalTop =
                  (height / 2) + _targetY * rangeY - goal / 2;
              return Center(
                child: SizedBox(
                  width: width,
                  height: height,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: <Widget>[
                      Positioned.fill(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(
                              color: LhColors.border,
                              width: 2,
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: goalLeft,
                        top: goalTop,
                        width: goal,
                        height: goal,
                        child: _TiltTargetShape(
                          shape: _targetShape,
                          color: LhColors.success,
                        ),
                      ),
                      Positioned(
                        left: ballLeft,
                        top: ballTop,
                        width: ball,
                        height: ball,
                        child: const DecoratedBox(
                          decoration: BoxDecoration(
                            color: LhColors.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(
            children: <Widget>[
              Text(
                resolver.resolve('challenge.tilt.hint'),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: LhColors.textMuted,
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: 180,
                child: LinearProgressIndicator(
                  value: (_holdProgressMs / _holdMs).clamp(0, 1),
                  minHeight: 8,
                  color: LhColors.success,
                  backgroundColor: LhColors.border,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TiltTargetShape extends StatelessWidget {
  const _TiltTargetShape({required this.shape, required this.color});

  final String shape;
  final Color color;

  @override
  Widget build(BuildContext context) {
    switch (shape) {
      case 'square':
        return DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: color, width: 2),
          ),
        );
      case 'diamond':
        return Transform.rotate(
          angle: pi / 4,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: color, width: 2),
            ),
          ),
        );
      case 'heart':
        return CustomPaint(painter: _HeartOutlinePainter(color: color));
      case 'circle':
      default:
        return DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: color, width: 2),
          ),
          child: CustomPaint(
            painter: _DashedCirclePainter(
              color: color.withValues(alpha: 0.85),
            ),
          ),
        );
    }
  }
}

class _HeartOutlinePainter extends CustomPainter {
  _HeartOutlinePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2;
    final Path path = Path();
    final double w = size.width;
    final double h = size.height;
    path.moveTo(w * 0.5, h * 0.78);
    path.cubicTo(w * 0.12, h * 0.55, w * 0.08, h * 0.22, w * 0.32, h * 0.18);
    path.cubicTo(w * 0.44, h * 0.16, w * 0.5, h * 0.28, w * 0.5, h * 0.34);
    path.cubicTo(w * 0.5, h * 0.28, w * 0.56, h * 0.16, w * 0.68, h * 0.18);
    path.cubicTo(w * 0.92, h * 0.22, w * 0.88, h * 0.55, w * 0.5, h * 0.78);
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _HeartOutlinePainter oldDelegate) =>
      oldDelegate.color != color;
}

class _DashedCirclePainter extends CustomPainter {
  _DashedCirclePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    const int dashes = 18;
    final double radius = size.width / 2;
    final Offset center = Offset(size.width / 2, size.height / 2);
    for (int i = 0; i < dashes; i++) {
      if (i.isOdd) continue;
      final double start = (i / dashes) * pi * 2;
      final double end = ((i + 0.7) / dashes) * pi * 2;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius - 1),
        start,
        end - start,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DashedCirclePainter oldDelegate) =>
      oldDelegate.color != color;
}
