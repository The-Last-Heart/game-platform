import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'laser_routing_models.dart';

class LaserRoutingBoardPainter extends CustomPainter {
  LaserRoutingBoardPainter({
    required this.snapshot,
    required this.time,
    required this.entrance,
    required this.success,
    required this.timeout,
    required this.selectedId,
    required this.pendingId,
    required this.rotations,
    required this.reducedMotion,
    required this.pathReveal,
  });

  final LaserRoutingSnapshot snapshot;
  final double time;
  final double entrance;
  final double success;
  final double timeout;
  final String? selectedId;
  final String? pendingId;
  final Map<String, double> rotations;
  final bool reducedMotion;
  final double pathReveal;

  static const Color _navy = Color(0xFF04111F);
  static const Color _cyan = Color(0xFF3CE7FF);
  static const Color _amber = Color(0xFFFFB14A);
  static const Color _fused = Color(0xFFE8FBFF);
  static const Color _heart = Color(0xFFFF4E8C);
  static const Color _frame = Color(0xFF1C6C8A);

  @override
  void paint(Canvas canvas, Size size) {
    final double dim = 1 - (timeout * 0.45);
    canvas.saveLayer(Offset.zero & size, Paint()..color = Color.fromRGBO(255, 255, 255, dim));
    _paintChamber(canvas, size);
    final Rect board = _boardRect(size);
    _paintBoardFrame(canvas, board);
    _paintGrid(canvas, board);
    _paintTraces(canvas, board);
    for (final LaserComponentView component in snapshot.components) {
      _paintComponent(canvas, board, component);
    }
    canvas.restore();
  }

  Rect _boardRect(Size size) {
    final double pad = size.shortestSide * 0.06;
    return Rect.fromLTWH(pad, pad, size.width - pad * 2, size.height - pad * 2);
  }

  Size _cell(Rect board) {
    return Size(board.width / snapshot.width, board.height / snapshot.height);
  }

  Offset _cellCenter(Rect board, int row, int col) {
    final Size cell = _cell(board);
    return Offset(
      board.left + (col + 0.5) * cell.width,
      board.top + (row + 0.5) * cell.height,
    );
  }

  void _paintChamber(Canvas canvas, Size size) {
    final Paint bg = Paint()
      ..shader = ui.Gradient.radial(
        Offset(size.width / 2, size.height * 0.62),
        size.longestSide * 0.72,
        const <Color>[Color(0xFF0A2438), Color(0xFF030914)],
      );
    canvas.drawRect(Offset.zero & size, bg);
    final Paint pillar = Paint()
      ..shader = ui.Gradient.linear(
        Offset.zero,
        const Offset(36, 0),
        <Color>[const Color(0xFF12344A), const Color(0x0012344A)],
      );
    canvas.drawRect(Rect.fromLTWH(0, 0, 36, size.height), pillar);
    canvas.save();
    canvas.translate(size.width, 0);
    canvas.scale(-1, 1);
    canvas.drawRect(Rect.fromLTWH(0, 0, 36, size.height), pillar);
    canvas.restore();
    final Paint floor = Paint()
      ..shader = ui.Gradient.linear(
        Offset(size.width / 2, size.height * 0.72),
        Offset(size.width / 2, size.height),
        <Color>[const Color(0x003CE7FF), const Color(0x333CE7FF)],
      );
    canvas.drawRect(
      Rect.fromLTWH(0, size.height * 0.72, size.width, size.height * 0.28),
      floor,
    );
  }

