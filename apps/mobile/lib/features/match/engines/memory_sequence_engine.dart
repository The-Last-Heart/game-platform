import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class MemorySequenceEngine implements ChallengeEngine {
  @override
  String get engineId => 'memory.sequence';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _MemorySequenceWidget(challengeContext: challengeContext);
  }
}

enum _GlyphKind {
  circle,
  triangle,
  square,
  diamond,
  hexagon,
  pentagon,
  heart,
  star,
  bolt,
  moon,
  sun,
  cloud,
  cross,
  plus,
  ring,
  arrow,
  check,
  crescent,
}

class _MemorySequenceWidget extends StatefulWidget {
  const _MemorySequenceWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_MemorySequenceWidget> createState() => _MemorySequenceWidgetState();
}

class _MemorySequenceWidgetState extends State<_MemorySequenceWidget> {
  final List<String> _picked = <String>[];
  List<String> _sequenceKeys = const <String>[];
  List<String> _optionKeys = const <String>[
    'memory.glyph.circle',
    'memory.glyph.triangle',
    'memory.glyph.square',
    'memory.glyph.diamond',
  ];
  bool _previewComplete = false;

  static const List<Color> _palette = <Color>[
    Color(0xFFFF3045),
    Color(0xFF22E7F2),
    Color(0xFFFFC247),
    Color(0xFF9C27B0),
    Color(0xFF4CAF50),
    Color(0xFF2196F3),
  ];

  @override
  void initState() {
    super.initState();
    _syncFromChallenge(forceOptions: true);
  }

  @override
  void didUpdateWidget(covariant _MemorySequenceWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    final PublicChallenge was = oldWidget.challengeContext.challenge;
    final PublicChallenge now = widget.challengeContext.challenge;
    if (was.challengeInstanceId != now.challengeInstanceId) {
      _picked.clear();
      _previewComplete = false;
      _syncFromChallenge(forceOptions: true);
      return;
    }
    if (was.roundPhase != now.roundPhase) {
      _syncFromChallenge(forceOptions: true);
      if (now.roundPhase == RoundPhase.preview) {
        _picked.clear();
        _previewComplete = false;
      } else if (now.roundPhase == RoundPhase.answer) {
        setState(() => _previewComplete = true);
      }
    } else {
      _syncFromChallenge(forceOptions: false);
    }
  }

  void _syncFromChallenge({required bool forceOptions}) {
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final Object? seqRaw = cfg['previewSequence'];
    if (seqRaw is List && seqRaw.isNotEmpty) {
      _sequenceKeys = seqRaw.whereType<String>().toList(growable: false);
    }
    final Object? optRaw = cfg['optionKeys'];
    if (optRaw is List && optRaw.isNotEmpty) {
      _optionKeys = optRaw.whereType<String>().toList(growable: false);
    } else if (forceOptions && _optionKeys.isEmpty) {
      _optionKeys = const <String>[
        'memory.glyph.circle',
        'memory.glyph.triangle',
        'memory.glyph.square',
        'memory.glyph.diamond',
      ];
    }
  }

  int get _requiredLength =>
      _sequenceKeys.isNotEmpty ? _sequenceKeys.length : 4;

