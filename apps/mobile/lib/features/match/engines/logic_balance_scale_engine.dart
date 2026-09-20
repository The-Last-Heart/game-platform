import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class LogicBalanceScaleEngine implements ChallengeEngine {
  @override
  String get engineId => 'logic.balance_scale';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _BalanceScaleWidget(challengeContext: challengeContext);
  }
}

class _BalanceScaleWidget extends StatefulWidget {
  const _BalanceScaleWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_BalanceScaleWidget> createState() => _BalanceScaleWidgetState();
}

class _BalanceScaleWidgetState extends State<_BalanceScaleWidget>
    with TickerProviderStateMixin {
  bool _submitted = false;
  bool _balanced = false;
  int? _placedWeight;
  int? _placedOptionIndex;
  int? _hoverPan; // 0 = left, 1 = right
  late final AnimationController _tilt;
  late final AnimationController _glow;
  late final AnimationController _dropBounce;

  List<int> get _leftWeights {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['leftWeights'];
    if (raw is List) {
      return raw.map((Object? v) => (v as num).toInt()).toList(growable: false);
    }
    return const <int>[];
  }

  List<int> get _rightKnown {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['rightKnownWeights'];
    if (raw is List) {
      return raw.map((Object? v) => (v as num).toInt()).toList(growable: false);
    }
    return const <int>[];
  }

  List<int> get _options {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['optionWeights'];
    if (raw is List) {
      return raw.map((Object? v) => (v as num).toInt()).toList(growable: false);
    }
    return const <int>[1, 2, 3];
  }

  /// Which pan accepts the dragged option. Defaults to right.
  String get _placementSide {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['placementSide'];
    return raw == 'left' ? 'left' : 'right';
  }

  int get _placementPanIndex => _placementSide == 'left' ? 0 : 1;

  /// Controller value in [0, 1] where 0.5 is level.
  /// Heavier left → value > 0.5 → clockwise tilt → left pan down.
  double _tiltValueFor(int leftSum, int rightSum) {
    final double diff = (leftSum - rightSum).clamp(-8, 8) / 8.0;
    return (0.5 + diff * 0.38).clamp(0.08, 0.92);
  }

  @override
  void initState() {
    super.initState();
    final double initial = _tiltValueFor(
      _leftWeights.fold(0, (int a, int b) => a + b),
      _rightKnown.fold(0, (int a, int b) => a + b),
    );
    _tilt = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 720),
      value: initial,
    );
    _glow = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _dropBounce = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
  }

  @override
  void dispose() {
    _tilt.dispose();
    _glow.dispose();
    _dropBounce.dispose();
    super.dispose();
  }

  Future<void> _animateScaleToBalance(int leftSum, int rightSum) async {
    final double target = _tiltValueFor(leftSum, rightSum);
    final double current = _tilt.value;
    final double overshoot = target + (target - current) * 0.28;
    await _tilt.animateTo(
      overshoot.clamp(0.05, 0.95),
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
    if (!mounted) return;
    await _tilt.animateTo(
      target,
      duration: const Duration(milliseconds: 420),
      curve: Curves.elasticOut,
    );
  }

  void _placeWeight(int weight, int optionIndex) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    if (_placedWeight != null) return;

    final bool onLeft = _placementSide == 'left';
    final int nextLeft =
        _leftWeights.fold(0, (int a, int b) => a + b) + (onLeft ? weight : 0);
    final int nextRight =
        _rightKnown.fold(0, (int a, int b) => a + b) + (onLeft ? 0 : weight);
    final bool nowBalanced = nextLeft == nextRight;

    setState(() {
      _placedWeight = weight;
      _placedOptionIndex = optionIndex;
      _hoverPan = null;
      _balanced = nowBalanced;
      _submitted = true;
    });

    _dropBounce.forward(from: 0);
    _animateScaleToBalance(nextLeft, nextRight);
    if (nowBalanced) {
      _glow.repeat(reverse: true);
    }

    Future<void>.delayed(Duration(milliseconds: nowBalanced ? 780 : 560), () {
      if (!mounted) return;
      widget.challengeContext.onSubmit(<String, dynamic>{
        'chosenWeight': weight,
      });
    });
  }

  bool _canAcceptPan(int panIndex) {
    return !widget.challengeContext.isInteractionLocked &&
        !_submitted &&
        _placedWeight == null &&
        panIndex == _placementPanIndex;
  }

  Widget _buildPan({
    required int panIndex,
    required List<int> weights,
    required bool showDropSlot,
  }) {
    return DragTarget<int>(
      onWillAcceptWithDetails: (_) => _canAcceptPan(panIndex),
      onMove: (_) {
        if (_canAcceptPan(panIndex)) {
          setState(() => _hoverPan = panIndex);
        }
      },
      onLeave: (_) {
        if (_hoverPan == panIndex) {
          setState(() => _hoverPan = null);
        }
      },
      onAcceptWithDetails: (DragTargetDetails<int> details) {
        final int optionIndex = details.data;
        if (optionIndex < 0 || optionIndex >= _options.length) return;
        _placeWeight(_options[optionIndex], optionIndex);
      },
      builder: (
        BuildContext context,
        List<int?> candidate,
        List<dynamic> rejected,
      ) {
        final bool highlight =
            candidate.isNotEmpty || _hoverPan == panIndex;
        return _BalancePan(
          label: panIndex == 0 ? 'L' : 'R',
          weights: weights,
          highlight: highlight,
          dropTarget: showDropSlot,
          bounce: _dropBounce,
          glowing: _balanced && _placedWeight != null,
          glow: _glow,
        );
      },
    );
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

    final List<int> leftDisplay = <int>[
      ..._leftWeights,
      if (_placementSide == 'left' && _placedWeight != null) _placedWeight!,
    ];
    final List<int> rightDisplay = <int>[
      ..._rightKnown,
      if (_placementSide == 'right' && _placedWeight != null) _placedWeight!,
    ];

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
          const SizedBox(height: 12),
          Expanded(
            child: Directionality(
              // Keep L/R pans and tilt physics stable in RTL locales.
              textDirection: TextDirection.ltr,
              child: Builder(
                builder: (BuildContext context) {
                  // Build drag targets outside the tilt/glow ticker so
                  // animation frames do not recreate DragTarget elements.
                  final Widget leftPan = _buildPan(
                    panIndex: 0,
                    weights: leftDisplay,
                    showDropSlot:
                        _placementSide == 'left' && _placedWeight == null,
                  );
                  final Widget rightPan = _buildPan(
                    panIndex: 1,
                    weights: rightDisplay,
                    showDropSlot:
                        _placementSide == 'right' && _placedWeight == null,
                  );
                  return AnimatedBuilder(
                    animation: Listenable.merge(<Listenable>[_tilt, _glow]),
                    builder: (BuildContext context, Widget? child) {
                      final double angle = (_tilt.value - 0.5) * 0.55;
                      final double glowT = _balanced ? _glow.value : 0.0;
                      return CustomPaint(
                        painter: _ScaleAuraPainter(intensity: glowT),
                        child: _ScaleAssembly(
                          angle: angle,
                          leftPan: leftPan,
                          rightPan: rightPan,
                          glowing: _balanced,
                          glowT: glowT,
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            alignment: WrapAlignment.center,
            children: <Widget>[
              for (int i = 0; i < _options.length; i++)
                if (_placedOptionIndex != i)
                  TweenAnimationBuilder<double>(
                    tween: Tween<double>(begin: 0, end: 1),
                    duration: Duration(milliseconds: 280 + i * 70),
                    curve: Curves.easeOutBack,
                    builder: (BuildContext context, double t, Widget? child) {
                      return Transform.scale(scale: t, child: child);
                    },
                    child: Draggable<int>(
                      data: i,
                      maxSimultaneousDrags:
                          widget.challengeContext.isInteractionLocked ||
                                  _submitted
                              ? 0
                              : 1,
                      feedback: Material(
                        color: Colors.transparent,
                        child: Transform.scale(
                          scale: 1.12,
                          child: _WeightChip(
                            weight: _options[i],
                            dragging: true,
                          ),
                        ),
                      ),
                      onDragStarted: () =>
                          setState(() => _hoverPan = _placementPanIndex),
                      onDragEnd: (_) => setState(() => _hoverPan = null),
                      childWhenDragging: Opacity(
                        opacity: 0.28,
                        child: _WeightChip(weight: _options[i]),
                      ),
                      child: _WeightChip(weight: _options[i]),
                    ),
                  ),
            ],
          ),
          if (footerKey.isNotEmpty) ...<Widget>[
            const SizedBox(height: 14),
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

class _ScaleAssembly extends StatelessWidget {
  const _ScaleAssembly({
    required this.angle,
    required this.leftPan,
    required this.rightPan,
    required this.glowing,
    required this.glowT,
  });

  final double angle;
  final Widget leftPan;
  final Widget rightPan;
  final bool glowing;
  final double glowT;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double width = constraints.maxWidth;
        final double beamWidth = math.min(width * 0.92, 340);
        final double panWidth = beamWidth * 0.38;

        return Center(
          child: SizedBox(
            width: beamWidth,
            height: math.min(constraints.maxHeight, 280),
            child: Stack(
              alignment: Alignment.center,
              children: <Widget>[
                // Fulcrum post
                Positioned(
                  bottom: 24,
                  child: Container(
                    width: 14,
                    height: 110,
                    decoration: BoxDecoration(
                      borderRadius: LhRadii.smAll,
                      gradient: const LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: <Color>[
                          LhColors.border,
                          LhColors.elevated,
                        ],
                      ),
                      boxShadow: glowing
                          ? <BoxShadow>[
                              BoxShadow(
                                color: LhColors.success.withValues(
                                  alpha: 0.35 + glowT * 0.35,
                                ),
                                blurRadius: 18 + glowT * 12,
                              ),
                            ]
                          : null,
                    ),
                  ),
                ),
                // Pivot diamond
                Positioned(
                  bottom: 122,
                  child: Transform.rotate(
                    angle: math.pi / 4,
                    child: Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        color: glowing
                            ? Color.lerp(
                                LhColors.border,
                                LhColors.success,
                                0.55 + glowT * 0.35,
                              )
                            : LhColors.border,
                        boxShadow: glowing
                            ? <BoxShadow>[
                                BoxShadow(
                                  color: LhColors.success.withValues(
                                    alpha: 0.55,
                                  ),
                                  blurRadius: 14,
                                ),
                              ]
                            : null,
                      ),
                    ),
                  ),
                ),
                // Rotating beam + hanging pans
                Positioned(
                  bottom: 128,
                  child: Transform.rotate(
                    angle: angle,
                    alignment: Alignment.center,
                    child: SizedBox(
                      width: beamWidth,
                      height: 140,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: <Widget>[
                          Positioned(
                            top: 0,
                            left: 0,
                            right: 0,
                            child: Container(
                              height: 10,
                              decoration: BoxDecoration(
                                borderRadius: LhRadii.pillAll,
                                color: glowing
                                    ? Color.lerp(
                                        LhColors.success,
                                        LhColors.text,
                                        0.15,
                                      )
                                    : LhColors.border,
                                boxShadow: glowing
                                    ? <BoxShadow>[
                                        BoxShadow(
                                          color: LhColors.success.withValues(
                                            alpha: 0.45 + glowT * 0.35,
                                          ),
                                          blurRadius: 16 + glowT * 10,
                                          spreadRadius: 1,
                                        ),
                                      ]
                                    : null,
                              ),
                            ),
                          ),
                          Positioned(
                            top: 10,
                            left: 4,
                            width: panWidth,
                            child: Transform.rotate(
                              angle: -angle,
                              alignment: Alignment.topCenter,
                              child: leftPan,
                            ),
                          ),
                          Positioned(
                            top: 10,
                            right: 4,
                            width: panWidth,
                            child: Transform.rotate(
                              angle: -angle,
                              alignment: Alignment.topCenter,
                              child: rightPan,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ScaleAuraPainter extends CustomPainter {
  _ScaleAuraPainter({required this.intensity});

  final double intensity;

  @override
  void paint(Canvas canvas, Size size) {
    if (intensity <= 0.01) return;
    final Offset center = Offset(size.width / 2, size.height * 0.62);
    final Paint paint = Paint()
      ..shader = RadialGradient(
        colors: <Color>[
          LhColors.success.withValues(alpha: 0.28 * intensity),
          LhColors.success.withValues(alpha: 0.08 * intensity),
          Colors.transparent,
        ],
      ).createShader(Rect.fromCircle(center: center, radius: size.width * 0.42));
    canvas.drawCircle(center, size.width * 0.42, paint);
  }

  @override
  bool shouldRepaint(covariant _ScaleAuraPainter oldDelegate) {
    return oldDelegate.intensity != intensity;
  }
}

class _BalancePan extends StatelessWidget {
  const _BalancePan({
    required this.label,
    required this.weights,
    required this.bounce,
    required this.glow,
    this.highlight = false,
    this.dropTarget = false,
    this.glowing = false,
  });

  final String label;
  final List<int> weights;
  final bool highlight;
  final bool dropTarget;
  final bool glowing;
  final Animation<double> bounce;
  final Animation<double> glow;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge(<Listenable>[bounce, glow]),
      builder: (BuildContext context, Widget? child) {
        final double pop = dropTarget || weights.isEmpty
            ? 1.0
            : 1.0 + Curves.easeOutBack.transform(bounce.value) * 0.06;
        final double glowT = glowing ? glow.value : 0.0;
        return Transform.scale(
          scale: pop,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
            decoration: BoxDecoration(
              color: highlight
                  ? LhColors.warning.withValues(alpha: 0.18)
                  : glowing
                  ? LhColors.success.withValues(alpha: 0.12 + glowT * 0.1)
                  : LhColors.elevated,
              borderRadius: LhRadii.lgAll,
              border: Border.all(
                color: highlight
                    ? LhColors.warning
                    : glowing
                    ? LhColors.success.withValues(alpha: 0.55 + glowT * 0.4)
                    : LhColors.border,
                width: highlight || glowing ? 2.4 : 1.4,
              ),
              boxShadow: glowing
                  ? <BoxShadow>[
                      BoxShadow(
                        color: LhColors.success.withValues(
                          alpha: 0.35 + glowT * 0.35,
                        ),
                        blurRadius: 18 + glowT * 10,
                      ),
                    ]
                  : null,
            ),
            child: child,
          ),
        );
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: LhColors.textMuted,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            alignment: WrapAlignment.center,
            children: <Widget>[
              for (final int w in weights) _WeightChip(weight: w, small: true),
              if (dropTarget)
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: highlight
                          ? LhColors.warning
                          : LhColors.success.withValues(alpha: 0.55),
                      width: 1.8,
                    ),
                    color: highlight
                        ? LhColors.warning.withValues(alpha: 0.12)
                        : LhColors.success.withValues(alpha: 0.06),
                  ),
                  child: Icon(
                    Icons.add,
                    size: 18,
                    color: highlight ? LhColors.warning : LhColors.success,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _WeightChip extends StatelessWidget {
  const _WeightChip({
    required this.weight,
    this.dragging = false,
    this.small = false,
  });

  final int weight;
  final bool dragging;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final double size = small ? 38 : 52;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 120),
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: dragging ? LhColors.warning : LhColors.surface,
        border: Border.all(
          color: dragging ? LhColors.warning : LhColors.success,
          width: dragging ? 2.8 : 2,
        ),
        boxShadow: dragging
            ? <BoxShadow>[
                BoxShadow(
                  color: LhColors.warning.withValues(alpha: 0.45),
                  blurRadius: 16,
                ),
              ]
            : <BoxShadow>[
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.35),
                  blurRadius: 6,
                  offset: const Offset(0, 3),
                ),
              ],
      ),
      alignment: Alignment.center,
      child: Text(
        '$weight',
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w800,
          fontSize: small ? 15 : 18,
        ),
      ),
    );
  }
}
