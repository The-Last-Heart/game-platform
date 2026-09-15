import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class PrecisionMazePathEngine implements ChallengeEngine {
  @override
  String get engineId => 'precision.maze_path';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _MazePathWidget(challengeContext: challengeContext);
  }
}

class _MazePathWidget extends StatefulWidget {
  const _MazePathWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_MazePathWidget> createState() => _MazePathWidgetState();
}

class _MazePathWidgetState extends State<_MazePathWidget> {
  bool _submitted = false;
  bool _drawing = false;
  bool _hitWall = false;
  final List<Offset> _trail = <Offset>[];
  int? _currentCell;

  int get _cols {
    final num? v =
        widget.challengeContext.challenge.clientConfig['cols'] as num?;
    return v?.toInt().clamp(2, 12) ?? 5;
  }

  int get _rows {
    final num? v =
        widget.challengeContext.challenge.clientConfig['rows'] as num?;
    return v?.toInt().clamp(2, 12) ?? 5;
  }

  List<int> get _cells {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['cells'];
    if (raw is List) {
      return raw.map((Object? v) => (v as num).toInt()).toList(growable: false);
    }
    return List<int>.filled(_cols * _rows, 1);
  }

  int get _startIndex {
    final num? v =
        widget.challengeContext.challenge.clientConfig['startIndex'] as num?;
    return v?.toInt() ?? 0;
  }

  int get _goalIndex {
    final num? v =
        widget.challengeContext.challenge.clientConfig['goalIndex'] as num?;
    return v?.toInt() ?? (_cols * _rows - 1);
  }

  bool _isWall(int index) {
    if (index < 0 || index >= _cells.length) return true;
    return _cells[index] == 0;
  }

  int? _cellAt(Offset local, Size size) {
    final double cellW = size.width / _cols;
    final double cellH = size.height / _rows;
    final int col = (local.dx / cellW).floor().clamp(0, _cols - 1);
    final int row = (local.dy / cellH).floor().clamp(0, _rows - 1);
    return row * _cols + col;
  }

  void _submit({required bool reachedGoal, required bool hitWall}) {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    setState(() => _submitted = true);
    widget.challengeContext.onSubmit(<String, dynamic>{
      'reachedGoal': reachedGoal,
      'hitWall': hitWall,
    });
  }

  void _onPointerDown(PointerDownEvent e, Size size) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    final int? cell = _cellAt(e.localPosition, size);
    if (cell == null || cell != _startIndex || _isWall(cell)) return;
    setState(() {
      _drawing = true;
      _hitWall = false;
      _trail
        ..clear()
        ..add(e.localPosition);
      _currentCell = cell;
    });
  }

  void _onPointerMove(PointerMoveEvent e, Size size) {
    if (!_drawing || _submitted) return;
    final int? cell = _cellAt(e.localPosition, size);
    if (cell == null) return;
    if (_isWall(cell)) {
      setState(() => _hitWall = true);
      _submit(reachedGoal: false, hitWall: true);
      return;
    }
    setState(() {
      _trail.add(e.localPosition);
      _currentCell = cell;
    });
    if (cell == _goalIndex) {
      _submit(reachedGoal: true, hitWall: false);
    }
  }

  void _onPointerUp(PointerUpEvent e) {
    if (!_drawing || _submitted) return;
    setState(() => _drawing = false);
    if (_currentCell != _goalIndex) {
      _submit(reachedGoal: false, hitWall: _hitWall);
    }
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;
    final String footerKey = (cfg['footerKey'] as String?) ?? '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.success,
          ),
          const SizedBox(height: 18),
          TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: 1),
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            builder: (BuildContext context, double t, Widget? child) {
              return Opacity(opacity: t, child: child);
            },
            child: Text(
              resolver.resolve(promptKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 18),
          Expanded(
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: 1),
              duration: const Duration(milliseconds: 360),
              curve: Curves.easeOutBack,
              builder: (BuildContext context, double t, Widget? child) {
                return Transform.scale(scale: t, child: child);
              },
              child: LayoutBuilder(
                builder: (BuildContext context, BoxConstraints constraints) {
                  final Size mazeSize = Size(
                    constraints.maxWidth,
                    constraints.maxHeight,
                  );
                  return Listener(
                    behavior: HitTestBehavior.opaque,
                    onPointerDown: (PointerDownEvent e) =>
                        _onPointerDown(e, mazeSize),
                    onPointerMove: (PointerMoveEvent e) =>
                        _onPointerMove(e, mazeSize),
                    onPointerUp: _onPointerUp,
                    onPointerCancel: (_) {
                      if (!_drawing || _submitted) return;
                      setState(() => _drawing = false);
                      if (_currentCell != _goalIndex) {
                        _submit(reachedGoal: false, hitWall: _hitWall);
                      }
                    },
                    child: CustomPaint(
                      painter: _MazePainter(
                        cols: _cols,
                        rows: _rows,
                        cells: _cells,
                        startIndex: _startIndex,
                        goalIndex: _goalIndex,
                        trail: _trail,
                        hitWall: _hitWall,
                      ),
                      child: const SizedBox.expand(),
                    ),
                  );
                },
              ),
            ),
          ),
          if (footerKey.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Text(
              resolver.resolve(footerKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: LhColors.textMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MazePainter extends CustomPainter {
  _MazePainter({
    required this.cols,
    required this.rows,
    required this.cells,
    required this.startIndex,
    required this.goalIndex,
    required this.trail,
    required this.hitWall,
  });

  final int cols;
  final int rows;
  final List<int> cells;
  final int startIndex;
  final int goalIndex;
  final List<Offset> trail;
  final bool hitWall;

  @override
  void paint(Canvas canvas, Size size) {
    final double cellW = size.width / cols;
    final double cellH = size.height / rows;
    final Paint wallPaint = Paint()..color = LhColors.primary.withValues(alpha: 0.85);
    final Paint pathPaint = Paint()..color = LhColors.elevated;
    final Paint borderPaint = Paint()
      ..color = LhColors.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;

    for (int i = 0; i < cells.length; i++) {
      final int col = i % cols;
      final int row = i ~/ cols;
      final Rect rect = Rect.fromLTWH(col * cellW, row * cellH, cellW, cellH);
      canvas.drawRect(
        rect.deflate(1),
        cells[i] == 0 ? wallPaint : pathPaint,
      );
      canvas.drawRect(rect.deflate(1), borderPaint);
    }

    void drawMarker(int index, Color color) {
      final int col = index % cols;
      final int row = index ~/ cols;
      final Offset c = Offset(
        col * cellW + cellW / 2,
        row * cellH + cellH / 2,
      );
      canvas.drawCircle(
        c,
        math.min(cellW, cellH) * 0.22,
        Paint()..color = color,
      );
    }

    drawMarker(startIndex, LhColors.success);
    drawMarker(goalIndex, LhColors.warning);

    if (trail.length >= 2) {
      final Paint trailPaint = Paint()
        ..color = hitWall ? LhColors.primary : LhColors.success
        ..strokeWidth = 5
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;
      final Path path = Path()..moveTo(trail.first.dx, trail.first.dy);
      for (int i = 1; i < trail.length; i++) {
        path.lineTo(trail[i].dx, trail[i].dy);
      }
      canvas.drawPath(path, trailPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _MazePainter oldDelegate) {
    return oldDelegate.trail != trail ||
        oldDelegate.hitWall != hitWall ||
        oldDelegate.cells != cells;
  }
}
