import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class FocusOddOneOutEngine implements ChallengeEngine {
  @override
  String get engineId => 'focus.odd_one_out';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _OddOneOutWidget(challengeContext: challengeContext);
  }
}

class _OddOneOutWidget extends StatefulWidget {
  const _OddOneOutWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_OddOneOutWidget> createState() => _OddOneOutWidgetState();
}

class _OddOneOutWidgetState extends State<_OddOneOutWidget>
    with SingleTickerProviderStateMixin {
  bool _submitted = false;
  int? _flashIndex;
  late final AnimationController _pulse;

  int get _columns {
    final num? v =
        widget.challengeContext.challenge.clientConfig['columns'] as num?;
    return v?.toInt().clamp(2, 6) ?? 4;
  }

  List<String> get _glyphKeys {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['glyphKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList(growable: false);
    }
    return const <String>[];
  }

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  void _onTap(int index) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    setState(() {
      _submitted = true;
      _flashIndex = index;
    });
    Future<void>.delayed(const Duration(milliseconds: 180), () {
      if (!mounted) return;
      widget.challengeContext.onSubmit(<String, dynamic>{
        'selectedIndex': index,
      });
    });
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
    final List<String> glyphs = _glyphKeys;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.warning,
          ),
          const SizedBox(height: 18),
          TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: 1),
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            builder: (BuildContext context, double t, Widget? child) {
              return Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, (1 - t) * 8),
                  child: child,
                ),
              );
            },
            child: Text(
              resolver.resolve(promptKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 20),
          Expanded(
            child: AnimatedBuilder(
              animation: _pulse,
              builder: (BuildContext context, Widget? child) {
                return GridView.builder(
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: _columns,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: glyphs.length,
                  itemBuilder: (BuildContext context, int index) {
                    final double stagger = (index % _columns) * 0.04;
                    final double beat =
                        1 + ((_pulse.value + stagger) % 1) * 0.07;
                    final bool flash = _flashIndex == index;
                    return TweenAnimationBuilder<double>(
                      tween: Tween<double>(begin: 0, end: 1),
                      duration: Duration(milliseconds: 240 + index * 25),
                      curve: Curves.easeOutBack,
                      builder: (BuildContext context, double t, Widget? child) {
                        return Transform.scale(scale: t, child: child);
                      },
                      child: GestureDetector(
                        onTap: () => _onTap(index),
                        child: Transform.scale(
                          scale: beat,
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 140),
                            decoration: BoxDecoration(
                              color: flash
                                  ? LhColors.warning.withValues(alpha: 0.25)
                                  : LhColors.elevated,
                              borderRadius: LhRadii.mdAll,
                              border: Border.all(
                                color: flash
                                    ? LhColors.warning
                                    : LhColors.border,
                                width: flash ? 2.6 : 1.4,
                              ),
                              boxShadow: flash
                                  ? <BoxShadow>[
                                      BoxShadow(
                                        color: LhColors.warning.withValues(
                                          alpha: 0.45,
                                        ),
                                        blurRadius: 18,
                                      ),
                                    ]
                                  : null,
                            ),
                            child: Center(
                              child: CustomPaint(
                                size: const Size(36, 36),
                                painter: _PulseGlyphPainter(
                                  glyphKey: glyphs[index],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          if (footerKey.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
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

class _PulseGlyphPainter extends CustomPainter {
  const _PulseGlyphPainter({required this.glyphKey});

  final String glyphKey;

  static const List<Offset> _wavePoints = <Offset>[
    Offset(0.04, 0.52),
    Offset(0.14, 0.52),
    Offset(0.22, 0.64),
    Offset(0.30, 0.16),
    Offset(0.38, 0.78),
    Offset(0.46, 0.52),
    Offset(0.96, 0.52),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final bool inverted = glyphKey.endsWith('.b');
    final Path path = Path();
    for (int i = 0; i < _wavePoints.length; i++) {
      final Offset p = _wavePoints[i];
      final double y = inverted ? 1 - p.dy : p.dy;
      final Offset pt = Offset(p.dx * size.width, y * size.height);
      if (i == 0) {
        path.moveTo(pt.dx, pt.dy);
      } else {
        path.lineTo(pt.dx, pt.dy);
      }
    }

    final Paint glow = Paint()
      ..color = LhColors.success.withValues(alpha: 0.35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);
    canvas.drawPath(path, glow);

    final Paint stroke = Paint()
      ..color = LhColors.success
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(path, stroke);
  }

  @override
  bool shouldRepaint(covariant _PulseGlyphPainter oldDelegate) {
    return oldDelegate.glyphKey != glyphKey;
  }
}
