import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../theme/lh_tokens.dart';

/// A circular countdown ring showing remaining time.
class CountdownRing extends StatelessWidget {
  const CountdownRing({
    required this.progress,
    required this.label,
    this.size = 120,
    this.ringColor,
    this.glow = false,
    super.key,
  });

  /// 0.0 = empty, 1.0 = full.
  final double progress;

  /// Text shown in the center (e.g. seconds remaining).
  final String label;

  /// Diameter of the ring.
  final double size;

  /// Override the ring stroke color.
  final Color? ringColor;

  /// Whether to show glow around the ring.
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final Color color = ringColor ?? LhColors.primary;
    return Container(
      width: size,
      height: size,
      decoration: glow
          ? BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: color.withValues(alpha: 0.35),
                  blurRadius: size * 0.25,
                  spreadRadius: 2,
                ),
              ],
            )
          : null,
      child: Stack(
        alignment: Alignment.center,
        children: <Widget>[
          CustomPaint(
            size: Size(size, size),
            painter: _RingPainter(progress: progress, ringColor: color),
          ),
          Text(
            label,
            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
              color: LhColors.text,
              fontSize: size * 0.28,
            ),
          ),
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.progress, required this.ringColor});

  final double progress;
  final Color ringColor;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset center = Offset(size.width / 2, size.height / 2);
    final double strokeWidth = size.width * 0.055;
    final double radius = size.width / 2 - strokeWidth;

    final Paint bgPaint = Paint()
      ..color = LhColors.border.withValues(alpha: 0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth;
    canvas.drawCircle(center, radius, bgPaint);

    final Paint fgPaint = Paint()
      ..color = ringColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      2 * math.pi * progress.clamp(0.0, 1.0),
      false,
      fgPaint,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.progress != progress || old.ringColor != ringColor;
}
