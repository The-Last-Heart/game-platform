import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

class MotionShakeEngine implements ChallengeEngine {
  @override
  String get engineId => 'motion.shake';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _MotionShakeWidget(challengeContext: challengeContext);
  }
}

class _MotionShakeWidget extends StatefulWidget {
  const _MotionShakeWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_MotionShakeWidget> createState() => _MotionShakeWidgetState();
}

class _MotionShakeWidgetState extends State<_MotionShakeWidget> {
  StreamSubscription<AccelerometerEvent>? _sub;
  int _shakeCount = 0;
  bool _submitted = false;
  double _lastMag = 0;
  DateTime _lastShakeAt = DateTime.fromMillisecondsSinceEpoch(0);

  int get _required {
    final num? v =
        widget.challengeContext.challenge.clientConfig['requiredShakeCount']
            as num?;
    return v?.toInt() ?? 5;
  }

  double get _threshold => 12;

  @override
  void initState() {
    super.initState();
    _sub = accelerometerEventStream().listen((AccelerometerEvent e) {
      if (_submitted || widget.challengeContext.isInteractionLocked) return;
      final double mag = sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
      final double delta = (mag - _lastMag).abs();
      _lastMag = mag;
      final DateTime now = DateTime.now();
      if (delta >= _threshold &&
          now.difference(_lastShakeAt) > const Duration(milliseconds: 250)) {
        _lastShakeAt = now;
        setState(() => _shakeCount += 1);
        if (_shakeCount >= _required) {
          _submitted = true;
          widget.challengeContext.onSubmit(<String, dynamic>{
            'shakeCount': _shakeCount,
          });
        }
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
    final String progressKey =
        (widget.challengeContext.challenge.clientConfig['progressKey']
            as String?) ??
        'challenge.shake.progress';

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            resolver.resolve(promptKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 24),
          Text(
            resolver
                .resolve(progressKey)
                .replaceAll('{current}', '$_shakeCount')
                .replaceAll('{required}', '$_required'),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: LhColors.success,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 16),
          // Emulator fallback: tap to simulate a shake pulse.
          TextButton(
            onPressed: widget.challengeContext.isInteractionLocked || _submitted
                ? null
                : () {
                    setState(() => _shakeCount += 1);
                    if (_shakeCount >= _required) {
                      _submitted = true;
                      widget.challengeContext.onSubmit(<String, dynamic>{
                        'shakeCount': _shakeCount,
                      });
                    }
                  },
            child: Text(resolver.resolve('challenge.shake.simulate')),
          ),
        ],
      ),
    );
  }
}
