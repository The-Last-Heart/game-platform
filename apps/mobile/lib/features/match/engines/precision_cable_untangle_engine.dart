import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../content/content_asset_cache.dart';
import '../ui/widgets/challenge_countdown.dart';
import '../ui/widgets/challenge_sfx.dart';
import 'cable_untangle_solver.dart';
import 'challenge_engine.dart';

class PrecisionCableUntangleEngine implements ChallengeEngine {
  @override
  String get engineId => 'precision.cable_untangle';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _CableUntangleWidget(challengeContext: challengeContext);
  }
}

class _CableUntangleWidget extends StatefulWidget {
  const _CableUntangleWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_CableUntangleWidget> createState() => _CableUntangleWidgetState();
}

class _CableUntangleWidgetState extends State<_CableUntangleWidget>
    with TickerProviderStateMixin {
  static const Duration _swapDuration = Duration(milliseconds: 210);
  static const Duration _settleDuration = Duration(milliseconds: 420);
  static const Duration _completionDuration = Duration(milliseconds: 700);

  late final AnimationController _swapController;
  late final AnimationController _settleController;
  late final AnimationController _completionController;
  late final AnimationController _dragHighlightController;
  late final Listenable _paintListenable;

  CableUntanglePuzzle? _puzzle;
  String? _parseError;
  late Map<String, String> _assignment;
  final List<CableUntangleSwap> _swaps = <CableUntangleSwap>[];

  bool _submitted = false;
  bool _inputLocked = false;
  int? _frozenDeadlineMs;

  String? _draggingCableId;
  Offset? _dragHeadNorm;
  String? _hoverRightSocketId;

  String? _swapDraggedCableId;
  String? _swapDisplacedCableId;
  String? _swapFromRightId;
  String? _swapToRightId;

  final Set<String> _settlingCableIds = <String>{};
  final Map<String, double> _settlePhase = <String, double>{};
  String _swingSfxAssetId = ChallengeSfx.defaultCableUntangleSwingAssetId;

  Map<String, dynamic> get _cfg =>
      widget.challengeContext.challenge.clientConfig;

  Map<String, dynamic> get _assetIds {
    final Object? raw = _cfg['assetIds'];
    if (raw is Map) {
      return raw.map((Object? k, Object? v) => MapEntry(k.toString(), v));
    }
    return <String, dynamic>{};
  }

  @override
  void initState() {
    super.initState();
    _swapController = AnimationController(vsync: this, duration: _swapDuration);
    _settleController = AnimationController(
      vsync: this,
      duration: _settleDuration,
    );
    _completionController = AnimationController(
      vsync: this,
      duration: _completionDuration,
    );
    _dragHighlightController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _paintListenable = Listenable.merge(<Listenable>[
      _swapController,
      _settleController,
      _completionController,
      _dragHighlightController,
    ]);

    final String configured = _assetIds['swingSfx']?.toString() ?? '';
    if (configured.isNotEmpty) {
      _swingSfxAssetId = configured;
    }
    unawaited(ContentAssetCache.instance.ensureAsset(_swingSfxAssetId));

    final CableUntangleParseResult parsed = parseCableUntanglePuzzle(
      widget.challengeContext.challenge.clientConfig,
    );
    if (!parsed.isValid || parsed.puzzle == null) {
      _parseError = parsed.error ?? 'invalid config';
      debugPrint('precision.cable_untangle invalid clientConfig: $_parseError');
      _assignment = <String, String>{};
      return;
    }
    _puzzle = parsed.puzzle;
    _assignment = initialRightAssignment(parsed.puzzle!);
  }

  @override
  void dispose() {
    _swapController.dispose();
    _settleController.dispose();
    _completionController.dispose();
    _dragHighlightController.dispose();
    super.dispose();
  }

  bool get _blocked =>
      _submitted ||
      _inputLocked ||
      _parseError != null ||
      _puzzle == null ||
      widget.challengeContext.isInteractionLocked;

  int _elapsedMs() {
    final int now = widget.challengeContext.estimateServerNowMs();
    final int start = widget.challengeContext.challenge.startsAtMs;
    if (now <= 0 || start <= 0) return 0;
    return math.max(0, now - start);
  }

  Color _hex(String value, Color fallback) {
    final String raw = value.replaceFirst('#', '');
    if (raw.length != 6) return fallback;
    final int? parsed = int.tryParse(raw, radix: 16);
    if (parsed == null) return fallback;
    return Color(0xFF000000 | parsed);
  }

  void _submitSuccess() {
    if (_submitted || _puzzle == null) return;
    setState(() {
      _submitted = true;
      _inputLocked = true;
      _frozenDeadlineMs = widget.challengeContext.estimateServerNowMs();
    });
    widget.challengeContext.onSubmit(<String, dynamic>{
      'swaps': _swaps.map((CableUntangleSwap s) => s.toJson()).toList(),
      'finalAssignment': Map<String, String>.from(_assignment),
    });
    _completionController.forward(from: 0);
  }

  void _onPointerDown(Offset local, Size boardSize) {
    if (_blocked || _draggingCableId != null || _swapController.isAnimating) {
      return;
    }
    final CableUntanglePuzzle puzzle = _puzzle!;
    final _BoardGeom geom = _BoardGeom.from(puzzle, boardSize);
    final Offset norm = geom.toNorm(local);
    final String? cableId = _hitTestRightHead(norm, geom);
    if (cableId == null) return;

    final String rightId = _assignment[cableId]!;
    setState(() {
      _draggingCableId = cableId;
      _dragHeadNorm = geom.rightSocketNorm(rightId);
      _hoverRightSocketId = null;
    });
    _dragHighlightController.repeat(reverse: true);
  }

  void _onPointerMove(Offset local, Size boardSize) {
    final String? cableId = _draggingCableId;
    if (cableId == null || _blocked) return;
    final CableUntanglePuzzle puzzle = _puzzle!;
    final _BoardGeom geom = _BoardGeom.from(puzzle, boardSize);
    final Offset norm = geom.toNorm(local);
    final String? hover = _nearestRightSocket(norm, geom);
    setState(() {
      _dragHeadNorm = Offset(
        norm.dx.clamp(0.02, 0.98),
        norm.dy.clamp(0.02, 0.98),
      );
      _hoverRightSocketId = hover;
    });
  }

  void _onPointerUp(Offset local, Size boardSize) {
    final String? cableId = _draggingCableId;
    if (cableId == null) return;
    _dragHighlightController.stop();
    _dragHighlightController.value = 0;

    final CableUntanglePuzzle puzzle = _puzzle!;
    final _BoardGeom geom = _BoardGeom.from(puzzle, boardSize);
    final Offset norm = _dragHeadNorm ?? geom.toNorm(local);
    final String fromRight = _assignment[cableId]!;
    final String? target = _nearestRightSocket(norm, geom);

    if (target == null || target == fromRight) {
      _animateReturn(cableId, fromRight);
      return;
    }

    final Map<String, String>? next = applyCableSwap(
      assignment: _assignment,
      draggedCableId: cableId,
      toRightSocketId: target,
    );
    if (next == null) {
      _animateReturn(cableId, fromRight);
      return;
    }

    String? displacedId;
    for (final MapEntry<String, String> e in _assignment.entries) {
      if (e.value == target) {
        displacedId = e.key;
        break;
      }
    }
    if (displacedId == null) {
      _animateReturn(cableId, fromRight);
      return;
    }

    final CableUntangleSwap swap = CableUntangleSwap(
      sequence: _swaps.length + 1,
      draggedCableId: cableId,
      displacedCableId: displacedId,
      fromRightSocketId: fromRight,
      toRightSocketId: target,
      elapsedMs: _elapsedMs(),
    );

    setState(() {
      _inputLocked = true;
      _draggingCableId = null;
      // Keep last finger position as swap animation start for the dragged head.
      _hoverRightSocketId = null;
      _assignment = next;
      _swaps.add(swap);
      _swapDraggedCableId = cableId;
      _swapDisplacedCableId = displacedId;
      _swapFromRightId = fromRight;
      _swapToRightId = target;
    });

    final int crossings = countCableIntersections(
      puzzle: puzzle,
      rightAssignment: _assignment,
    );
    final bool solved = crossings == 0;
    if (solved) {
      // Freeze timer / submit immediately on logical success — do not wait
      // for swap or completion animations (avoids timeout during FX).
      _submitSuccess();
    }

    _swapController.forward(from: 0).whenComplete(() {
      if (!mounted) return;
      // Heads have docked into their sockets — play server content-pack SFX.
      unawaited(ChallengeSfx.instance.play(_swingSfxAssetId));
      _settlingCableIds
        ..clear()
        ..add(cableId)
        ..add(displacedId!);
      _settlePhase[cableId] = 0;
      _settlePhase[displacedId] = math.pi * 0.35;
      _swapDraggedCableId = null;
      _swapDisplacedCableId = null;
      _swapFromRightId = null;
      _swapToRightId = null;
      _dragHeadNorm = null;

      if (solved) {
        // Completion FX already started in _submitSuccess; still settle.
        _settleController.forward(from: 0).whenComplete(() {
          if (!mounted) return;
          setState(() {
            _settlingCableIds.clear();
            _settlePhase.clear();
          });
        });
        return;
      }

      setState(() => _inputLocked = false);
      _settleController.forward(from: 0).whenComplete(() {
        if (!mounted) return;
        setState(() {
          _settlingCableIds.clear();
          _settlePhase.clear();
        });
      });
    });
  }

  void _animateReturn(String cableId, String rightSocketId) {
    // Use swap controller as a one-cable ease-back without changing assignment.
    setState(() {
      _inputLocked = true;
      _swapDraggedCableId = cableId;
      _swapDisplacedCableId = null;
      _swapFromRightId = rightSocketId;
      _swapToRightId = rightSocketId;
      _draggingCableId = null;
      _hoverRightSocketId = null;
    });
    _swapController.forward(from: 0).whenComplete(() {
      if (!mounted) return;
      setState(() {
        _inputLocked = false;
        _dragHeadNorm = null;
        _swapDraggedCableId = null;
        _swapFromRightId = null;
        _swapToRightId = null;
      });
    });
  }

  String? _hitTestRightHead(Offset norm, _BoardGeom geom) {
    final CableUntanglePuzzle puzzle = _puzzle!;
    final double touchR = math.max(puzzle.snapRadiusNorm * 1.35, 0.07);
    String? bestId;
    double bestDist = double.infinity;
    for (final CableUntangleCable cable in puzzle.cables) {
      final String rightId = _assignment[cable.id]!;
      if (_draggingCableId != null && cable.id != _draggingCableId) continue;
      final Offset head = geom.rightSocketNorm(rightId);
      final double d = (head - norm).distance;
      if (d <= touchR && d < bestDist) {
        bestDist = d;
        bestId = cable.id;
      }
    }
    return bestId;
  }

  String? _nearestRightSocket(Offset norm, _BoardGeom geom) {
    final CableUntanglePuzzle puzzle = _puzzle!;
    String? bestId;
    double bestDist = double.infinity;
    for (final CableUntangleSocket socket in puzzle.rightSockets) {
      final Offset p = geom.rightSocketNorm(socket.id);
      final double d = (p - norm).distance;
      if (d <= puzzle.snapRadiusNorm && d < bestDist) {
        bestDist = d;
        bestId = socket.id;
      }
    }
    return bestId;
  }

  Offset _visualHeadNorm(String cableId, _BoardGeom geom) {
    final String rightId = _assignment[cableId]!;
    final Offset home = geom.rightSocketNorm(rightId);

    if (_draggingCableId == cableId && _dragHeadNorm != null) {
      return _dragHeadNorm!;
    }

    if (_swapController.isAnimating) {
      final double t = Curves.easeOut.transform(_swapController.value);
      if (cableId == _swapDraggedCableId &&
          _swapFromRightId != null &&
          _swapToRightId != null) {
        final Offset from =
            _dragHeadNorm ?? geom.rightSocketNorm(_swapFromRightId!);
        final Offset to = geom.rightSocketNorm(_swapToRightId!);
        return Offset.lerp(from, to, t)!;
      }
      if (cableId == _swapDisplacedCableId &&
          _swapFromRightId != null &&
          _swapToRightId != null) {
        final Offset from = geom.rightSocketNorm(_swapToRightId!);
        final Offset to = geom.rightSocketNorm(_swapFromRightId!);
        return Offset.lerp(from, to, t)!;
      }
    }

    if (_settlingCableIds.contains(cableId) && _settleController.isAnimating) {
      final double progress = _settleController.value;
      final double damp = math.exp(-4.2 * progress);
      final double phase = _settlePhase[cableId] ?? 0;
      final double wave = math.sin(progress * math.pi * 5 + phase) * damp;
      // Strongest near the right endpoint; left stays fixed in the painter.
      return Offset(home.dx, home.dy + wave * 0.018);
    }

    if (_completionController.isAnimating ||
        _completionController.isCompleted) {
      final double progress = _completionController.value;
      final double damp = math.exp(-5.0 * progress) * (1.0 - progress);
      final double wave = math.sin(progress * math.pi * 3.5) * damp;
      return Offset(home.dx, home.dy + wave * 0.008);
    }

    return home;
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;
    final String? titleKey = cfg['titleKey'] as String?;
    final CableUntanglePuzzle? puzzle = _puzzle;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.success,
            deadlineOverrideMs: _frozenDeadlineMs,
          ),
          const SizedBox(height: 14),
          if (titleKey != null && titleKey.isNotEmpty)
            Text(
              resolver.resolve(titleKey),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: LhColors.text,
                fontSize: 22,
                fontWeight: FontWeight.w700,
              ),
            ),
          Text(
            resolver.resolve(promptKey),
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: LhColors.textMuted,
              fontSize: 15,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 14),
          Expanded(
            child: puzzle == null
                ? Center(
                    child: Text(
                      resolver.resolve(
                        TranslationKeys.errorsContentUnavailable,
                      ),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: LhColors.textMuted),
                    ),
                  )
                : LayoutBuilder(
                    builder: (BuildContext context, BoxConstraints constraints) {
                      final Size boardSize = Size(
                        constraints.maxWidth,
                        constraints.maxHeight,
                      );
                      return Directionality(
                        textDirection: TextDirection.ltr,
                        child: Listener(
                          behavior: HitTestBehavior.opaque,
                          onPointerDown: (PointerDownEvent e) {
                            _onPointerDown(e.localPosition, boardSize);
                          },
                          onPointerMove: (PointerMoveEvent e) {
                            _onPointerMove(e.localPosition, boardSize);
                          },
                          onPointerUp: (PointerUpEvent e) {
                            _onPointerUp(e.localPosition, boardSize);
                          },
                          onPointerCancel: (_) {
                            if (_draggingCableId != null) {
                              final String cableId = _draggingCableId!;
                              final String rightId = _assignment[cableId]!;
                              _animateReturn(cableId, rightId);
                            }
                          },
                          child: RepaintBoundary(
                            key: const ValueKey<String>('cable_untangle_board'),
                            child: AnimatedBuilder(
                              animation: _paintListenable,
                              builder: (BuildContext context, Widget? child) {
                                final Map<String, Offset> heads =
                                    <String, Offset>{};
                                final _BoardGeom geom = _BoardGeom.from(
                                  puzzle,
                                  boardSize,
                                );
                                for (final CableUntangleCable cable
                                    in puzzle.cables) {
                                  heads[cable.id] = _visualHeadNorm(
                                    cable.id,
                                    geom,
                                  );
                                }
                                return CustomPaint(
                                  size: boardSize,
                                  painter: _CableUntanglePainter(
                                    puzzle: puzzle,
                                    assignment: _assignment,
                                    headsNorm: heads,
                                    draggingCableId: _draggingCableId,
                                    hoverRightSocketId: _hoverRightSocketId,
                                    emptyRightSocketId: _draggingCableId == null
                                        ? null
                                        : _assignment[_draggingCableId!],
                                    dragPulse: _dragHighlightController.value,
                                    swapT: _swapController.value,
                                    settleT: _settleController.value,
                                    completionT: _completionController.value,
                                    settlingCableIds: Set<String>.from(
                                      _settlingCableIds,
                                    ),
                                    settlePhase: Map<String, double>.from(
                                      _settlePhase,
                                    ),
                                    background: _hex(
                                      puzzle.theme.backgroundColor,
                                      const Color(0xFF07131D),
                                    ),
                                    grid: _hex(
                                      puzzle.theme.gridColor,
                                      const Color(0xFF143143),
                                    ),
                                    cable: _hex(
                                      puzzle.theme.cableColor,
                                      const Color(0xFF69E7FF),
                                    ),
                                    cableCore: _hex(
                                      puzzle.theme.cableCoreColor,
                                      const Color(0xFFE8FCFF),
                                    ),
                                    socket: _hex(
                                      puzzle.theme.socketColor,
                                      const Color(0xFF91EFFF),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _BoardGeom {
  _BoardGeom._({
    required this.puzzle,
    required this.size,
    required this.leftX,
    required this.rightX,
    required this.top,
    required this.bottom,
  });

  factory _BoardGeom.from(CableUntanglePuzzle puzzle, Size size) {
    double leftX = puzzle.layout.leftColumnX;
    double rightX = puzzle.layout.rightColumnX;
    if (puzzle.mirrorHorizontally) {
      leftX = 1.0 - puzzle.layout.rightColumnX;
      rightX = 1.0 - puzzle.layout.leftColumnX;
    }
    return _BoardGeom._(
      puzzle: puzzle,
      size: size,
      leftX: leftX,
      rightX: rightX,
      top: puzzle.layout.topPadding,
      bottom: 1.0 - puzzle.layout.bottomPadding,
    );
  }

  final CableUntanglePuzzle puzzle;
  final Size size;
  final double leftX;
  final double rightX;
  final double top;
  final double bottom;

  Offset toNorm(Offset local) =>
      Offset(local.dx / size.width, local.dy / size.height);

  Offset toLocal(Offset norm) =>
      Offset(norm.dx * size.width, norm.dy * size.height);

  double _yForOrder(int order, int count) {
    if (count <= 1) return (top + bottom) * 0.5;
    final double t = order / (count - 1);
    return ui.lerpDouble(top, bottom, t)!;
  }

  Offset leftSocketNorm(String id) {
    final CableUntangleSocket socket = puzzle.leftSockets.firstWhere(
      (CableUntangleSocket s) => s.id == id,
    );
    return Offset(leftX, _yForOrder(socket.order, puzzle.leftSockets.length));
  }

  Offset rightSocketNorm(String id) {
    final CableUntangleSocket socket = puzzle.rightSockets.firstWhere(
      (CableUntangleSocket s) => s.id == id,
    );
    return Offset(rightX, _yForOrder(socket.order, puzzle.rightSockets.length));
  }
}

class _CableUntanglePainter extends CustomPainter {
  _CableUntanglePainter({
    required this.puzzle,
    required this.assignment,
    required this.headsNorm,
    required this.draggingCableId,
    required this.hoverRightSocketId,
    required this.emptyRightSocketId,
    required this.dragPulse,
    required this.swapT,
    required this.settleT,
    required this.completionT,
    required this.settlingCableIds,
    required this.settlePhase,
    required this.background,
    required this.grid,
    required this.cable,
    required this.cableCore,
    required this.socket,
  });

  final CableUntanglePuzzle puzzle;
  final Map<String, String> assignment;
  final Map<String, Offset> headsNorm;
  final String? draggingCableId;
  final String? hoverRightSocketId;
  final String? emptyRightSocketId;
  final double dragPulse;
  final double swapT;
  final double settleT;
  final double completionT;
  final Set<String> settlingCableIds;
  final Map<String, double> settlePhase;
  final Color background;
  final Color grid;
  final Color cable;
  final Color cableCore;
  final Color socket;

  @override
  void paint(Canvas canvas, Size size) {
    final _BoardGeom geom = _BoardGeom.from(puzzle, size);
    final RRect board = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(18),
    );
    canvas.drawRRect(board, Paint()..color = background);
    canvas.save();
    canvas.clipRRect(board);
    _drawGrid(canvas, size);

    final List<_CableDraw> draws = <_CableDraw>[];
    for (final CableUntangleCable c in puzzle.cables) {
      final Offset start = geom.toLocal(geom.leftSocketNorm(c.leftSocketId));
      final Offset end = geom.toLocal(
        headsNorm[c.id] ?? geom.rightSocketNorm(assignment[c.id]!),
      );
      draws.add(
        _CableDraw(
          id: c.id,
          start: start,
          end: end,
          selected: c.id == draggingCableId,
        ),
      );
    }

    // Draw unselected cables first, selected on top.
    draws.sort((_CableDraw a, _CableDraw b) {
      if (a.selected == b.selected) return 0;
      return a.selected ? 1 : -1;
    });

    for (final _CableDraw d in draws) {
      _drawCable(canvas, size, d);
    }

    for (final CableUntangleSocket s in puzzle.leftSockets) {
      _drawSocket(
        canvas,
        geom.toLocal(geom.leftSocketNorm(s.id)),
        filled: true,
      );
    }
    for (final CableUntangleSocket s in puzzle.rightSockets) {
      final bool empty = s.id == emptyRightSocketId;
      final bool hover = s.id == hoverRightSocketId;
      _drawSocket(
        canvas,
        geom.toLocal(geom.rightSocketNorm(s.id)),
        filled: !empty,
        hover: hover,
      );
    }

    for (final _CableDraw d in draws) {
      _drawHead(canvas, d.end, selected: d.selected);
    }

    canvas.restore();
  }

  void _drawGrid(Canvas canvas, Size size) {
    final Paint p = Paint()
      ..color = grid.withValues(alpha: 0.55)
      ..strokeWidth = 1;
    const int cols = 6;
    const int rows = 10;
    for (int i = 1; i < cols; i += 1) {
      final double x = size.width * i / cols;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), p);
    }
    for (int i = 1; i < rows; i += 1) {
      final double y = size.height * i / rows;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), p);
    }
  }

  Path _cablePath(Offset start, Offset end) {
    final double dx = end.dx - start.dx;
    final Offset c1 = Offset(
      start.dx + dx * kCableUntangleBezierControlRatio,
      start.dy,
    );
    final Offset c2 = Offset(
      end.dx - dx * kCableUntangleBezierControlRatio,
      end.dy,
    );
    return Path()
      ..moveTo(start.dx, start.dy)
      ..cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, end.dx, end.dy);
  }

  void _drawCable(Canvas canvas, Size size, _CableDraw d) {
    final Path path = _cablePath(d.start, d.end);
    final double completionBoost = _completionGlowFor(d.id);
    final double selectBoost = d.selected ? 0.18 + dragPulse * 0.12 : 0;
    final double wobbleBoost = settlingCableIds.contains(d.id)
        ? (1 - settleT) * 0.08
        : 0;
    final double glowAlpha =
        (0.22 + selectBoost + completionBoost + wobbleBoost).clamp(0.0, 0.7);

    // Shadow
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.black.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = d.selected ? 14 : 11
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );

    // Soft glow (board already clipped; avoid saveLayer)
    canvas.drawPath(
      path,
      Paint()
        ..color = cable.withValues(alpha: glowAlpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = d.selected ? 16 : 13
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );

    // Body
    canvas.drawPath(
      path,
      Paint()
        ..color =
            Color.lerp(
              cable,
              cableCore,
              selectBoost,
            )?.withValues(alpha: 0.95) ??
            cable
        ..style = PaintingStyle.stroke
        ..strokeWidth = d.selected ? 7.5 : 6.2
        ..strokeCap = StrokeCap.round,
    );

    // Highlight
    canvas.drawPath(
      path,
      Paint()
        ..color = cableCore.withValues(alpha: d.selected ? 0.9 : 0.7)
        ..style = PaintingStyle.stroke
        ..strokeWidth = d.selected ? 2.4 : 1.8
        ..strokeCap = StrokeCap.round,
    );

    if (d.selected) {
      // Moving highlight along the cable while dragging.
      final ui.PathMetrics metrics = path.computeMetrics();
      for (final ui.PathMetric metric in metrics) {
        final double pos = (metric.length * ((dragPulse + swapT) % 1.0)).clamp(
          0,
          metric.length,
        );
        final ui.Tangent? tangent = metric.getTangentForOffset(pos);
        if (tangent == null) continue;
        canvas.drawCircle(
          tangent.position,
          3.2,
          Paint()..color = Colors.white.withValues(alpha: 0.85),
        );
      }
    }

    if (settlingCableIds.contains(d.id) && settleT < 1) {
      // Extra lateral wobble of the body near the right endpoint.
      final double damp = math.exp(-4.2 * settleT);
      final double phase = settlePhase[d.id] ?? 0;
      final double amp = math.sin(settleT * math.pi * 5 + phase) * damp * 5.5;
      final Path wobble = _cablePath(d.start, Offset(d.end.dx, d.end.dy));
      // Offset control points slightly via a parallel stroke illusion.
      canvas.drawPath(
        wobble.shift(Offset(0, amp * 0.35)),
        Paint()
          ..color = cable.withValues(alpha: 0.12 * damp)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 8
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  double _completionGlowFor(String cableId) {
    if (completionT <= 0) return 0;
    final int index = puzzle.cables.indexWhere(
      (CableUntangleCable c) => c.id == cableId,
    );
    if (index < 0) return 0;
    final double wave = (completionT * puzzle.cables.length) - index;
    if (wave < 0 || wave > 1.6) return completionT * 0.08;
    final double pulse = math.sin((wave.clamp(0.0, 1.0)) * math.pi);
    return 0.12 + pulse * 0.35;
  }

  void _drawSocket(
    Canvas canvas,
    Offset center, {
    required bool filled,
    bool hover = false,
  }) {
    final double pulse = hover ? 1.12 : (1.0 + completionT * 0.08);
    final double r = 14 * pulse;

    canvas.drawCircle(
      center,
      r + 8,
      Paint()
        ..color = socket.withValues(alpha: hover ? 0.28 : 0.14)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawCircle(
      center,
      r + 3,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = const Color(0xFF6A7F8C).withValues(alpha: 0.9),
    );
    canvas.drawCircle(
      center,
      r,
      Paint()
        ..shader = ui.Gradient.radial(center, r, <Color>[
          const Color(0xFF1A2A35),
          const Color(0xFF0B1620),
        ]),
    );
    canvas.drawCircle(
      center,
      r - 3,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = socket.withValues(alpha: 0.55),
    );
    if (filled) {
      canvas.drawCircle(
        center,
        r * 0.38,
        Paint()..color = socket.withValues(alpha: 0.85),
      );
    } else {
      canvas.drawCircle(
        center,
        r * 0.28,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.4
          ..color = socket.withValues(alpha: 0.35),
      );
    }
  }

  void _drawHead(Canvas canvas, Offset center, {required bool selected}) {
    final double scale = selected ? 1.16 : 1.0;
    final double r = 11 * scale;
    canvas.drawCircle(
      center,
      r + 5,
      Paint()
        ..color = cable.withValues(alpha: selected ? 0.35 : 0.18)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    canvas.drawCircle(
      center,
      r,
      Paint()
        ..shader = ui.Gradient.radial(
          center,
          r,
          <Color>[cableCore, cable, cable.withValues(alpha: 0.85)],
          <double>[0, 0.55, 1],
        ),
    );
    canvas.drawCircle(
      center,
      r * 0.35,
      Paint()..color = Colors.white.withValues(alpha: selected ? 0.9 : 0.65),
    );
  }

  @override
  bool shouldRepaint(covariant _CableUntanglePainter oldDelegate) {
    return oldDelegate.assignment != assignment ||
        oldDelegate.headsNorm != headsNorm ||
        oldDelegate.draggingCableId != draggingCableId ||
        oldDelegate.hoverRightSocketId != hoverRightSocketId ||
        oldDelegate.emptyRightSocketId != emptyRightSocketId ||
        oldDelegate.dragPulse != dragPulse ||
        oldDelegate.swapT != swapT ||
        oldDelegate.settleT != settleT ||
        oldDelegate.completionT != completionT ||
        oldDelegate.settlingCableIds != settlingCableIds;
  }
}

class _CableDraw {
  const _CableDraw({
    required this.id,
    required this.start,
    required this.end,
    required this.selected,
  });

  final String id;
  final Offset start;
  final Offset end;
  final bool selected;
}
