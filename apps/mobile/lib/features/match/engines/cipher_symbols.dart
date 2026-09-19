import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Programmatic cipher symbol registry for `trivia.symbol_cipher_word`.
///
/// Symbol IDs are persisted in challenge definitions and must stay stable.
/// Never use emoji or Unicode shape characters — appearance differs by OS.

enum CipherSymbolId {
  circle,
  square,
  triangle,
  diamond,
  hexagon,
  octagon,
  star,
  crescent;

  static CipherSymbolId? tryParse(String raw) {
    switch (raw) {
      case 'circle':
        return CipherSymbolId.circle;
      case 'square':
        return CipherSymbolId.square;
      case 'triangle':
        return CipherSymbolId.triangle;
      case 'diamond':
        return CipherSymbolId.diamond;
      case 'hexagon':
        return CipherSymbolId.hexagon;
      case 'octagon':
        return CipherSymbolId.octagon;
      case 'star':
        return CipherSymbolId.star;
      case 'crescent':
        return CipherSymbolId.crescent;
      default:
        return null;
    }
  }

  String get wireId {
    switch (this) {
      case CipherSymbolId.circle:
        return 'circle';
      case CipherSymbolId.square:
        return 'square';
      case CipherSymbolId.triangle:
        return 'triangle';
      case CipherSymbolId.diamond:
        return 'diamond';
      case CipherSymbolId.hexagon:
        return 'hexagon';
      case CipherSymbolId.octagon:
        return 'octagon';
      case CipherSymbolId.star:
        return 'star';
      case CipherSymbolId.crescent:
        return 'crescent';
    }
  }

  String get semanticLabel {
    switch (this) {
      case CipherSymbolId.circle:
        return 'circle';
      case CipherSymbolId.square:
        return 'square';
      case CipherSymbolId.triangle:
        return 'triangle';
      case CipherSymbolId.diamond:
        return 'diamond';
      case CipherSymbolId.hexagon:
        return 'hexagon';
      case CipherSymbolId.octagon:
        return 'octagon';
      case CipherSymbolId.star:
        return 'star';
      case CipherSymbolId.crescent:
        return 'crescent';
    }
  }
}

enum CipherSymbolStyle { gold, cyan }

/// Recommended gold/cyan alternation for the five key slots (mockup).
CipherSymbolStyle cipherKeySlotStyle(int index) {
  return index.isEven ? CipherSymbolStyle.gold : CipherSymbolStyle.cyan;
}

class CipherSymbolColors {
  const CipherSymbolColors._();

  static const Color gold = Color(0xFFE0C15A);
  static const Color goldBright = Color(0xFFF6E39A);
  static const Color cyan = Color(0xFF3DE8FF);
  static const Color cyanSoft = Color(0xFF9AF6FF);

  static Color primary(CipherSymbolStyle style) {
    return style == CipherSymbolStyle.gold ? gold : cyan;
  }

  static Color highlight(CipherSymbolStyle style) {
    return style == CipherSymbolStyle.gold ? goldBright : cyanSoft;
  }
}

/// Builds a closed path for [id] inside a unit square centered at origin,
/// scaled to fit [size] with padding.
Path cipherSymbolPath(CipherSymbolId id, Size size) {
  final double s = math.min(size.width, size.height);
  final Offset c = Offset(size.width / 2, size.height / 2);
  final double r = s * 0.38;
  switch (id) {
    case CipherSymbolId.circle:
      return Path()..addOval(Rect.fromCircle(center: c, radius: r));
    case CipherSymbolId.square:
      return Path()
        ..addRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(center: c, width: r * 1.7, height: r * 1.7),
            const Radius.circular(2),
          ),
        );
    case CipherSymbolId.triangle:
      return Path()
        ..moveTo(c.dx, c.dy - r)
        ..lineTo(c.dx + r * 0.95, c.dy + r * 0.85)
        ..lineTo(c.dx - r * 0.95, c.dy + r * 0.85)
        ..close();
    case CipherSymbolId.diamond:
      return Path()
        ..moveTo(c.dx, c.dy - r)
        ..lineTo(c.dx + r * 0.75, c.dy)
        ..lineTo(c.dx, c.dy + r)
        ..lineTo(c.dx - r * 0.75, c.dy)
        ..close();
    case CipherSymbolId.hexagon:
      return _regularPolygon(c, r, 6, -math.pi / 2);
    case CipherSymbolId.octagon:
      return _regularPolygon(c, r, 8, -math.pi / 8);
    case CipherSymbolId.star:
      return _star(c, r, r * 0.42, 5);
    case CipherSymbolId.crescent:
      final Path outer = Path()
        ..addOval(Rect.fromCircle(center: c, radius: r));
      final Path cut = Path()
        ..addOval(
          Rect.fromCircle(
            center: Offset(c.dx + r * 0.38, c.dy - r * 0.08),
            radius: r * 0.78,
          ),
        );
      return Path.combine(PathOperation.difference, outer, cut);
  }
}

