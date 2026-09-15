import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  StreamSubscription<UserAccelerometerEvent>? _sub;
  int _shakeCount = 0;
  bool _submitted = false;
  bool _sensorLive = false;
  bool _sensorFailed = false;
  /// True while magnitude is above threshold — requires a drop below before
  /// the next shake counts (peak/valley, not sample spam).
  bool _abovePeak = false;
  DateTime _lastShakeAt = DateTime.fromMillisecondsSinceEpoch(0);

  int get _required {
    final num? v =
        widget.challengeContext.challenge.clientConfig['requiredShakeCount']
            as num?;
    return v?.toInt() ?? 3;
  }

  /// Peak threshold on user-acceleration magnitude (m/s², gravity removed).
  /// ~8–10 is a deliberate phone shake without encouraging violent motion.
  double get _peakThreshold {
    final num? v =
        widget.challengeContext.challenge.clientConfig['noiseThreshold']
            as num?;
    // Server noiseThreshold is 0–100 scale in contracts; map lightly if present.
    if (v != null) {
      return (5.0 + (v.toDouble().clamp(0, 100) / 100) * 10).clamp(6.0, 14.0);
    }
    return 9.0;
  }

  static const double _valleyThreshold = 4.0;
  static const Duration _minGap = Duration(milliseconds: 350);

  void _registerShake() {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    final DateTime now = DateTime.now();
    if (now.difference(_lastShakeAt) < _minGap) return;
    _lastShakeAt = now;
    HapticFeedback.lightImpact();
    setState(() => _shakeCount += 1);
    if (_shakeCount >= _required) {
      _submitted = true;
      widget.challengeContext.onSubmit(<String, dynamic>{
        'shakeCount': _shakeCount,
      });
    }
  }

  void _onUserAccel(UserAccelerometerEvent e) {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    if (!_sensorLive) {
      setState(() => _sensorLive = true);
    }
    final double mag = sqrt(e.x * e.x + e.y * e.y + e.z * e.z);
    if (!_abovePeak && mag >= _peakThreshold) {
      _abovePeak = true;
      _registerShake();
    } else if (_abovePeak && mag < _valleyThreshold) {
      _abovePeak = false;
    }
  }

  @override
  void initState() {
    super.initState();
    // Prefer user accelerometer (gravity removed) so resting phone ≈ 0 and
    // real shakes produce clear peaks. Sample at game rate for peak capture.
    try {
      _sub = userAccelerometerEventStream(
        samplingPeriod: SensorInterval.gameInterval,
      ).listen(
        _onUserAccel,
        onError: (_) {
          if (mounted) setState(() => _sensorFailed = true);
        },
        cancelOnError: false,
      );
    } catch (_) {
      _sensorFailed = true;
    }
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
    final int remaining = (_required - _shakeCount).clamp(0, _required);

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            resolver.resolve(promptKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Text(
            resolver.resolve(
              _sensorFailed
                  ? 'challenge.shake.sensor_unavailable'
                  : 'challenge.shake.hint',
            ),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: LhColors.textMuted,
            ),
          ),
          const SizedBox(height: 28),
          Text(
            resolver.resolve(
              progressKey,
              params: <String, String>{
                'current': '$_shakeCount',
                'required': '$_required',
              },
            ),
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              color: LhColors.success,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              for (int i = 0; i < _required; i++)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: 36,
                  height: 10,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(999),
                    color: i < _shakeCount
                        ? LhColors.success
                        : LhColors.border,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            resolver.resolve(
              'challenge.shake.remaining',
              params: <String, String>{'count': '$remaining'},
            ),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: LhColors.textMuted,
            ),
          ),
          // Debug/emulator only — never the primary path on device.
          if (kDebugMode) ...<Widget>[
            const SizedBox(height: 24),
            TextButton(
              onPressed:
                  widget.challengeContext.isInteractionLocked || _submitted
                  ? null
                  : _registerShake,
              child: Text(resolver.resolve('challenge.shake.simulate')),
            ),
          ],
        ],
      ),
    );
  }
}
