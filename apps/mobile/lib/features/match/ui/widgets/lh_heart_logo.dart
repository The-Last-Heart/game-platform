import 'package:flutter/material.dart';

import '../../../../theme/lh_tokens.dart';

/// Brand heart logo with EKG line — used across screens.
///
/// Optional [pulse] (0–1) drives a soft scale + glow so the heart feels alive.
class LhHeartLogo extends StatelessWidget {
  const LhHeartLogo({
    this.size = 64,
    this.color,
    this.pulse = 0,
    super.key,
  });

  final double size;
  final Color? color;

  /// 0 = rest, 1 = peak of pulse (scale + glow).
  final double pulse;

  @override
  Widget build(BuildContext context) {
    final Color heartColor = color ?? LhColors.primary;
    final double beat = 1 + (pulse.clamp(0.0, 1.0) * 0.12);
    final double glow = pulse.clamp(0.0, 1.0);
    return SizedBox(
      width: size * 1.35,
      height: size * 1.35,
      child: Center(
        child: Transform.scale(
          scale: beat,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: glow > 0.02
                  ? <BoxShadow>[
                      BoxShadow(
                        color: heartColor.withValues(alpha: 0.25 + glow * 0.45),
                        blurRadius: 18 + glow * 22,
                        spreadRadius: 1 + glow * 4,
                      ),
                    ]
                  : null,
            ),
            child: Stack(
              alignment: Alignment.center,
              children: <Widget>[
                Icon(Icons.favorite, color: heartColor, size: size),
                CustomPaint(
                  size: Size(size * 0.65, size * 0.32),
                  painter: _EkgLinePainter(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EkgLinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = const Color(0xFF030914)
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.height * 0.12
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final double midY = size.height / 2;
    final Path path = Path()
      ..moveTo(0, midY)
      ..lineTo(size.width * 0.28, midY)
      ..lineTo(size.width * 0.38, midY - size.height * 0.45)
      ..lineTo(size.width * 0.50, midY + size.height * 0.40)
      ..lineTo(size.width * 0.60, midY - size.height * 0.20)
      ..lineTo(size.width * 0.70, midY)
      ..lineTo(size.width, midY);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
