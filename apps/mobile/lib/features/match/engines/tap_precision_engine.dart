import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

enum _TargetShape { circle, diamond, square, triangle }

class TapPrecisionEngine implements ChallengeEngine {
  @override
  String get engineId => 'tap.precision';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _PrecisionTapWidget(challengeContext: challengeContext);
  }
}

class _MovingTarget {
  _MovingTarget({
    required this.id,
    required this.x,
    required this.y,
    required this.vx,
    required this.vy,
    required this.shape,
  });

  final String id;
  double x;
  double y;
  double vx;
  double vy;
  final _TargetShape shape;
}

class _PrecisionTapWidget extends StatefulWidget {
  const _PrecisionTapWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_PrecisionTapWidget> createState() => _PrecisionTapWidgetState();
}

class _PrecisionTapWidgetState extends State<_PrecisionTapWidget>
    with SingleTickerProviderStateMixin {
  final List<String> _tapped = <String>[];
  late final List<_MovingTarget> _targets;
  late final AnimationController _ticker;
  DateTime _lastTick = DateTime.now();

  static int _seedFrom(String raw) {
    int h = 2166136261;
    for (int i = 0; i < raw.length; i++) {
      h ^= raw.codeUnitAt(i);
      h = (h * 16777619) & 0x7fffffff;
    }
    return h == 0 ? 1 : h;
  }

  @override
  void initState() {
    super.initState();
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final List<dynamic> rawTargets =
        (cfg['targets'] as List<dynamic>?) ?? <dynamic>[];
    final String seedKey =
        widget.challengeContext.challenge.challengeInstanceId.isNotEmpty
            ? widget.challengeContext.challenge.challengeInstanceId
            : '${widget.challengeContext.challenge.definitionId}:${widget.challengeContext.challenge.startsAtMs}';
    final math.Random rng = math.Random(_seedFrom(seedKey));
    final List<_TargetShape> shapes = _TargetShape.values.toList()
      ..shuffle(rng);
    final _TargetShape roomShape = shapes.first;
    final double speedMin = (cfg['speedMin'] as num?)?.toDouble() ?? 0.18;
    final double speedMaxRaw = (cfg['speedMax'] as num?)?.toDouble() ?? 0.40;
    final double speedMax = speedMaxRaw < speedMin ? speedMin : speedMaxRaw;

    _targets = <_MovingTarget>[];
    for (final dynamic raw in rawTargets) {
      if (raw is! Map) continue;
      final String? id = raw['id'] as String?;
      if (id == null) continue;
      final double x = (raw['x'] as num?)?.toDouble() ?? 0.5;
      final double y = (raw['y'] as num?)?.toDouble() ?? 0.5;
      // Room-shared velocities from the same seed.
      final double speed = speedMin + rng.nextDouble() * (speedMax - speedMin);
      final double angle = rng.nextDouble() * math.pi * 2;
      _targets.add(
        _MovingTarget(
          id: id,
          x: x.clamp(0.12, 0.88),
          y: y.clamp(0.18, 0.82),
          vx: math.cos(angle) * speed,
          vy: math.sin(angle) * speed,
          shape: roomShape,
        ),
      );
    }

    _ticker = AnimationController(
      vsync: this,
      duration: const Duration(hours: 1),
    )..addListener(_onTick);
    _lastTick = DateTime.now();
    _ticker.repeat();
  }

  void _onTick() {
    final DateTime now = DateTime.now();
    final double dt =
        (now.difference(_lastTick).inMicroseconds / 1e6).clamp(0.0, 0.05);
    _lastTick = now;
    if (dt <= 0 || _tapped.length >= _attemptCount) return;
    setState(() {
      for (final _MovingTarget t in _targets) {
        if (_tapped.contains(t.id)) continue;
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        if (t.x < 0.08 || t.x > 0.92) {
          t.vx = -t.vx;
          t.x = t.x.clamp(0.08, 0.92);
        }
        if (t.y < 0.12 || t.y > 0.88) {
          t.vy = -t.vy;
          t.y = t.y.clamp(0.12, 0.88);
        }
      }
    });
  }

  int get _attemptCount {
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    return (cfg['attemptCount'] as num?)?.toInt() ?? 1;
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;

    return Column(
      children: <Widget>[
        const SizedBox(height: 28),
        ChallengeCountdown(
          challenge: widget.challengeContext.challenge,
          estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
          ringColor: LhColors.success,
        ),
        const SizedBox(height: 12),
        Text(
          resolver.resolve(promptKey),
          style: Theme.of(context).textTheme.titleMedium,
          textAlign: TextAlign.center,
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              return Stack(
                fit: StackFit.expand,
                children: <Widget>[
                  for (final _MovingTarget target in _targets)
                    Positioned(
                      left: target.x * constraints.maxWidth - 28,
                      top: target.y * constraints.maxHeight - 28,
                      child: Semantics(
                        button: true,
                        label: target.id,
                        child: GestureDetector(
                          onTap: widget.challengeContext.isInteractionLocked
                              ? null
                              : () {
                                  if (_tapped.contains(target.id)) return;
                                  setState(() => _tapped.add(target.id));
                                  if (_tapped.length >= _attemptCount) {
                                    widget.challengeContext.onSubmit(
                                      <String, dynamic>{
                                        'tappedTargetIds':
                                            List<String>.from(_tapped),
                                      },
                                    );
                                  }
                                },
                          child: AnimatedScale(
                            scale: _tapped.contains(target.id) ? 0.85 : 1,
                            duration: const Duration(milliseconds: 120),
                            child: CustomPaint(
                              size: const Size(56, 56),
                              painter: _TargetPainter(
                                shape: target.shape,
                                hit: _tapped.contains(target.id),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

class _TargetPainter extends CustomPainter {
  const _TargetPainter({required this.shape, required this.hit});

  final _TargetShape shape;
  final bool hit;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = hit ? LhColors.success : LhColors.primaryBright
      ..style = PaintingStyle.fill;
    final Paint glow = Paint()
      ..color = (hit ? LhColors.success : LhColors.primary).withValues(
        alpha: 0.35,
      )
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
    final Offset c = Offset(size.width / 2, size.height / 2);
    final double r = size.shortestSide / 2 - 2;
    final Path path = switch (shape) {
      _TargetShape.circle => (Path()..addOval(Rect.fromCircle(center: c, radius: r))),
      _TargetShape.square => Path()
        ..addRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(center: c, width: r * 1.6, height: r * 1.6),
            const Radius.circular(8),
          ),
        ),
      _TargetShape.diamond => Path()
        ..moveTo(c.dx, c.dy - r)
        ..lineTo(c.dx + r, c.dy)
        ..lineTo(c.dx, c.dy + r)
        ..lineTo(c.dx - r, c.dy)
        ..close(),
      _TargetShape.triangle => Path()
        ..moveTo(c.dx, c.dy - r)
        ..lineTo(c.dx + r, c.dy + r * 0.85)
        ..lineTo(c.dx - r, c.dy + r * 0.85)
        ..close(),
    };
    canvas.drawPath(path, glow);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _TargetPainter oldDelegate) {
    return oldDelegate.shape != shape || oldDelegate.hit != hit;
  }
}
