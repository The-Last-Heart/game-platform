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
    with SingleTickerProviderStateMixin {
  bool _submitted = false;
  int? _placedWeight;
  int? _hoverPan;
  late final AnimationController _tilt;

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

  int get _leftSum => _leftWeights.fold(0, (int a, int b) => a + b);

  int get _rightSum =>
      _rightKnown.fold(0, (int a, int b) => a + b) + (_placedWeight ?? 0);

  @override
  void initState() {
    super.initState();
    _tilt = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
  }

  @override
  void dispose() {
    _tilt.dispose();
    super.dispose();
  }

  void _syncTilt() {
    final double diff = (_leftSum - _rightSum).clamp(-6.0, 6.0) / 6.0;
    _tilt.animateTo(0.5 + diff * 0.18);
  }

  void _placeWeight(int weight) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    setState(() {
      _placedWeight = weight;
      _hoverPan = null;
      _submitted = true;
    });
    _syncTilt();
    Future<void>.delayed(const Duration(milliseconds: 280), () {
      if (!mounted) return;
      widget.challengeContext.onSubmit(<String, dynamic>{
        'chosenWeight': weight,
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
          const SizedBox(height: 24),
          Expanded(
            child: AnimatedBuilder(
              animation: _tilt,
              builder: (BuildContext context, Widget? child) {
                final double angle = (_tilt.value - 0.5) * 0.28;
                return Transform.rotate(
                  angle: angle,
                  child: child,
                );
              },
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  Expanded(
                    child: _BalancePan(
                      label: 'L',
                      weights: _leftWeights,
                      highlight: _hoverPan == 0,
                    ),
                  ),
                  Container(
                    width: 8,
                    height: 120,
                    margin: const EdgeInsets.symmetric(horizontal: 6),
                    decoration: const BoxDecoration(
                      color: LhColors.border,
                      borderRadius: LhRadii.smAll,
                    ),
                  ),
                  Expanded(
                    child: DragTarget<int>(
                      onWillAcceptWithDetails: (_) =>
                          !widget.challengeContext.isInteractionLocked &&
                          !_submitted &&
                          _placedWeight == null,
                      onMove: (_) => setState(() => _hoverPan = 1),
                      onLeave: (_) => setState(() => _hoverPan = null),
                      onAcceptWithDetails: (DragTargetDetails<int> d) {
                        _placeWeight(d.data);
                      },
                      builder: (
                        BuildContext context,
                        List<int?> candidate,
                        List<dynamic> rejected,
                      ) {
                        final List<int> rightWeights = <int>[
                          ..._rightKnown,
                          if (_placedWeight != null) _placedWeight!,
                        ];
                        return _BalancePan(
                          label: 'R',
                          weights: rightWeights,
                          highlight: candidate.isNotEmpty || _hoverPan == 1,
                          dropTarget: _placedWeight == null,
                        );
                      },
                    ),
                  ),
                ],
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
                if (_placedWeight != _options[i])
                  TweenAnimationBuilder<double>(
                    tween: Tween<double>(begin: 0, end: 1),
                    duration: Duration(milliseconds: 280 + i * 70),
                    curve: Curves.easeOutBack,
                    builder: (BuildContext context, double t, Widget? child) {
                      return Transform.scale(scale: t, child: child);
                    },
                    child: LongPressDraggable<int>(
                      data: _options[i],
                      feedback: _WeightChip(
                        weight: _options[i],
                        dragging: true,
                      ),
                      onDragStarted: () => setState(() => _hoverPan = 1),
                      onDragEnd: (_) => setState(() => _hoverPan = null),
                      childWhenDragging: Opacity(
                        opacity: 0.35,
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

class _BalancePan extends StatelessWidget {
  const _BalancePan({
    required this.label,
    required this.weights,
    this.highlight = false,
    this.dropTarget = false,
  });

  final String label;
  final List<int> weights;
  final bool highlight;
  final bool dropTarget;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: highlight
            ? LhColors.warning.withValues(alpha: 0.15)
            : LhColors.elevated,
        borderRadius: LhRadii.lgAll,
        border: Border.all(
          color: highlight ? LhColors.warning : LhColors.border,
          width: highlight ? 2.4 : 1.4,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: LhColors.textMuted,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: <Widget>[
              for (final int w in weights) _WeightChip(weight: w, small: true),
              if (dropTarget && weights.isEmpty)
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: LhColors.border,
                      style: BorderStyle.solid,
                    ),
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
    final double size = small ? 40 : 52;
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
            : null,
      ),
      alignment: Alignment.center,
      child: Text(
        '$weight',
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
