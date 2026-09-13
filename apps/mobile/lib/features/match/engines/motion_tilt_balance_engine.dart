import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

class MotionTiltBalanceEngine implements ChallengeEngine {
  @override
  String get engineId => 'motion.tilt_balance';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _MotionTiltWidget(challengeContext: challengeContext);
  }
}

class _MotionTiltWidget extends StatefulWidget {
  const _MotionTiltWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_MotionTiltWidget> createState() => _MotionTiltWidgetState();
}

class _MotionTiltWidgetState extends State<_MotionTiltWidget> {
  StreamSubscription<AccelerometerEvent>? _sub;
  double _x = 0;
  double _y = 0;
  DateTime? _inTargetSince;
  bool _submitted = false;

  double get _targetX {
    final num? v =
        widget.challengeContext.challenge.clientConfig['targetX'] as num?;
    return v?.toDouble() ?? 0;
  }

  double get _targetY {
    final num? v =
        widget.challengeContext.challenge.clientConfig['targetY'] as num?;
    return v?.toDouble() ?? 0;
  }

  double get _tolerance {
    final num? v =
        widget.challengeContext.challenge.clientConfig['varianceTolerance']
            as num?;
    return v?.toDouble() ?? 0.2;
  }

  int get _holdMs {
    final num? v =
        widget.challengeContext.challenge.clientConfig['holdMs'] as num?;
    return v?.toInt() ?? 1500;
  }

  @override
  void initState() {
    super.initState();
    _sub = accelerometerEventStream().listen((AccelerometerEvent e) {
      if (_submitted || widget.challengeContext.isInteractionLocked) return;
      // Map gravity into [-1,1] plane roughly.
      final double nx = (e.x / 9.8).clamp(-1.0, 1.0);
      final double ny = (e.y / 9.8).clamp(-1.0, 1.0);
      setState(() {
        _x = nx;
        _y = ny;
      });
      final double dist = sqrt(
        (nx - _targetX) * (nx - _targetX) + (ny - _targetY) * (ny - _targetY),
      );
      if (dist <= _tolerance) {
        _inTargetSince ??= DateTime.now();
        final int held = DateTime.now().difference(_inTargetSince!).inMilliseconds;
        if (held >= _holdMs) {
          _submitted = true;
          widget.challengeContext.onSubmit(<String, dynamic>{
            'finalX': nx,
            'finalY': ny,
            'heldMs': held,
          });
        }
      } else {
        _inTargetSince = null;
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (widget.challengeContext.challenge.clientConfig['promptKey']
            as String?) ??
        widget.challengeContext.challenge.promptKey;
    final int held = _inTargetSince == null
        ? 0
        : DateTime.now().difference(_inTargetSince!).inMilliseconds;

    return Column(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            resolver.resolve(promptKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        Expanded(
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints c) {
              final double size = min(c.maxWidth, c.maxHeight) * 0.7;
              final double dotX = (size / 2) + _x * (size / 2);
              final double dotY = (size / 2) + _y * (size / 2);
              return Center(
                child: SizedBox(
                  width: size,
                  height: size,
                  child: Stack(
                    children: <Widget>[
                      Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: LhColors.border, width: 2),
                        ),
                      ),
                      Positioned(
                        left: (size / 2) +
                            _targetX * (size / 2) -
                            (size * _tolerance) / 2,
                        top: (size / 2) +
                            _targetY * (size / 2) -
                            (size * _tolerance) / 2,
                        child: Container(
                          width: size * _tolerance,
                          height: size * _tolerance,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: LhColors.success.withValues(alpha: 0.2),
                            border: Border.all(color: LhColors.success),
                          ),
                        ),
                      ),
                      Positioned(
                        left: dotX - 12,
                        top: dotY - 12,
                        child: Container(
                          width: 24,
                          height: 24,
                          decoration: const BoxDecoration(
                            color: LhColors.success,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Text((held / _holdMs).clamp(0, 1).toStringAsFixed(1)),
        ),
      ],
    );
  }
}