  void _paintBoardFrame(Canvas canvas, Rect board) {
    final RRect rrect = RRect.fromRectAndRadius(board.inflate(10), const Radius.circular(18));
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = _navy
        ..style = PaintingStyle.fill,
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = _frame.withValues(alpha: 0.85 * entrance)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2,
    );
    canvas.drawRRect(
      rrect.deflate(5),
      Paint()
        ..color = _cyan.withValues(alpha: 0.35 * entrance)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.1,
    );
    _cornerBrackets(canvas, board.inflate(10));
  }

  void _cornerBrackets(Canvas canvas, Rect rect) {
    final Paint paint = Paint()
      ..color = _cyan.withValues(alpha: 0.8 * entrance)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    const double arm = 16;
    void corner(Offset o, double sx, double sy) {
      canvas.drawLine(o, o + Offset(arm * sx, 0), paint);
      canvas.drawLine(o, o + Offset(0, arm * sy), paint);
    }
    corner(rect.topLeft, 1, 1);
    corner(rect.topRight, -1, 1);
    corner(rect.bottomLeft, 1, -1);
    corner(rect.bottomRight, -1, -1);
  }

  void _paintGrid(Canvas canvas, Rect board) {
    final Paint line = Paint()
      ..color = const Color(0xFF1A4C66).withValues(alpha: 0.55 * entrance)
      ..strokeWidth = 1;
    for (int c = 1; c < snapshot.width; c += 1) {
      final double x = board.left + board.width * c / snapshot.width;
      canvas.drawLine(Offset(x, board.top), Offset(x, board.bottom), line);
    }
    for (int r = 1; r < snapshot.height; r += 1) {
      final double y = board.top + board.height * r / snapshot.height;
      canvas.drawLine(Offset(board.left, y), Offset(board.right, y), line);
    }
  }

  Color _beamColor(String color) {
    switch (color) {
      case 'amber':
        return _amber;
      case 'fused':
        return _fused;
      default:
        return _cyan;
    }
  }

  void _paintTraces(Canvas canvas, Rect board) {
    for (final LaserTraceView trace in snapshot.traces) {
      if (trace.cells.length < 2) continue;
      final Path path = Path();
      for (int i = 0; i < trace.cells.length; i += 1) {
        final Offset p = _cellCenter(board, trace.cells[i].row, trace.cells[i].col);
        if (i == 0) {
          path.moveTo(p.dx, p.dy);
        } else {
          path.lineTo(p.dx, p.dy);
        }
      }
      final ui.PathMetrics metrics = path.computeMetrics();
      for (final ui.PathMetric metric in metrics) {
        final double shown = metric.length * pathReveal.clamp(0.0, 1.0);
        if (shown <= 0) continue;
        final Path visible = metric.extractPath(0, shown);
        final Color color = _beamColor(trace.color);
        canvas.drawPath(
          visible,
          Paint()
            ..color = color.withValues(alpha: reducedMotion ? 0.18 : 0.28)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 14
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
        );
        canvas.drawPath(
          visible,
          Paint()
            ..color = color.withValues(alpha: 0.9)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 4.2
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round,
        );
        canvas.drawPath(
          visible,
          Paint()
            ..color = Colors.white.withValues(alpha: 0.85)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.6
            ..strokeCap = StrokeCap.round,
        );
        if (!reducedMotion) {
          final double pulse = (time * 90) % metric.length;
          final ui.Tangent? tan = metric.getTangentForOffset(pulse.clamp(0, shown));
          if (tan != null) {
            canvas.drawCircle(
              tan.position,
              3.4,
              Paint()..color = Colors.white.withValues(alpha: 0.9),
            );
          }
        }
      }
    }
  }

  void _paintComponent(Canvas canvas, Rect board, LaserComponentView component) {
    final Offset c = _cellCenter(board, component.row, component.col);
    final double radius = math.min(_cell(board).width, _cell(board).height) * 0.32;
    switch (component.kind) {
      case 'source':
        _paintSource(canvas, c, radius, component);
        break;
      case 'mirror':
        _paintMirror(canvas, c, radius, component);
        break;
      case 'gate':
        _paintGate(canvas, c, radius, component);
        break;
      case 'combiner':
        _paintCombiner(canvas, c, radius, component);
        break;
      case 'heart':
        _paintHeart(canvas, c, radius, component);
        break;
    }
  }

  void _paintSource(Canvas canvas, Offset c, double radius, LaserComponentView component) {
    final Color color = _beamColor(component.color ?? 'cyan');
    final double pulse = reducedMotion ? 1 : 1 + 0.08 * math.sin(time * 6);
    canvas.drawCircle(
      c,
      radius * 1.15 * pulse,
      Paint()
        ..color = color.withValues(alpha: 0.18)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..color = const Color(0xFF0B2233)
        ..style = PaintingStyle.fill,
    );
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4,
    );
    canvas.drawCircle(c, radius * 0.28, Paint()..color = color);
  }

  void _paintMirror(Canvas canvas, Offset c, double radius, LaserComponentView component) {
    final bool hit = snapshot.traces.any((LaserTraceView t) => t.hitComponentIds.contains(component.id));
    final bool selected = selectedId == component.id || pendingId == component.id;
    final double turn = rotations[component.id] ?? (component.orientation == 'backslash' ? 1 : 0);
    canvas.drawCircle(
      c,
      radius * 1.25,
      Paint()
        ..color = (selected ? _amber : (hit ? _cyan : const Color(0xFF24586E)))
            .withValues(alpha: selected ? 0.38 : hit ? 0.22 : 0.12)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    canvas.drawCircle(c, radius * 1.05, Paint()..color = const Color(0xFF102433));
    canvas.drawCircle(
      c,
      radius * 1.05,
      Paint()
        ..color = const Color(0xFF8FBFD0)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    canvas.drawCircle(
      c,
      radius * 0.82,
      Paint()
        ..color = _cyan.withValues(alpha: 0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2,
    );
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(-math.pi / 4 + turn * math.pi / 2);
    final Rect plate = Rect.fromCenter(center: Offset.zero, width: radius * 1.35, height: radius * 0.22);
    canvas.drawRRect(
      RRect.fromRectAndRadius(plate, const Radius.circular(4)),
      Paint()
        ..shader = ui.Gradient.linear(
          plate.topCenter,
          plate.bottomCenter,
          const <Color>[Color(0xFFE8F6FF), Color(0xFF7FA7B8), Color(0xFFD9EEF8)],
          const <double>[0, 0.55, 1],
        ),
    );
    canvas.restore();
  }

  void _paintGate(Canvas canvas, Offset c, double radius, LaserComponentView component) {
    final bool open = snapshot.traces.any(
      (LaserTraceView t) => t.hitComponentIds.contains(component.id),
    );
    final bool blocked = snapshot.traces.any(
      (LaserTraceView t) => t.blockedComponentId == component.id,
    );
    final double turn = rotations[component.id] ?? (component.axis == 'vertical' ? 1 : 0);
    canvas.drawCircle(
      c,
      radius * 1.18,
      Paint()
        ..color = (open ? _cyan : blocked ? _heart : const Color(0xFF2A6078))
            .withValues(alpha: 0.2),
    );
    canvas.saveLayer(Rect.fromCircle(center: c, radius: radius * 1.3), Paint());
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..color = const Color(0xFF0C2434)
        ..style = PaintingStyle.fill,
    );
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(turn * math.pi / 2);
    final Path ring = Path()..addOval(Rect.fromCircle(center: Offset.zero, radius: radius * 0.86));
    canvas.drawPath(
      ring,
      Paint()
        ..color = _cyan
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.2,
    );
    canvas.drawLine(
      Offset(-radius * 0.55, 0),
      Offset(radius * 0.55, 0),
      Paint()
        ..color = Colors.transparent
        ..blendMode = BlendMode.clear
        ..strokeWidth = 10,
    );
    canvas.drawLine(
      Offset(-radius * 0.52, 0),
      Offset(radius * 0.52, 0),
      Paint()
        ..color = open ? _cyan : const Color(0xFF4D6F80)
        ..strokeWidth = 3.4
        ..strokeCap = StrokeCap.round,
    );
    canvas.restore();
    canvas.restore();
    canvas.drawCircle(
      c,
      radius * 0.18,
      Paint()
        ..color = _cyan.withValues(alpha: 0.0)
        ..style = PaintingStyle.stroke,
    );
    canvas.drawLine(
      c + Offset(-radius * 0.18, 0),
      c + Offset(radius * 0.18, 0),
      Paint()
        ..color = _cyan.withValues(alpha: 0.7)
        ..strokeWidth = 1.1,
    );
    canvas.drawLine(
      c + Offset(0, -radius * 0.18),
      c + Offset(0, radius * 0.18),
      Paint()
        ..color = _cyan.withValues(alpha: 0.7)
        ..strokeWidth = 1.1,
    );
  }

  void _paintCombiner(Canvas canvas, Offset c, double radius, LaserComponentView component) {
    final Path diamond = Path()
      ..moveTo(c.dx, c.dy - radius)
      ..lineTo(c.dx + radius, c.dy)
      ..lineTo(c.dx, c.dy + radius)
      ..lineTo(c.dx - radius, c.dy)
      ..close();
    canvas.drawPath(
      diamond,
      Paint()
        ..color = snapshot.combinerCharged ? _fused.withValues(alpha: 0.28) : const Color(0xFF123044)
        ..style = PaintingStyle.fill,
    );
    canvas.drawPath(
      diamond,
      Paint()
        ..color = snapshot.combinerCharged ? _fused : _cyan
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2,
    );
    if (snapshot.combinerCharged && !reducedMotion) {
      canvas.drawCircle(
        c,
        radius * (0.3 + 0.08 * math.sin(time * 8)),
        Paint()..color = Colors.white.withValues(alpha: 0.55),
      );
    }
  }

  void _paintHeart(Canvas canvas, Offset c, double radius, LaserComponentView component) {
    final bool receiving = snapshot.traces.any(
      (LaserTraceView t) => t.termination == 'heart',
    );
    final bool lit = snapshot.heartLit;
    final double beat = reducedMotion
        ? 1
        : 1 + 0.05 * math.sin(time * (lit || receiving ? 8.5 : 3.2));
    final double scale = beat * (1 + success * 0.18);
    final Path heart = _heartPath(c, radius * 0.88 * scale);

    _paintHeartMount(canvas, c, radius);

    final Color neon = lit ? const Color(0xFFFF5A9A) : _heart;
    canvas.drawPath(
      heart,
      Paint()
        ..color = neon.withValues(alpha: lit ? 0.45 : 0.18)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, lit ? 14 : 8),
    );
    canvas.drawPath(
      heart,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(c.dx, c.dy - radius),
          Offset(c.dx, c.dy + radius),
          lit
              ? const <Color>[Color(0xFFFFD0E4), Color(0xFFFF3E86), Color(0xFFB01448)]
              : const <Color>[Color(0xFF5A3144), Color(0xFF2A1520), Color(0xFF140A10)],
          const <double>[0, 0.45, 1],
        ),
    );
    canvas.drawPath(
      heart,
      Paint()
        ..color = lit ? const Color(0xFFFFF2F8) : _heart.withValues(alpha: 0.85)
        ..style = PaintingStyle.stroke
        ..strokeWidth = lit ? 2.4 : 1.8
        ..strokeJoin = StrokeJoin.round,
    );
    if (lit) {
      final Path inner = _heartPath(c, radius * 0.58 * scale);
      canvas.drawPath(
        inner,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.22 + success * 0.2)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.1,
      );
    }
    if (lit && !reducedMotion) {
      for (int i = 0; i < 3; i += 1) {
        canvas.drawCircle(
          c,
          radius * (1.15 + i * 0.42 + success * 0.75),
          Paint()
            ..color = neon.withValues(alpha: (0.24 - i * 0.06) * (1 - timeout))
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.4,
        );
      }
    }
  }

  void _paintHeartMount(Canvas canvas, Offset c, double radius) {
    final Rect stem = Rect.fromCenter(
      center: Offset(c.dx, c.dy + radius * 0.78),
      width: radius * 0.22,
      height: radius * 0.28,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(stem, const Radius.circular(3)),
      Paint()..color = const Color(0xFF163044),
    );
    final Rect base = Rect.fromCenter(
      center: Offset(c.dx, c.dy + radius * 0.96),
      width: radius * 0.72,
      height: radius * 0.16,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(base, const Radius.circular(6)),
      Paint()
        ..shader = ui.Gradient.linear(
          base.topCenter,
          base.bottomCenter,
          const <Color>[Color(0xFF2A6A86), Color(0xFF0C2233)],
        ),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(base, const Radius.circular(6)),
      Paint()
        ..color = _cyan.withValues(alpha: 0.45)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.1,
    );
  }

  Path _heartPath(Offset c, double r) {
    final Path path = Path();
    for (int i = 0; i <= 72; i += 1) {
      final double t = (i / 72) * math.pi * 2;
      final double sinT = math.sin(t);
      final double x = 16 * sinT * sinT * sinT;
      final double y = 13 * math.cos(t) -
          5 * math.cos(2 * t) -
          2 * math.cos(3 * t) -
          math.cos(4 * t);
      final Offset p = Offset(
        c.dx + (x / 17) * r,
        c.dy - (y / 17) * r + r * 0.08,
      );
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();
    return path;
  }

  @override
  bool shouldRepaint(covariant LaserRoutingBoardPainter oldDelegate) {
    return oldDelegate.time != time ||
        oldDelegate.entrance != entrance ||
        oldDelegate.success != success ||
        oldDelegate.timeout != timeout ||
        oldDelegate.selectedId != selectedId ||
        oldDelegate.pendingId != pendingId ||
        oldDelegate.pathReveal != pathReveal ||
        oldDelegate.snapshot.stateSequence != snapshot.stateSequence ||
        oldDelegate.rotations != rotations;
  }
}
