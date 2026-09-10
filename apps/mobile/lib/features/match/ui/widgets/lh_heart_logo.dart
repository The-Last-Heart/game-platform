import 'package:flutter/material.dart';

import '../../../../theme/lh_tokens.dart';

/// Brand heart logo with EKG line — used across screens.
class LhHeartLogo extends StatelessWidget {
  const LhHeartLogo({this.size = 64, this.color, super.key});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final Color heartColor = color ?? LhColors.primary;
    return SizedBox(
      width: size,
      height: size,
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
