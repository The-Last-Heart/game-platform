import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../state/match_snapshot.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

/// Mirror of Deception — مرآة الخداع (`focus.vertical_reflection`).
///
/// Renders server-driven normalized geometry. Never draws a reflection on the
/// empty half of the puzzle board before authoritative resolution.
class VerticalReflectionEngine implements ChallengeEngine {
  @override
  String get engineId => 'focus.vertical_reflection';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _VerticalReflectionWidget(challengeContext: challengeContext);
  }
}

class _VrPoint {
  const _VrPoint(this.x, this.y);
  final double x;
  final double y;
}

class _VrMarker {
  const _VrMarker({
    required this.id,
    required this.type,
    required this.center,
    required this.size,
    required this.colorRole,
    this.direction,
  });

  final String id;
  final String type;
  final _VrPoint center;
  final double size;
  final String colorRole;
  final _VrPoint? direction;
}

class _VrShape {
  const _VrShape({required this.polygons, required this.markers});

  final List<List<_VrPoint>> polygons;
  final List<_VrMarker> markers;

  /// Count of polygon silhouettes (used by answer-leak tests).
  int get silhouetteCount => polygons.length;
}

class _VrCandidate {
  const _VrCandidate({required this.id, required this.shape});
  final String id;
  final _VrShape shape;
}

_VrPoint? _parsePoint(Object? raw) {
  if (raw is! Map) return null;
  final Object? x = raw['x'];
  final Object? y = raw['y'];
  if (x is! num || y is! num) return null;
  if (!x.isFinite || !y.isFinite) return null;
  return _VrPoint(x.toDouble().clamp(0.0, 1.0), y.toDouble().clamp(0.0, 1.0));
}

_VrPoint? _parseDirection(Object? raw) {
  if (raw is! Map) return null;
  final Object? x = raw['x'];
  final Object? y = raw['y'];
  if (x is! num || y is! num) return null;
  if (!x.isFinite || !y.isFinite) return null;
  return _VrPoint(x.toDouble(), y.toDouble());
}

_VrShape? _parseShape(Object? raw) {
  if (raw is! Map) return null;
  final Object? polysRaw = raw['polygons'];
  if (polysRaw is! List || polysRaw.isEmpty) return null;
  final List<List<_VrPoint>> polygons = <List<_VrPoint>>[];
  for (final Object? polyRaw in polysRaw) {
    if (polyRaw is! Map) continue;
    final Object? ptsRaw = polyRaw['points'];
    if (ptsRaw is! List) continue;
    final List<_VrPoint> pts = <_VrPoint>[];
    for (final Object? p in ptsRaw) {
      final _VrPoint? pt = _parsePoint(p);
      if (pt != null) pts.add(pt);
    }
    if (pts.length >= 3) polygons.add(pts);
  }
  if (polygons.isEmpty) return null;
  final List<_VrMarker> markers = <_VrMarker>[];
  final Object? markersRaw = raw['markers'];
  if (markersRaw is List) {
    for (final Object? m in markersRaw) {
      if (m is! Map) continue;
      final _VrPoint? center = _parsePoint(m['center']);
      final Object? id = m['id'];
      final Object? type = m['type'];
      final Object? size = m['size'];
      final Object? colorRole = m['colorRole'];
      if (center == null || id is! String || type is! String) continue;
      final _VrPoint? direction = _parseDirection(m['direction']);
      markers.add(
        _VrMarker(
          id: id,
          type: type,
          center: center,
          size: size is num ? size.toDouble().clamp(0.01, 0.35) : 0.06,
          colorRole: colorRole is String ? colorRole : 'accent',
          direction: direction,
        ),
      );
    }
  }
  return _VrShape(polygons: polygons, markers: markers);
}

class _VerticalReflectionWidget extends StatefulWidget {
  const _VerticalReflectionWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_VerticalReflectionWidget> createState() =>
      _VerticalReflectionWidgetState();
}