Path _regularPolygon(Offset c, double r, int sides, double startAngle) {
  final Path path = Path();
  for (int i = 0; i < sides; i++) {
    final double a = startAngle + (i * 2 * math.pi / sides);
    final Offset p = Offset(c.dx + r * math.cos(a), c.dy + r * math.sin(a));
    if (i == 0) {
      path.moveTo(p.dx, p.dy);
    } else {
      path.lineTo(p.dx, p.dy);
    }
  }
  path.close();
  return path;
}

Path _star(Offset c, double outerR, double innerR, int points) {
  final Path path = Path();
  final int n = points * 2;
  for (int i = 0; i < n; i++) {
    final double r = i.isEven ? outerR : innerR;
    final double a = -math.pi / 2 + (i * math.pi / points);
    final Offset p = Offset(c.dx + r * math.cos(a), c.dy + r * math.sin(a));
    if (i == 0) {
      path.moveTo(p.dx, p.dy);
    } else {
      path.lineTo(p.dx, p.dy);
    }
  }
  path.close();
  return path;
}

class CipherSymbolPainter extends CustomPainter {
  CipherSymbolPainter({
    required this.symbolId,
    required this.style,
    this.glow = 0.55,
    this.breath = 0,
  });

  final CipherSymbolId symbolId;
  final CipherSymbolStyle style;
  final double glow;
  final double breath;

  @override
  void paint(Canvas canvas, Size size) {
    final Path path = cipherSymbolPath(symbolId, size);
    final Color base = CipherSymbolColors.primary(style);
    final Color hi = CipherSymbolColors.highlight(style);
    final double pulse = 1 + breath * 0.04;

    canvas.save();
    canvas.translate(size.width / 2, size.height / 2);
    canvas.scale(pulse);
    canvas.translate(-size.width / 2, -size.height / 2);

    if (glow > 0.01) {
      final Paint bloom = Paint()
        ..color = base.withValues(alpha: 0.22 * glow)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, 6 + glow * 4)
        ..style = PaintingStyle.fill;
      canvas.drawPath(path, bloom);
    }

    final Paint fill = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: <Color>[
          hi.withValues(alpha: 0.95),
          base.withValues(alpha: 0.88),
        ],
      ).createShader(Offset.zero & size)
      ..style = PaintingStyle.fill;
    canvas.drawPath(path, fill);

    final Paint stroke = Paint()
      ..color = hi.withValues(alpha: 0.95)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;
    canvas.drawPath(path, stroke);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CipherSymbolPainter oldDelegate) {
    return oldDelegate.symbolId != symbolId ||
        oldDelegate.style != style ||
        oldDelegate.glow != glow ||
        oldDelegate.breath != breath;
  }
}

class CipherSymbolView extends StatelessWidget {
  const CipherSymbolView({
    super.key,
    required this.symbolId,
    required this.style,
    this.size = 28,
    this.glow = 0.55,
    this.breath = 0,
    this.semanticLabel,
  });

  final CipherSymbolId symbolId;
  final CipherSymbolStyle style;
  final double size;
  final double glow;
  final double breath;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel ?? symbolId.semanticLabel,
      child: CustomPaint(
        size: Size.square(size),
        painter: CipherSymbolPainter(
          symbolId: symbolId,
          style: style,
          glow: glow,
          breath: breath,
        ),
      ),
    );
  }
}

/// Logical index 0 is the first Arabic grapheme; it must render rightmost.
int logicalIndexToVisualLtrIndex(int logicalIndex, int length) {
  return length - 1 - logicalIndex;
}

/// For an RTL [Row], children are laid out with index 0 on the right.
/// Pass logical-order children directly — do not reverse the list.
List<T> cipherLogicalOrderForRtlRow<T>(List<T> logical) => logical;