  int? get _previewDeadlineMs {
    final num? previewMsRaw =
        widget.challengeContext.challenge.clientConfig['previewMs'] as num?;
    final int previewMs = previewMsRaw?.toInt() ?? 4000;
    final int starts = widget.challengeContext.challenge.startsAtMs;
    if (starts <= 0) return null;
    return starts + previewMs;
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final PublicChallenge challenge = widget.challengeContext.challenge;
    final String promptKey =
        (challenge.clientConfig['promptKey'] as String?) ?? challenge.promptKey;

    final bool showAnswer =
        challenge.roundPhase == RoundPhase.answer || _previewComplete;

    return Column(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
          child: ChallengeCountdown(
            challenge: challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            size: 120,
            ringColor: showAnswer ? LhColors.success : LhColors.primary,
            deadlineOverrideMs: showAnswer ? null : _previewDeadlineMs,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            showAnswer
                ? resolver.resolve(promptKey)
                : resolver.resolve('challenge.memory.preview'),
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
        ),
        if (!showAnswer)
          Expanded(
            child: Column(
              children: <Widget>[
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: _sequenceKeys.isEmpty
                      ? Text(
                          resolver.resolve('challenge.memory.preview'),
                          style: Theme.of(context).textTheme.headlineSmall,
                        )
                      : Row(
                          children: <Widget>[
                            for (int i = 0; i < _sequenceKeys.length; i++)
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 3,
                                  ),
                                  child: TweenAnimationBuilder<double>(
                                    tween: Tween<double>(begin: 0, end: 1),
                                    duration: Duration(
                                      milliseconds: 280 + (i * 90),
                                    ),
                                    curve: Curves.easeOutBack,
                                    builder:
                                        (
                                          BuildContext context,
                                          double t,
                                          Widget? child,
                                        ) {
                                          return Opacity(
                                            opacity: t.clamp(0.0, 1.0),
                                            child: Transform.scale(
                                              scale: 0.7 + (0.3 * t),
                                              child: child,
                                            ),
                                          );
                                        },
                                    child: _GlyphTile(
                                      optionKey: _sequenceKeys[i],
                                      blank: false,
                                      palette: _palette,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                ),
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: Text(
                    resolver.resolve('challenge.memory.preview_footer'),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: LhColors.textMuted,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          )
        else
          Expanded(
            child: Column(
              children: <Widget>[
                const SizedBox(height: 12),
                Text(
                  resolver.resolve('challenge.memory.choose_one'),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: LhColors.textMuted,
                  ),
                ),
                const SizedBox(height: 16),
                if (_picked.isNotEmpty || _requiredLength > 0)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    child: Row(
                      children: <Widget>[
                        for (int i = 0; i < _requiredLength; i++)
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 3,
                              ),
                              child: _GlyphTile(
                                optionKey: i < _picked.length
                                    ? _picked[i]
                                    : null,
                                blank: i >= _picked.length,
                                palette: _palette,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                Expanded(
                  child: Center(
                    child: GridView.count(
                      shrinkWrap: true,
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 1.15,
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      children: <Widget>[
                        for (final String key in _optionKeys)
                          Material(
                            color: Colors.transparent,
                            child: InkWell(
                              borderRadius: BorderRadius.circular(18),
                              onTap: widget.challengeContext.isInteractionLocked
                                  ? null
                                  : () {
                                      setState(() => _picked.add(key));
                                      if (_picked.length >= _requiredLength) {
                                        widget.challengeContext.onSubmit(
                                          <String, dynamic>{
                                            'sequence': List<String>.from(
                                              _picked,
                                            ),
                                          },
                                        );
                                      }
                                    },
                              child: _GlyphTile(
                                optionKey: key,
                                blank: false,
                                palette: _palette,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    resolver.resolve(
                      'challenge.memory.progress',
                      params: <String, String>{
                        'current': '${_picked.length}',
                        'required': '$_requiredLength',
                      },
                    ),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: LhColors.textMuted,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _GlyphTile extends StatelessWidget {
  const _GlyphTile({
    required this.optionKey,
    required this.blank,
    required this.palette,
  });

  final String? optionKey;
  final bool blank;
  final List<Color> palette;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        decoration: BoxDecoration(
          color: LhColors.elevated.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: LhColors.border),
        ),
        child: blank || optionKey == null
            ? const SizedBox.shrink()
            : Center(
                child: CustomPaint(
                  size: const Size(42, 42),
                  painter: _GlyphPainter(
                    kind: _resolveGlyph(optionKey!),
                    color: _colorForKey(optionKey!, palette),
                  ),
                ),
              ),
      ),
    );
  }
}

_GlyphKind _resolveGlyph(String key) {
  switch (key) {
    case 'memory.glyph.circle':
    case 'memory.opt.a':
      return _GlyphKind.circle;
    case 'memory.glyph.triangle':
    case 'memory.opt.b':
      return _GlyphKind.triangle;
    case 'memory.glyph.square':
    case 'memory.opt.c':
      return _GlyphKind.square;
    case 'memory.glyph.diamond':
    case 'memory.opt.d':
      return _GlyphKind.diamond;
    case 'memory.glyph.hexagon':
      return _GlyphKind.hexagon;
    case 'memory.glyph.pentagon':
      return _GlyphKind.pentagon;
    case 'memory.glyph.heart':
      return _GlyphKind.heart;
    case 'memory.glyph.star':
      return _GlyphKind.star;
    case 'memory.glyph.bolt':
      return _GlyphKind.bolt;
    case 'memory.glyph.moon':
      return _GlyphKind.moon;
    case 'memory.glyph.sun':
      return _GlyphKind.sun;
    case 'memory.glyph.cloud':
      return _GlyphKind.cloud;
    case 'memory.glyph.cross':
      return _GlyphKind.cross;
    case 'memory.glyph.plus':
      return _GlyphKind.plus;
    case 'memory.glyph.ring':
      return _GlyphKind.ring;
    case 'memory.glyph.arrow':
      return _GlyphKind.arrow;
    case 'memory.glyph.check':
      return _GlyphKind.check;
    case 'memory.glyph.crescent':
      return _GlyphKind.crescent;
    default:
      return _GlyphKind.circle;
  }
}

Color _colorForKey(String key, List<Color> palette) {
  int hash = 0;
  for (final int unit in key.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return palette[hash % palette.length];
}

class _GlyphPainter extends CustomPainter {
  _GlyphPainter({required this.kind, required this.color});

  final _GlyphKind kind;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill
      ..strokeWidth = size.shortestSide * 0.14
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final Offset c = Offset(size.width / 2, size.height / 2);
    final double r = size.shortestSide / 2;

    switch (kind) {
      case _GlyphKind.circle:
        canvas.drawCircle(c, r * 0.92, paint);
      case _GlyphKind.triangle:
        canvas.drawPath(_poly(c, r, 3, -math.pi / 2), paint);
      case _GlyphKind.square:
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(center: c, width: r * 1.55, height: r * 1.55),
            const Radius.circular(4),
          ),
          paint,
        );
      case _GlyphKind.diamond:
        canvas.drawPath(_poly(c, r, 4, 0), paint);
      case _GlyphKind.hexagon:
        canvas.drawPath(_poly(c, r * 0.95, 6, 0), paint);
      case _GlyphKind.pentagon:
        canvas.drawPath(_poly(c, r * 0.95, 5, -math.pi / 2), paint);
      case _GlyphKind.heart:
        canvas.drawPath(_heart(c, r), paint);
      case _GlyphKind.star:
        canvas.drawPath(_star(c, r, 5), paint);
      case _GlyphKind.bolt:
        canvas.drawPath(_bolt(c, r), paint);
      case _GlyphKind.moon:
        canvas.drawPath(_moon(c, r), paint);
      case _GlyphKind.sun:
        _drawSun(canvas, c, r, paint);
      case _GlyphKind.cloud:
        canvas.drawPath(_cloud(c, r), paint);
      case _GlyphKind.cross:
        paint.style = PaintingStyle.stroke;
        canvas.drawLine(
          Offset(c.dx - r * 0.7, c.dy - r * 0.7),
          Offset(c.dx + r * 0.7, c.dy + r * 0.7),
          paint,
        );
        canvas.drawLine(
          Offset(c.dx + r * 0.7, c.dy - r * 0.7),
          Offset(c.dx - r * 0.7, c.dy + r * 0.7),
          paint,
        );
      case _GlyphKind.plus:
        paint.style = PaintingStyle.stroke;
        canvas.drawLine(
          Offset(c.dx, c.dy - r * 0.75),
          Offset(c.dx, c.dy + r * 0.75),
          paint,
        );
        canvas.drawLine(
          Offset(c.dx - r * 0.75, c.dy),
          Offset(c.dx + r * 0.75, c.dy),
          paint,
        );
      case _GlyphKind.ring:
        paint.style = PaintingStyle.stroke;
        paint.strokeWidth = size.shortestSide * 0.16;
        canvas.drawCircle(c, r * 0.72, paint);
      case _GlyphKind.arrow:
        canvas.drawPath(_arrow(c, r), paint);
      case _GlyphKind.check:
        paint.style = PaintingStyle.stroke;
        final Path check = Path()
          ..moveTo(c.dx - r * 0.55, c.dy + r * 0.05)
          ..lineTo(c.dx - r * 0.1, c.dy + r * 0.5)
          ..lineTo(c.dx + r * 0.6, c.dy - r * 0.45);
        canvas.drawPath(check, paint);
      case _GlyphKind.crescent:
        canvas.drawPath(_crescent(c, r), paint);
    }
  }

  Path _poly(Offset c, double r, int sides, double rotation) {
    final Path path = Path();
    for (int i = 0; i < sides; i++) {
      final double a = rotation + (i * 2 * math.pi / sides);
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

  Path _star(Offset c, double r, int points) {
    final Path path = Path();
    final double outer = r;
    final double inner = r * 0.42;
    for (int i = 0; i < points * 2; i++) {
      final double radius = i.isEven ? outer : inner;
      final double a = -math.pi / 2 + (i * math.pi / points);
      final Offset p = Offset(
        c.dx + radius * math.cos(a),
        c.dy + radius * math.sin(a),
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

  Path _heart(Offset c, double r) {
    final Path path = Path();
    path.moveTo(c.dx, c.dy + r * 0.7);
    path.cubicTo(
      c.dx + r * 1.1,
      c.dy + r * 0.05,
      c.dx + r * 0.7,
      c.dy - r * 0.85,
      c.dx,
      c.dy - r * 0.25,
    );
    path.cubicTo(
      c.dx - r * 0.7,
      c.dy - r * 0.85,
      c.dx - r * 1.1,
      c.dy + r * 0.05,
      c.dx,
      c.dy + r * 0.7,
    );
    path.close();
    return path;
  }

  Path _bolt(Offset c, double r) {
    final Path path = Path()
      ..moveTo(c.dx + r * 0.15, c.dy - r * 0.9)
      ..lineTo(c.dx - r * 0.35, c.dy + r * 0.05)
      ..lineTo(c.dx + r * 0.05, c.dy + r * 0.05)
      ..lineTo(c.dx - r * 0.15, c.dy + r * 0.9)
      ..lineTo(c.dx + r * 0.4, c.dy - r * 0.05)
      ..lineTo(c.dx, c.dy - r * 0.05)
      ..close();
    return path;
  }

  Path _moon(Offset c, double r) {
    final Path path = Path()
      ..addOval(Rect.fromCircle(center: c, radius: r * 0.85));
    final Path cut = Path()
      ..addOval(
        Rect.fromCircle(
          center: Offset(c.dx + r * 0.35, c.dy - r * 0.1),
          radius: r * 0.7,
        ),
      );
    return Path.combine(PathOperation.difference, path, cut);
  }

  Path _crescent(Offset c, double r) {
    final Path outer = Path()
      ..addOval(Rect.fromCircle(center: c, radius: r * 0.85));
    final Path cut = Path()
      ..addOval(
        Rect.fromCircle(
          center: Offset(c.dx + r * 0.42, c.dy),
          radius: r * 0.68,
        ),
      );
    return Path.combine(PathOperation.difference, outer, cut);
  }

  Path _cloud(Offset c, double r) {
    final Path path = Path()
      ..addOval(
        Rect.fromCircle(
          center: Offset(c.dx - r * 0.35, c.dy + r * 0.1),
          radius: r * 0.42,
        ),
      )
      ..addOval(
        Rect.fromCircle(
          center: Offset(c.dx + r * 0.3, c.dy + r * 0.15),
          radius: r * 0.38,
        ),
      )
      ..addOval(
        Rect.fromCircle(
          center: Offset(c.dx, c.dy - r * 0.15),
          radius: r * 0.48,
        ),
      )
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(c.dx, c.dy + r * 0.25),
            width: r * 1.5,
            height: r * 0.55,
          ),
          const Radius.circular(20),
        ),
      );
    return path;
  }

  Path _arrow(Offset c, double r) {
    final Path path = Path()
      ..moveTo(c.dx - r * 0.15, c.dy - r * 0.85)
      ..lineTo(c.dx + r * 0.55, c.dy)
      ..lineTo(c.dx - r * 0.15, c.dy + r * 0.85)
      ..lineTo(c.dx - r * 0.15, c.dy + r * 0.3)
      ..lineTo(c.dx - r * 0.7, c.dy + r * 0.3)
      ..lineTo(c.dx - r * 0.7, c.dy - r * 0.3)
      ..lineTo(c.dx - r * 0.15, c.dy - r * 0.3)
      ..close();
    return path;
  }

  void _drawSun(Canvas canvas, Offset c, double r, Paint paint) {
    canvas.drawCircle(c, r * 0.42, paint);
    paint.style = PaintingStyle.stroke;
    paint.strokeWidth = r * 0.16;
    for (int i = 0; i < 8; i++) {
      final double a = i * math.pi / 4;
      canvas.drawLine(
        Offset(c.dx + math.cos(a) * r * 0.55, c.dy + math.sin(a) * r * 0.55),
        Offset(c.dx + math.cos(a) * r * 0.9, c.dy + math.sin(a) * r * 0.9),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _GlyphPainter oldDelegate) =>
      oldDelegate.kind != kind || oldDelegate.color != color;
}