class _VerticalReflectionWidgetState extends State<_VerticalReflectionWidget>
    with TickerProviderStateMixin {
  bool _submitted = false;
  String? _selectedId;
  late final AnimationController _entrance;
  late final AnimationController _axisPulse;
  bool _entranceStarted = false;

  ChallengeContext get _ctx => widget.challengeContext;

  Map<String, dynamic> get _cfg => _ctx.challenge.clientConfig;

  _VrShape? get _sourceShape => _parseShape(_cfg['sourceShape']);

  String get _sourceSide {
    final Object? raw = _cfg['sourceSide'];
    return raw == 'right' ? 'right' : 'left';
  }

  List<_VrCandidate> get _candidates {
    final Object? raw = _cfg['candidates'];
    if (raw is! List) return const <_VrCandidate>[];
    final List<_VrCandidate> out = <_VrCandidate>[];
    for (final Object? entry in raw) {
      if (entry is! Map) continue;
      final Object? id = entry['id'];
      final _VrShape? shape = _parseShape(entry['shape']);
      if (id is! String || shape == null) continue;
      out.add(_VrCandidate(id: id, shape: shape));
    }
    return out;
  }

  bool get _reduceMotion => MediaQuery.disableAnimationsOf(context);

  bool get _timedOut => _ctx.localOutcome == 'timeout';

  @override
  void initState() {
    super.initState();
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _axisPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    // Reconnect: skip entrance when already mid-round / submitted.
    final bool skipEntrance =
        _ctx.answerStatus == AnswerSubmissionStatus.confirmed ||
        _ctx.answerStatus == AnswerSubmissionStatus.pending ||
        _ctx.localOutcome != null;
    if (skipEntrance) {
      _entrance.value = 1;
      _submitted =
          _ctx.answerStatus == AnswerSubmissionStatus.confirmed ||
          _ctx.answerStatus == AnswerSubmissionStatus.pending;
    } else {
      _entranceStarted = true;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_entranceStarted && _entrance.value == 0 && !_reduceMotion) {
      _entrance.forward();
      _axisPulse.repeat(reverse: true);
    } else if (_entranceStarted && _entrance.value == 0 && _reduceMotion) {
      _entrance.value = 1;
    } else if (!_reduceMotion &&
        _entrance.value >= 1 &&
        !_axisPulse.isAnimating &&
        _ctx.localOutcome == null) {
      _axisPulse.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant _VerticalReflectionWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_ctx.answerStatus == AnswerSubmissionStatus.confirmed ||
        _ctx.answerStatus == AnswerSubmissionStatus.pending) {
      _submitted = true;
    }
    if (_ctx.localOutcome != null) {
      _axisPulse.stop();
    }
  }

  @override
  void dispose() {
    _entrance.dispose();
    _axisPulse.dispose();
    super.dispose();
  }

  void _onSelect(String candidateId) {
    if (_ctx.isInteractionLocked || _submitted || _timedOut) return;
    setState(() {
      _submitted = true;
      _selectedId = candidateId;
    });
    _ctx.onSubmit(<String, dynamic>{'chosenOptionKey': candidateId});
  }

  Color _markerColor(String role) {
    switch (role) {
      case 'primary':
        return LhColors.primary;
      case 'secondary':
        return LhColors.success;
      default:
        return LhColors.warning;
    }
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final _VrShape? source = _sourceShape;
    final List<_VrCandidate> candidates = _candidates;
    final String title = () {
      final Object? pinned = _cfg['titleText'];
      if (pinned is String && pinned.trim().isNotEmpty) return pinned.trim();
      return resolver.resolve(
        (_cfg['titleKey'] as String?) ?? 'challenge.vertical_reflection.title',
      );
    }();
    final String instruction = () {
      final Object? pinned = _cfg['instructionText'];
      if (pinned is String && pinned.trim().isNotEmpty) return pinned.trim();
      return resolver.resolve(
        (_cfg['instructionKey'] as String?) ??
            'challenge.vertical_reflection.instruction',
      );
    }();

    // Clear ChallengePlayView header chrome (hearts / energy / round).
    const double topClearance = 52;

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, topClearance, 4, 8),
      child: AnimatedBuilder(
        animation: Listenable.merge(<Listenable>[_entrance, _axisPulse]),
        builder: (BuildContext context, Widget? _) {
          // Read animation values HERE — not in the outer build — or the
          // board silhouette stays at opacity 0 while the axis still paints.
          final double entranceT = _reduceMotion ? 1.0 : _entrance.value;
          final double pulseT = _reduceMotion ? 0.0 : _axisPulse.value;

          return LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              const double gap = 10;
              const double countdownSize = 64;
              final double availW = constraints.maxWidth;
              final double boardSide = math.min(availW * 0.92, 250.0);
              final double optionCell = math.min((availW - 10) / 2, 108.0);
              final double optionsHeight = optionCell * 2 + 10;

              // Scale the whole block down on short screens; keep it centered.
              return FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.center,
                child: SizedBox(
                  width: availW,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      ChallengeCountdown(
                        challenge: _ctx.challenge,
                        estimateServerNowMs: _ctx.estimateServerNowMs,
                        size: countdownSize,
                        ringColor: LhColors.success,
                      ),
                      const SizedBox(height: 6),
                      Opacity(
                        opacity: entranceT,
                        child: Column(
                          children: <Widget>[
                            Text(
                              title,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.headlineMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: LhColors.text,
                                  ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              instruction,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: LhColors.textMuted),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: boardSide,
                        height: boardSide,
                        child: RepaintBoundary(
                          child: Semantics(
                            label: resolver.resolve(
                              'challenge.vertical_reflection.a11y_board',
                            ),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: LhColors.surface.withValues(
                                  alpha: _timedOut ? 0.45 : 1,
                                ),
                                borderRadius: LhRadii.mdAll,
                                border: Border.all(
                                  color: LhColors.border,
                                  width: 1.6,
                                ),
                              ),
                              child: source == null
                                  ? const SizedBox.expand()
                                  : CustomPaint(
                                      painter: _ReflectionBoardPainter(
                                        source: source,
                                        sourceSide: _sourceSide,
                                        axisPulse: pulseT,
                                        reveal: entranceT,
                                        markerColor: _markerColor,
                                        // Never paint a reflected answer.
                                        paintReflectedGhost: false,
                                      ),
                                      child: const SizedBox.expand(),
                                    ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: gap),
                      SizedBox(
                        width: availW,
                        height: optionsHeight,
                        child: RepaintBoundary(
                          child: GridView.builder(
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2,
                                  crossAxisSpacing: 10,
                                  mainAxisSpacing: 10,
                                  mainAxisExtent: optionCell,
                                ),
                            itemCount: candidates.length.clamp(0, 4),
                            itemBuilder: (BuildContext context, int index) {
                              final _VrCandidate candidate = candidates[index];
                              final bool selected =
                                  _selectedId == candidate.id;
                              final String? outcome = _ctx.localOutcome;
                              final bool showCorrect =
                                  selected && outcome == 'success';
                              final bool showIncorrect =
                                  selected &&
                                  (outcome == 'failure' ||
                                      outcome == 'wrong');
                              return Semantics(
                                button: true,
                                enabled:
                                    !_ctx.isInteractionLocked && !_submitted,
                                label: resolver.resolve(
                                  'challenge.vertical_reflection.a11y_option',
                                  params: <String, String>{
                                    'index': '${index + 1}',
                                  },
                                ),
                                child: _CandidateCard(
                                  shape: candidate.shape,
                                  pressed: selected && outcome == null,
                                  pending:
                                      selected &&
                                      _ctx.answerStatus ==
                                          AnswerSubmissionStatus.pending,
                                  correct: showCorrect,
                                  incorrect: showIncorrect,
                                  disabled:
                                      _timedOut ||
                                      (_submitted && !selected),
                                  markerColor: _markerColor,
                                  onTap: () => _onSelect(candidate.id),
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _CandidateCard extends StatefulWidget {
  const _CandidateCard({
    required this.shape,
    required this.pressed,
    required this.pending,
    required this.correct,
    required this.incorrect,
    required this.disabled,
    required this.markerColor,
    required this.onTap,
  });

  final _VrShape shape;
  final bool pressed;
  final bool pending;
  final bool correct;
  final bool incorrect;
  final bool disabled;
  final Color Function(String role) markerColor;
  final VoidCallback onTap;

  @override
  State<_CandidateCard> createState() => _CandidateCardState();
}

class _CandidateCardState extends State<_CandidateCard> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    Color border = LhColors.border;
    Color fill = LhColors.elevated;
    if (widget.correct) {
      border = LhColors.success;
      fill = LhColors.success.withValues(alpha: 0.12);
    } else if (widget.incorrect) {
      border = LhColors.primary;
      fill = LhColors.primary.withValues(alpha: 0.12);
    } else if (widget.pending || widget.pressed || _down) {
      border = LhColors.success;
    }
    return Opacity(
      opacity: widget.disabled ? 0.45 : 1,
      child: GestureDetector(
        onTapDown: widget.disabled
            ? null
            : (_) => setState(() => _down = true),
        onTapCancel: () => setState(() => _down = false),
        onTapUp: widget.disabled
            ? null
            : (_) {
                setState(() => _down = false);
                widget.onTap();
              },
        child: AnimatedScale(
          scale: _down ? 0.96 : 1,
          duration: const Duration(milliseconds: 90),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            decoration: BoxDecoration(
              color: fill,
              borderRadius: LhRadii.mdAll,
              border: Border.all(color: border, width: 1.8),
            ),
            child: CustomPaint(
              painter: _ShapePainter(
                shape: widget.shape,
                markerColor: widget.markerColor,
                pad: 0.12,
              ),
              child: const SizedBox.expand(),
            ),
          ),
        ),
      ),
    );
  }
}

class _ReflectionBoardPainter extends CustomPainter {
  _ReflectionBoardPainter({
    required this.source,
    required this.sourceSide,
    required this.axisPulse,
    required this.reveal,
    required this.markerColor,
    required this.paintReflectedGhost,
  });

  final _VrShape source;
  final String sourceSide;
  final double axisPulse;
  final double reveal;
  final Color Function(String role) markerColor;

  /// Must remain false for player boards — answer-leak guard.
  final bool paintReflectedGhost;

  @override
  void paint(Canvas canvas, Size size) {
    final double midX = size.width * 0.5;
    final Rect leftHalf = Rect.fromLTWH(0, 0, midX, size.height);
    final Rect rightHalf = Rect.fromLTWH(midX, 0, midX, size.height);
    final Rect sourceRect = sourceSide == 'right' ? rightHalf : leftHalf;

    // Axis
    final Paint axisPaint = Paint()
      ..color = LhColors.success.withValues(
        alpha: 0.45 + 0.25 * axisPulse,
      )
      ..strokeWidth = 2.2
      ..style = PaintingStyle.stroke;
    canvas.drawLine(
      Offset(midX, size.height * 0.08),
      Offset(midX, size.height * 0.92),
      axisPaint,
    );
    final Paint cap = Paint()..color = LhColors.success;
    canvas.drawCircle(Offset(midX, size.height * 0.08), 3.5, cap);
    canvas.drawCircle(Offset(midX, size.height * 0.92), 3.5, cap);

    // Source only — never paint into the empty half.
    // Keep unit-square aspect so the silhouette matches option tiles.
    canvas.save();
    canvas.clipRect(sourceRect.inflate(1));
    final Rect drawRect = _squareContentRect(sourceRect, insetFraction: 0.08);
    _paintShape(
      canvas,
      source,
      drawRect,
      markerColor,
      opacity: reveal.clamp(0.0, 1.0),
    );
    canvas.restore();

    assert(() {
      // Dev-only: ensure ghost flag stays off on player boards.
      if (paintReflectedGhost) {
        throw FlutterError(
          'vertical_reflection board must not paint reflected ghosts',
        );
      }
      return true;
    }());
  }

  @override
  bool shouldRepaint(covariant _ReflectionBoardPainter oldDelegate) {
    return oldDelegate.axisPulse != axisPulse ||
        oldDelegate.reveal != reveal ||
        oldDelegate.source != source ||
        oldDelegate.sourceSide != sourceSide ||
        oldDelegate.paintReflectedGhost != paintReflectedGhost;
  }
}

class _ShapePainter extends CustomPainter {
  _ShapePainter({
    required this.shape,
    required this.markerColor,
    this.pad = 0.08,
  });

  final _VrShape shape;
  final Color Function(String role) markerColor;
  final double pad;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect bounds = Offset.zero & size;
    final Rect rect = _squareContentRect(bounds, insetFraction: pad);
    _paintShape(canvas, shape, rect, markerColor);
  }

  @override
  bool shouldRepaint(covariant _ShapePainter oldDelegate) {
    return oldDelegate.shape != shape;
  }
}

/// Map a unit-square shape into a square content frame centered in [bounds].
///
/// Critical: board halves are tall rectangles while option tiles are near-
/// square. Stretching the same [0,1]² coords into both makes the correct
/// vertical reflection look like a different silhouette.
@visibleForTesting
Rect squareContentRectForTest(Rect bounds, {double insetFraction = 0.1}) {
  return _squareContentRect(bounds, insetFraction: insetFraction);
}

Rect _squareContentRect(Rect bounds, {double insetFraction = 0.1}) {
  final double inset =
      math.min(bounds.width, bounds.height) * insetFraction.clamp(0.0, 0.35);
  final Rect inner = Rect.fromLTRB(
    bounds.left + inset,
    bounds.top + inset,
    bounds.right - inset,
    bounds.bottom - inset,
  );
  if (inner.width <= 0 || inner.height <= 0) {
    return bounds;
  }
  final double side = math.min(inner.width, inner.height);
  return Rect.fromCenter(center: inner.center, width: side, height: side);
}

void _paintShape(
  Canvas canvas,
  _VrShape shape,
  Rect rect,
  Color Function(String role) markerColor, {
  double opacity = 1,
}) {
  final Paint fill = Paint()
    ..color = LhColors.success.withValues(alpha: 0.16 * opacity)
    ..style = PaintingStyle.fill;
  final Paint stroke = Paint()
    ..color = LhColors.success.withValues(alpha: 0.95 * opacity)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.4
    ..strokeJoin = StrokeJoin.round;

  for (final List<_VrPoint> poly in shape.polygons) {
    final Path path = Path();
    for (int i = 0; i < poly.length; i += 1) {
      final Offset o = Offset(
        rect.left + poly[i].x * rect.width,
        rect.top + poly[i].y * rect.height,
      );
      if (i == 0) {
        path.moveTo(o.dx, o.dy);
      } else {
        path.lineTo(o.dx, o.dy);
      }
    }
    path.close();
    canvas.drawPath(path, fill);
    canvas.drawPath(path, stroke);
  }

  for (final _VrMarker m in shape.markers) {
    final Offset c = Offset(
      rect.left + m.center.x * rect.width,
      rect.top + m.center.y * rect.height,
    );
    final double r = m.size * math.min(rect.width, rect.height);
    final Color color = markerColor(m.colorRole).withValues(alpha: opacity);
    final double dirX = m.direction?.x ?? 0;
    final double dirY = m.direction?.y ?? -1;
    final double dirLen = math.sqrt(dirX * dirX + dirY * dirY);
    final double ux = dirLen > 1e-6 ? dirX / dirLen : 0;
    final double uy = dirLen > 1e-6 ? dirY / dirLen : -1;
    switch (m.type) {
      case 'ring':
        canvas.drawCircle(
          c,
          r,
          Paint()
            ..color = color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
        break;
      case 'short_line':
        // Orient along marker direction (fallback: horizontal).
        final double lx = (dirLen > 1e-6 ? -uy : 1) * r;
        final double ly = (dirLen > 1e-6 ? ux : 0) * r;
        canvas.drawLine(
          Offset(c.dx - lx, c.dy - ly),
          Offset(c.dx + lx, c.dy + ly),
          Paint()
            ..color = color
            ..strokeWidth = 2.5
            ..strokeCap = StrokeCap.round,
        );
        break;
      case 'small_triangle':
        // Tip points along direction (default: up).
        final Offset tip = Offset(c.dx + ux * r, c.dy + uy * r);
        final Offset left = Offset(
          c.dx - ux * r * 0.55 - uy * r * 0.9,
          c.dy - uy * r * 0.55 + ux * r * 0.9,
        );
        final Offset right = Offset(
          c.dx - ux * r * 0.55 + uy * r * 0.9,
          c.dy - uy * r * 0.55 - ux * r * 0.9,
        );
        final Path tri = Path()
          ..moveTo(tip.dx, tip.dy)
          ..lineTo(left.dx, left.dy)
          ..lineTo(right.dx, right.dy)
          ..close();
        canvas.drawPath(tri, Paint()..color = color);
        break;
      default:
        canvas.drawCircle(c, r, Paint()..color = color);
    }
  }
}

/// Test helper: counts silhouettes that would be painted on the source board
/// before resolution (must be exactly the source shape — never a ghost).
@visibleForTesting
int verticalReflectionBoardSilhouetteCount(Map<String, dynamic> clientConfig) {
  final _VrShape? source = _parseShape(clientConfig['sourceShape']);
  if (source == null) return 0;
  // Intentionally ignore any reflected payload if a buggy server sent one.
  return source.silhouetteCount;
}

@visibleForTesting
bool verticalReflectionBoardHasReflectedGhost(
  Map<String, dynamic> clientConfig,
) {
  // Player payload must not include a reflected preview shape.
  if (clientConfig.containsKey('reflectedShape')) return true;
  if (clientConfig.containsKey('ghostShape')) return true;
  if (clientConfig.containsKey('answerPreviewShape')) return true;
  return false;
}
