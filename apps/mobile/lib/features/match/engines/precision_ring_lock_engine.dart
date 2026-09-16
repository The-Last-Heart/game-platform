import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

/// Individual concentric ring timing challenge (`precision.ring_lock`).
class PrecisionRingLockEngine implements ChallengeEngine {
  @override
  String get engineId => 'precision.ring_lock';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _RingLockWidget(challengeContext: challengeContext);
  }
}

class _RingSpec {
  const _RingSpec({
    required this.index,
    required this.initialAngleDeg,
    required this.direction,
    required this.angularVelocityDegPerSec,
    required this.locked,
    this.lockedAngleDeg,
  });

  final int index;
  final double initialAngleDeg;
  final int direction;
  final double angularVelocityDegPerSec;
  final bool locked;
  final double? lockedAngleDeg;
}

class _RingLockWidget extends StatefulWidget {
  const _RingLockWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_RingLockWidget> createState() => _RingLockWidgetState();
}

class _RingLockWidgetState extends State<_RingLockWidget>
    with TickerProviderStateMixin {
  static const Duration _pendingAckTimeout = Duration(milliseconds: 900);
  static final Set<String> _seenChallengeInstances = <String>{};

  late final AnimationController _entrance;
  late final AnimationController _breathe;
  late final AnimationController _buttonPress;
  late final AnimationController _lockBurst;
  late final AnimationController _missShake;
  late final AnimationController _successFinale;
  late final AnimationController _timeoutDim;
  late final Ticker _ticker;

  Duration _tickElapsed = Duration.zero;
  bool _pendingLock = false;
  Timer? _pendingTimer;
  int _lastHandledSequence = 0;
  String? _lastHandledOutcomeKey;
  bool _entranceDone = false;
  bool _skipEntrance = false;
  bool _disposed = false;
  bool _motionReducedCached = false;
  bool _startedAmbient = false;

  ChallengeContext get _ctx => widget.challengeContext;
  Map<String, dynamic> get _cfg => _ctx.challenge.clientConfig;

  bool get _motionReduced => _motionReducedCached;

  @override
  void initState() {
    super.initState();
    final String instanceId = _ctx.challenge.challengeInstanceId;
    _skipEntrance = _seenChallengeInstances.contains(instanceId) ||
        _cfg['reconnect'] == true ||
        (_asInt(_cfg['lockedCount']) ?? 0) > 0 ||
        (_asInt(_cfg['stateSequence']) ?? 1) > 1;
    _seenChallengeInstances.add(instanceId);

    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    _breathe = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _buttonPress = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 140),
      reverseDuration: const Duration(milliseconds: 220),
    );
    _lockBurst = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _missShake = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
    );
    _successFinale = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _timeoutDim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _ticker = createTicker((Duration elapsed) {
      _tickElapsed = elapsed;
      if (mounted) setState(() {});
    })
      ..start();

    _lastHandledSequence = _asInt(_cfg['stateSequence']) ?? 0;
    _syncAuthoritativeEffects(fromInit: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _motionReducedCached =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (_startedAmbient) return;
    _startedAmbient = true;
    if (_motionReduced || _skipEntrance) {
      _entrance.value = 1;
      _entranceDone = true;
      if (!_motionReduced) {
        _breathe.repeat(reverse: true);
      }
    } else {
      _entrance.forward().whenComplete(() {
        _entranceDone = true;
        if (!_disposed && !_motionReduced) {
          _breathe.repeat(reverse: true);
        }
      });
    }
  }

  @override
  void didUpdateWidget(covariant _RingLockWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncAuthoritativeEffects();
  }

  @override
  void dispose() {
    _disposed = true;
    _pendingTimer?.cancel();
    _ticker.dispose();
    _entrance.dispose();
    _breathe.dispose();
    _buttonPress.dispose();
    _lockBurst.dispose();
    _missShake.dispose();
    _successFinale.dispose();
    _timeoutDim.dispose();
    super.dispose();
  }

  void _syncAuthoritativeEffects({bool fromInit = false}) {
    final int seq = _asInt(_cfg['stateSequence']) ?? 0;
    final String? outcome = _cfg['lastLockOutcome'] as String?;
    final int? ringIdx = _asInt(_cfg['lastLockRingIndex']);
    final String result = (_cfg['result'] as String?) ?? 'active';
    final int locked = _asInt(_cfg['lockedCount']) ?? 0;
    final String outcomeKey = '$seq:$outcome:$ringIdx:$result';

    if (outcomeKey == _lastHandledOutcomeKey && !fromInit) {
      return;
    }

    // Never regress locked rings on stale snapshots.
    if (seq < _lastHandledSequence && !fromInit) {
      return;
    }
    _lastHandledSequence = math.max(_lastHandledSequence, seq);
    _lastHandledOutcomeKey = outcomeKey;

    if (_pendingLock &&
        (outcome == 'hit' || outcome == 'miss' || result != 'active')) {
      _clearPending();
    }

    if (fromInit) {
      if (result == 'success' || locked >= 3) {
        _successFinale.value = 1;
      }
      if (result == 'timeout' || result == 'failed') {
        _timeoutDim.value = 1;
      }
      return;
    }

    if (outcome == 'hit') {
      unawaited(HapticFeedback.lightImpact());
      _lockBurst.forward(from: 0);
      if (result == 'success' || locked >= 3) {
        unawaited(HapticFeedback.mediumImpact());
        if (_motionReduced) {
          _successFinale.value = 1;
        } else {
          _successFinale.forward(from: 0);
        }
      }
    } else if (outcome == 'miss') {
      unawaited(HapticFeedback.selectionClick());
      if (!_motionReduced) {
        _missShake.forward(from: 0);
      }
    }

    if (result == 'timeout' || result == 'failed') {
      if (_motionReduced) {
        _timeoutDim.value = 1;
      } else {
        _timeoutDim.forward();
      }
    }
  }

  void _clearPending() {
    _pendingTimer?.cancel();
    _pendingTimer = null;
    if (_pendingLock && mounted) {
      setState(() => _pendingLock = false);
    } else {
      _pendingLock = false;
    }
  }

  Future<void> _onLockPressed() async {
    if (_pendingLock) return;
    if (_ctx.isInteractionLocked) return;
    final String result = (_cfg['result'] as String?) ?? 'active';
    if (result != 'active') return;
    if (_cfg['isParticipant'] == false) return;
    if (!_ringsReady) return;

    final int nowMs = _ctx.estimateServerNowMs();
    if (nowMs > _ctx.challenge.deadlineAtMs) return;

    final int active = _asInt(_cfg['activeRingIndex']) ?? 0;
    final int seq = _asInt(_cfg['stateSequence']) ?? 1;

    setState(() => _pendingLock = true);
    unawaited(_buttonPress.forward(from: 0).then((_) {
      if (mounted) _buttonPress.reverse();
    }));
    unawaited(HapticFeedback.selectionClick());

    _ctx.onSubmit(<String, dynamic>{
      'ringIndex': active,
      'expectedSequence': seq,
      'final': false,
    });

    _pendingTimer?.cancel();
    _pendingTimer = Timer(_pendingAckTimeout, () {
      if (!mounted) return;
      if (_pendingLock) {
        setState(() => _pendingLock = false);
      }
    });
  }

  bool get _ringsReady {
    final Object? raw = _cfg['rings'];
    return raw is List && raw.length == 3;
  }

  List<_RingSpec> _parseRings() {
    final Object? raw = _cfg['rings'];
    if (raw is! List || raw.length != 3) {
      return const <_RingSpec>[];
    }
    final List<_RingSpec> out = <_RingSpec>[];
    for (int i = 0; i < 3; i += 1) {
      final Object? item = raw[i];
      if (item is! Map) continue;
      final Map<String, dynamic> m = Map<String, dynamic>.from(item);
      out.add(
        _RingSpec(
          index: _asInt(m['index']) ?? i,
          initialAngleDeg: (_asNum(m['initialAngleDeg']) ?? 0).toDouble(),
          direction: _asInt(m['direction']) ?? 1,
          angularVelocityDegPerSec:
              (_asNum(m['angularVelocityDegPerSec']) ?? 60).toDouble(),
          locked: m['locked'] == true,
          lockedAngleDeg: _asNum(m['lockedAngleDeg'])?.toDouble(),
        ),
      );
    }
    return out;
  }

  double _angleForRing(_RingSpec ring, int nowMs) {
    final double target = (_asNum(_cfg['targetAngleDeg']) ?? 0).toDouble();
    if (ring.locked) {
      return ring.lockedAngleDeg ?? target;
    }
    final int startsAt = _asInt(_cfg['puzzleStartsAtMs']) ??
        _ctx.challenge.startsAtMs;
    final int startDelay = _asInt(_cfg['startDelayMs']) ?? 0;
    final int spinStart = startsAt + startDelay;
    final int elapsed = math.max(0, nowMs - spinStart);
    final double elapsedSec = elapsed / 1000.0;
    return _normalizeDeg(
      ring.initialAngleDeg +
          ring.direction * ring.angularVelocityDegPerSec * elapsedSec,
    );
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String titleKey =
        (_cfg['titleKey'] as String?) ?? 'challenge.ring_lock.intro';
    final String promptKey =
        (_cfg['promptKey'] as String?) ?? 'challenge.ring_lock.prompt';
    final String actionKey =
        (_cfg['actionKey'] as String?) ?? 'challenge.ring_lock.action';
    final String timeKey = (_cfg['timeRemainingKey'] as String?) ??
        'challenge.ring_lock.time_remaining';
    final String ring1 =
        (_cfg['ring1Key'] as String?) ?? 'challenge.ring_lock.ring_1';
    final String ring2 =
        (_cfg['ring2Key'] as String?) ?? 'challenge.ring_lock.ring_2';
    final String ring3 =
        (_cfg['ring3Key'] as String?) ?? 'challenge.ring_lock.ring_3';
    final String lockedKey =
        (_cfg['statusLockedKey'] as String?) ?? 'challenge.ring_lock.locked';
    final String rotatingKey = (_cfg['statusRotatingKey'] as String?) ??
        'challenge.ring_lock.rotating';
    final String failedKey =
        (_cfg['statusFailedKey'] as String?) ?? 'challenge.ring_lock.failed';
    final String a11yButton = (_cfg['a11yLockButtonKey'] as String?) ??
        'challenge.ring_lock.a11y_lock';

    final List<_RingSpec> rings = _parseRings();
    final int nowMs = _ctx.estimateServerNowMs();
    final int remainingMs =
        (_ctx.challenge.deadlineAtMs - nowMs).clamp(0, 99 * 60 * 1000);
    final double timeProgress = _ctx.challenge.durationMs <= 0
        ? 0
        : (remainingMs / _ctx.challenge.durationMs).clamp(0.0, 1.0);
    final int lockedCount = rings.where((_RingSpec r) => r.locked).length;
    final int activeIndex = _asInt(_cfg['activeRingIndex']) ?? 0;
    final String result = (_cfg['result'] as String?) ?? 'active';
    final bool canLock = !_pendingLock &&
        !_ctx.isInteractionLocked &&
        result == 'active' &&
        rings.length == 3 &&
        _cfg['isParticipant'] != false &&
        nowMs <= _ctx.challenge.deadlineAtMs &&
        (_entranceDone || _skipEntrance || _motionReduced);

    final List<double> angles = rings
        .map((_RingSpec r) => _angleForRing(r, nowMs))
        .toList(growable: false);

    final String timeLabel = _formatMmSs(remainingMs);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      child: Column(
        children: <Widget>[
          _TimePanel(
            label: resolver.resolve(timeKey),
            timeLabel: timeLabel,
            progress: timeProgress,
            shimmer: _motionReduced
                ? 0
                : (_tickElapsed.inMilliseconds % 1800) / 1800,
          ),
          const SizedBox(height: 8),
          AnimatedBuilder(
            animation: _entrance,
            builder: (BuildContext context, Widget? child) {
              final double t = _entrance.value;
              return Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, (1 - t) * 12),
                  child: child,
                ),
              );
            },
            child: Column(
              children: <Widget>[
                Text(
                  resolver.resolve(titleKey),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                        color: LhColors.success,
                        fontWeight: FontWeight.w800,
                        shadows: <Shadow>[
                          Shadow(
                            color: LhColors.success.withValues(alpha: 0.55),
                            blurRadius: 18,
                          ),
                        ],
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  resolver.resolve(promptKey),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: LhColors.text,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Expanded(
            child: LayoutBuilder(
              builder: (BuildContext context, BoxConstraints constraints) {
                final double side = math.min(
                  constraints.maxWidth,
                  constraints.maxHeight,
                );
                return Center(
                  child: SizedBox(
                    width: side,
                    height: side,
                    child: RepaintBoundary(
                      child: AnimatedBuilder(
                        animation: Listenable.merge(<Listenable>[
                          _entrance,
                          _breathe,
                          _lockBurst,
                          _missShake,
                          _successFinale,
                          _timeoutDim,
                        ]),
                        builder: (BuildContext context, Widget? child) {
                          final double shake = _missShake.isAnimating
                              ? math.sin(_missShake.value * math.pi * 6) *
                                  (1 - _missShake.value) *
                                  5
                              : 0;
                          return Transform.translate(
                            offset: Offset(shake, 0),
                            child: CustomPaint(
                              painter: _RingLockPainter(
                                rings: rings,
                                anglesDeg: angles,
                                activeIndex: activeIndex,
                                lockedCount: lockedCount,
                                targetAngleDeg:
                                    (_asNum(_cfg['targetAngleDeg']) ?? 0)
                                        .toDouble(),
                                entrance: _entrance.value,
                                breathe: _motionReduced ? 0.5 : _breathe.value,
                                lockBurst: _lockBurst.value,
                                success: _successFinale.value,
                                timeout: _timeoutDim.value,
                                tickMs: _tickElapsed.inMilliseconds,
                                reduceMotion: _motionReduced,
                                result: result,
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
          const SizedBox(height: 4),
          _StatusRow(
            labels: <String>[
              resolver.resolve(ring1),
              resolver.resolve(ring2),
              resolver.resolve(ring3),
            ],
            lockedLabels: resolver.resolve(lockedKey),
            rotatingLabel: resolver.resolve(rotatingKey),
            failedLabel: resolver.resolve(failedKey),
            rings: rings,
            activeIndex: activeIndex,
            result: result,
          ),
          const SizedBox(height: 10),
          AnimatedBuilder(
            animation: Listenable.merge(<Listenable>[_entrance, _buttonPress]),
            builder: (BuildContext context, Widget? child) {
              final double slide = (1 - _entrance.value) * 28;
              final double scale = 1 - (_buttonPress.value * 0.06);
              return Opacity(
                opacity: _entrance.value.clamp(0.0, 1.0),
                child: Transform.translate(
                  offset: Offset(0, slide),
                  child: Transform.scale(
                    scale: scale,
                    child: child,
                  ),
                ),
              );
            },
            child: Semantics(
              button: true,
              enabled: canLock,
              label: resolver.resolve(a11yButton),
              child: _LockButton(
                label: resolver.resolve(actionKey),
                enabled: canLock,
                pending: _pendingLock,
                onPressed: _onLockPressed,
                shimmer: _motionReduced
                    ? 0
                    : (_tickElapsed.inMilliseconds % 2200) / 2200,
              ),
            ),
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

class _TimePanel extends StatelessWidget {
  const _TimePanel({
    required this.label,
    required this.timeLabel,
    required this.progress,
    required this.shimmer,
  });

  final String label;
  final String timeLabel;
  final double progress;
  final double shimmer;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Row(
          children: <Widget>[
            Expanded(
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: LhColors.success.withValues(alpha: 0.9),
                    ),
              ),
            ),
            Directionality(
              textDirection: TextDirection.ltr,
              child: Text(
                timeLabel,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: LhColors.success,
                      fontFeatures: const <ui.FontFeature>[
                        ui.FontFeature.tabularFigures(),
                      ],
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        SizedBox(
          height: 10,
          width: double.infinity,
          child: CustomPaint(
            painter: _TimerBarPainter(progress: progress, shimmer: shimmer),
          ),
        ),
      ],
    );
  }
}

class _TimerBarPainter extends CustomPainter {
  _TimerBarPainter({required this.progress, required this.shimmer});

  final double progress;
  final double shimmer;

  @override
  void paint(Canvas canvas, Size size) {
    final RRect frame = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(4),
    );
    canvas.drawRRect(
      frame,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = LhColors.success.withValues(alpha: 0.55),
    );
    final double fillW = size.width * progress.clamp(0.0, 1.0);
    if (fillW <= 0) return;
    final Rect fill = Rect.fromLTWH(0, 1.5, fillW, size.height - 3);
    canvas.drawRRect(
      RRect.fromRectAndRadius(fill, const Radius.circular(3)),
      Paint()
        ..shader = ui.Gradient.linear(
          fill.topLeft,
          fill.topRight,
          <Color>[
            const Color(0xFF0A3A4A),
            LhColors.success,
            const Color(0xFF7CF0FF),
          ],
          <double>[0, 0.55, 1],
        ),
    );
    final double hx = (fillW * shimmer).clamp(0.0, fillW);
    canvas.drawRect(
      Rect.fromLTWH(hx - 12, 1.5, 24, size.height - 3),
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(hx - 12, 0),
          Offset(hx + 12, 0),
          <Color>[
            Colors.transparent,
            Colors.white.withValues(alpha: 0.35),
            Colors.transparent,
          ],
          const <double>[0, 0.5, 1],
        ),
    );
  }

  @override
  bool shouldRepaint(covariant _TimerBarPainter oldDelegate) {
    return oldDelegate.progress != progress || oldDelegate.shimmer != shimmer;
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.labels,
    required this.lockedLabels,
    required this.rotatingLabel,
    required this.failedLabel,
    required this.rings,
    required this.activeIndex,
    required this.result,
  });

  final List<String> labels;
  final String lockedLabels;
  final String rotatingLabel;
  final String failedLabel;
  final List<_RingSpec> rings;
  final int activeIndex;
  final String result;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List<Widget>.generate(3, (int i) {
        final bool locked = i < rings.length && rings[i].locked;
        final bool active = !locked && i == activeIndex && result == 'active';
        final bool failed = !locked &&
            (result == 'timeout' || result == 'failed') &&
            i == activeIndex;
        final Color accent = locked
            ? LhColors.success
            : failed
                ? const Color(0xFFFF6B4A)
                : active
                    ? LhColors.warning
                    : LhColors.success.withValues(alpha: 0.7);
        final String status = locked
            ? lockedLabels
            : failed
                ? failedLabel
                : rotatingLabel;
        final IconData icon = locked
            ? Icons.lock
            : failed
                ? Icons.lock_open
                : Icons.sync;
        return Expanded(
          child: Semantics(
            label: '${labels[i]}, $status',
            child: Column(
              children: <Widget>[
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: accent.withValues(alpha: locked ? 0.22 : 0.1),
                    border: Border.all(color: accent, width: 1.6),
                    boxShadow: <BoxShadow>[
                      BoxShadow(
                        color: accent.withValues(alpha: 0.35),
                        blurRadius: 10,
                      ),
                    ],
                  ),
                  child: Icon(icon, color: accent, size: 20),
                ),
                const SizedBox(height: 4),
                Text(
                  labels[i],
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: LhColors.text,
                        fontSize: 11,
                      ),
                ),
                Text(
                  status,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ],
            ),
          ),
        );
      }),
    );
  }
}

class _LockButton extends StatelessWidget {
  const _LockButton({
    required this.label,
    required this.enabled,
    required this.pending,
    required this.onPressed,
    required this.shimmer,
  });

  final String label;
  final bool enabled;
  final bool pending;
  final VoidCallback onPressed;
  final double shimmer;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onPressed : null,
          borderRadius: BorderRadius.circular(28),
          child: CustomPaint(
            painter: _LockButtonPainter(
              enabled: enabled,
              pending: pending,
              shimmer: shimmer,
            ),
            child: Center(
              child: Text(
                label,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                    ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LockButtonPainter extends CustomPainter {
  _LockButtonPainter({
    required this.enabled,
    required this.pending,
    required this.shimmer,
  });

  final bool enabled;
  final bool pending;
  final double shimmer;

  @override
  void paint(Canvas canvas, Size size) {
    final RRect r = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(28),
    );
    final Color edge = enabled
        ? LhColors.success
        : LhColors.success.withValues(alpha: 0.35);
    canvas.drawRRect(
      r.inflate(3),
      Paint()
        ..color = edge.withValues(alpha: 0.25)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );
    canvas.drawRRect(
      r,
      Paint()
        ..shader = ui.Gradient.linear(
          const Offset(0, 0),
          Offset(0, size.height),
          <Color>[
            const Color(0xFF061018),
            const Color(0xFF0A2A38),
            LhColors.success.withValues(alpha: enabled ? 0.55 : 0.2),
          ],
          <double>[0, 0.45, 1],
        ),
    );
    canvas.drawRRect(
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = edge,
    );
    final double sx = size.width * shimmer;
    canvas.drawRRect(
      r,
      Paint()
        ..blendMode = BlendMode.plus
        ..shader = ui.Gradient.linear(
          Offset(sx - 40, 0),
          Offset(sx + 40, 0),
          <Color>[
            Colors.transparent,
            Colors.white.withValues(alpha: pending ? 0.12 : 0.22),
            Colors.transparent,
          ],
          const <double>[0, 0.5, 1],
        ),
    );
  }

  @override
  bool shouldRepaint(covariant _LockButtonPainter oldDelegate) {
    return oldDelegate.enabled != enabled ||
        oldDelegate.pending != pending ||
        oldDelegate.shimmer != shimmer;
  }
}

class _RingLockPainter extends CustomPainter {
  _RingLockPainter({
    required this.rings,
    required this.anglesDeg,
    required this.activeIndex,
    required this.lockedCount,
    required this.targetAngleDeg,
    required this.entrance,
    required this.breathe,
    required this.lockBurst,
    required this.success,
    required this.timeout,
    required this.tickMs,
    required this.reduceMotion,
    required this.result,
  });

  final List<_RingSpec> rings;
  final List<double> anglesDeg;
  final int activeIndex;
  final int lockedCount;
  final double targetAngleDeg;
  final double entrance;
  final double breathe;
  final double lockBurst;
  final double success;
  final double timeout;
  final int tickMs;
  final bool reduceMotion;
  final String result;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double scale = (0.88 + 0.12 * entrance).clamp(0.88, 1.0);
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.scale(scale);
    canvas.translate(-c.dx, -c.dy);

    _paintBackground(canvas, size, c);
    _paintSideFrames(canvas, size);

    final double beamAlpha =
        (0.55 + 0.25 * math.sin(tickMs / 420)) * entrance * (1 - timeout * 0.7);
    _paintBeam(canvas, c, size.shortestSide * 0.42, beamAlpha);

    final List<double> radii = <double>[
      size.shortestSide * 0.42,
      size.shortestSide * 0.31,
      size.shortestSide * 0.20,
    ];

    for (int i = 0; i < rings.length && i < 3; i += 1) {
      final _RingSpec ring = rings[i];
      final double angle = i < anglesDeg.length ? anglesDeg[i] : 0;
      final bool active = !ring.locked && i == activeIndex && result == 'active';
      final double dim = ring.locked
          ? 1.0
          : active
              ? 1.0
              : 0.72;
      _paintRing(
        canvas,
        c,
        radii[i],
        angle,
        locked: ring.locked,
        active: active,
        dim: dim * (1 - timeout * 0.35),
        direction: ring.direction,
      );
    }

    _paintArrow(canvas, c, radii.first + 10, beamAlpha);
    _paintHeart(canvas, c, size.shortestSide * 0.07);
    if (!reduceMotion && success < 0.01 && timeout < 0.5) {
      _paintParticles(canvas, c, size.shortestSide * 0.45);
    }
    if (lockBurst > 0 && lockBurst < 1) {
      _paintLockBurst(canvas, c, radii[math.min(activeIndex, 2)]);
    }
    if (success > 0) {
      _paintSuccess(canvas, c, size.shortestSide * 0.48);
    }

    canvas.restore();
  }

  void _paintBackground(Canvas canvas, Size size, Offset c) {
    final Rect rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.radial(
          c,
          size.shortestSide * 0.65,
          <Color>[
            const Color(0xFF0A1C2E),
            const Color(0xFF040B16),
            const Color(0xFF02060E),
          ],
          <double>[0, 0.55, 1],
        ),
    );
    // Technical grid.
    final Paint grid = Paint()
      ..color = LhColors.success.withValues(alpha: 0.05 * entrance)
      ..strokeWidth = 1;
    const double step = 18;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    // Floor reflection disc.
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(c.dx, c.dy + size.shortestSide * 0.28),
        width: size.shortestSide * 0.7,
        height: size.shortestSide * 0.12,
      ),
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(c.dx, c.dy + size.shortestSide * 0.28),
          size.shortestSide * 0.35,
          <Color>[
            LhColors.success.withValues(alpha: 0.12 * entrance),
            Colors.transparent,
          ],
        ),
    );
  }

  void _paintSideFrames(Canvas canvas, Size size) {
    final Paint glow = Paint()
      ..color = LhColors.success.withValues(alpha: 0.35 * entrance)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    final Path left = Path()
      ..moveTo(10, 24)
      ..lineTo(22, 40)
      ..lineTo(22, size.height - 40)
      ..lineTo(10, size.height - 24);
    final Path right = Path()
      ..moveTo(size.width - 10, 24)
      ..lineTo(size.width - 22, 40)
      ..lineTo(size.width - 22, size.height - 40)
      ..lineTo(size.width - 10, size.height - 24);
    canvas.drawPath(left, glow);
    canvas.drawPath(right, glow);
    canvas.drawPath(
      left,
      Paint()
        ..shader = ui.Gradient.linear(
          const Offset(10, 0),
          Offset(24, size.height),
          <Color>[
            const Color(0xFF1A3348),
            LhColors.success.withValues(alpha: 0.5),
            const Color(0xFF1A3348),
          ],
          const <double>[0, 0.5, 1],
        )
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
    canvas.drawPath(
      right,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(size.width - 10, 0),
          Offset(size.width - 24, size.height),
          <Color>[
            const Color(0xFF1A3348),
            LhColors.success.withValues(alpha: 0.5),
            const Color(0xFF1A3348),
          ],
          const <double>[0, 0.5, 1],
        )
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  void _paintBeam(Canvas canvas, Offset c, double length, double alpha) {
    final double flicker = reduceMotion
        ? 1
        : 0.85 + 0.15 * math.sin(tickMs / 180);
    final Paint beam = Paint()
      ..shader = ui.Gradient.linear(
        Offset(c.dx, c.dy - length),
        Offset(c.dx, c.dy),
        <Color>[
          LhColors.success.withValues(alpha: 0.05),
          LhColors.success.withValues(alpha: 0.55 * alpha * flicker),
          LhColors.success.withValues(alpha: 0.15 * alpha),
        ],
        const <double>[0, 0.55, 1],
      )
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
      Offset(c.dx, c.dy - length),
      Offset(c.dx, c.dy),
      beam,
    );
    canvas.drawLine(
      Offset(c.dx, c.dy - length),
      Offset(c.dx, c.dy),
      Paint()
        ..color = LhColors.success.withValues(alpha: 0.25 * alpha * flicker)
        ..strokeWidth = 8
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
  }

  void _paintArrow(Canvas canvas, Offset c, double y, double alpha) {
    final double pulse = reduceMotion ? 1 : 0.75 + 0.25 * breathe;
    final Path tri = Path()
      ..moveTo(c.dx, c.dy - y + 4)
      ..lineTo(c.dx - 12, c.dy - y - 16)
      ..lineTo(c.dx + 12, c.dy - y - 16)
      ..close();
    canvas.drawPath(
      tri,
      Paint()
        ..color = LhColors.success.withValues(alpha: 0.35 * alpha * pulse)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );
    canvas.drawPath(
      tri,
      Paint()..color = LhColors.success.withValues(alpha: 0.95 * alpha * pulse),
    );
  }

  void _paintRing(
    Canvas canvas,
    Offset c,
    double radius,
    double markerAngleDeg, {
    required bool locked,
    required bool active,
    required double dim,
    required int direction,
  }) {
    const int segments = 24;
    final double stroke = radius * 0.11;
    final double halo = active ? (0.55 + 0.25 * breathe) : 0.25;
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke + 6
        ..color = LhColors.success.withValues(alpha: 0.12 * dim * halo)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );

    for (int s = 0; s < segments; s += 1) {
      final double a0 = (s / segments) * math.pi * 2 - math.pi / 2;
      final double a1 = ((s + 0.82) / segments) * math.pi * 2 - math.pi / 2;
      final Path seg = Path()
        ..addArc(
          Rect.fromCircle(center: c, radius: radius),
          a0,
          a1 - a0,
        );
      final bool bright = ((s + (tickMs / 80).floor()) % 5) == 0;
      canvas.drawPath(
        seg,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.butt
          ..color = Color.lerp(
            const Color(0xFF0B1E30),
            LhColors.success,
            (locked ? 0.55 : (bright ? 0.35 : 0.18)) * dim,
          )!,
      );
      canvas.drawPath(
        seg,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.4
          ..color = LhColors.success.withValues(alpha: 0.45 * dim),
      );
    }

    // Specular highlight traveling around the ring.
    if (!reduceMotion) {
      final double spec = (tickMs / 14.0) * direction;
      final double sa = _degToRad(spec) - math.pi / 2;
      final Offset sp = Offset(
        c.dx + math.cos(sa) * radius,
        c.dy + math.sin(sa) * radius,
      );
      canvas.drawCircle(
        sp,
        stroke * 0.55,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.35 * dim)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
      );
    }

    // Lock marker.
    final double markerRad = _degToRad(markerAngleDeg) - math.pi / 2;
    final Offset mp = Offset(
      c.dx + math.cos(markerRad) * radius,
      c.dy + math.sin(markerRad) * radius,
    );
    final Color markerColor = locked
        ? Color.lerp(
              Colors.white,
              LhColors.success,
              lockBurst > 0.2 ? 1 : 0.85,
            )!
        : (result == 'timeout' && active
            ? const Color(0xFFFF6B4A)
            : LhColors.warning);
    canvas.drawCircle(
      mp,
      stroke * 0.72,
      Paint()
        ..color = markerColor.withValues(alpha: 0.45)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawCircle(mp, stroke * 0.55, Paint()..color = markerColor);
    canvas.drawCircle(
      mp,
      stroke * 0.55,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = Colors.white.withValues(alpha: 0.7),
    );

    // Direction chevron outside the ring.
    final double dirAng = markerRad + direction * 0.55;
    final Offset dp = Offset(
      c.dx + math.cos(dirAng) * (radius + stroke * 0.95),
      c.dy + math.sin(dirAng) * (radius + stroke * 0.95),
    );
    final Path chev = Path()
      ..moveTo(dp.dx, dp.dy)
      ..relativeLineTo(-6.0 * direction, -5)
      ..relativeLineTo(0, 10)
      ..close();
    canvas.drawPath(
      chev,
      Paint()
        ..color = (locked ? LhColors.success : markerColor)
            .withValues(alpha: 0.85 * dim),
    );
  }

  void _paintHeart(Canvas canvas, Offset c, double r) {
    final double beat = reduceMotion
        ? 1
        : 1 + 0.04 * math.sin(breathe * math.pi * 2) * (1 + lockedCount * 0.15);
    final double fill = (lockedCount / 3.0).clamp(0.0, 1.0);
    final double glow = (0.25 + fill * 0.55 + success * 0.4) * (1 - timeout);
    final Path heart = _heartPath(c, r * beat);
    canvas.drawPath(
      heart,
      Paint()
        ..color = LhColors.success.withValues(alpha: glow * 0.45)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
    canvas.drawPath(
      heart,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..color = LhColors.success.withValues(
          alpha: (0.45 + fill * 0.5) * (1 - timeout * 0.7),
        ),
    );
    if (fill > 0) {
      canvas.drawPath(
        heart,
        Paint()
          ..color = LhColors.success.withValues(alpha: 0.15 + fill * 0.55),
      );
    }
    if (success > 0.2) {
      canvas.drawPath(
        heart,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.25 * success)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
      );
    }
  }

  Path _heartPath(Offset c, double r) {
    final Path p = Path();
    p.moveTo(c.dx, c.dy + r * 0.7);
    p.cubicTo(
      c.dx - r * 1.2,
      c.dy + r * 0.1,
      c.dx - r * 1.1,
      c.dy - r * 0.8,
      c.dx,
      c.dy - r * 0.35,
    );
    p.cubicTo(
      c.dx + r * 1.1,
      c.dy - r * 0.8,
      c.dx + r * 1.2,
      c.dy + r * 0.1,
      c.dx,
      c.dy + r * 0.7,
    );
    p.close();
    return p;
  }

  void _paintParticles(Canvas canvas, Offset c, double radius) {
    final math.Random rng = math.Random(42);
    for (int i = 0; i < 10; i += 1) {
      final double base = rng.nextDouble() * math.pi * 2;
      final double rise = ((tickMs / 40) + i * 37) % 120 / 120;
      final double ang = base + rise * 0.4;
      final double rad = radius * (0.55 + rise * 0.45);
      final Offset p = Offset(
        c.dx + math.cos(ang) * rad,
        c.dy + math.sin(ang) * rad - rise * 20,
      );
      canvas.drawCircle(
        p,
        1.4 + rng.nextDouble(),
        Paint()
          ..color = LhColors.success.withValues(alpha: 0.35 * (1 - rise)),
      );
    }
  }

  void _paintLockBurst(Canvas canvas, Offset c, double radius) {
    final double t = lockBurst;
    canvas.drawCircle(
      c,
      radius * (0.9 + t * 0.35),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3 * (1 - t)
        ..color = LhColors.success.withValues(alpha: 0.55 * (1 - t)),
    );
    canvas.drawCircle(
      c,
      radius * (0.7 + t * 0.5),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2 * (1 - t)
        ..color = Colors.white.withValues(alpha: 0.35 * (1 - t)),
    );
  }

  void _paintSuccess(Canvas canvas, Offset c, double radius) {
    final double t = success;
    for (int i = 0; i < 8; i += 1) {
      final double a = (i / 8) * math.pi * 2 - math.pi / 2;
      final double len = radius * (0.3 + 0.5 * t);
      canvas.drawLine(
        Offset(c.dx + math.cos(a) * 12, c.dy + math.sin(a) * 12),
        Offset(c.dx + math.cos(a) * len, c.dy + math.sin(a) * len),
        Paint()
          ..color = LhColors.success.withValues(alpha: 0.45 * (1 - t * 0.3))
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round,
      );
    }
    if (!reduceMotion) {
      canvas.drawCircle(
        c,
        radius * t,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 4 * (1 - t)
          ..color = LhColors.success.withValues(alpha: 0.5 * (1 - t)),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RingLockPainter oldDelegate) {
    return oldDelegate.tickMs != tickMs ||
        oldDelegate.entrance != entrance ||
        oldDelegate.breathe != breathe ||
        oldDelegate.lockBurst != lockBurst ||
        oldDelegate.success != success ||
        oldDelegate.timeout != timeout ||
        oldDelegate.activeIndex != activeIndex ||
        oldDelegate.lockedCount != lockedCount ||
        oldDelegate.result != result ||
        oldDelegate.anglesDeg != anglesDeg ||
        oldDelegate.rings != rings;
  }
}

double _normalizeDeg(double angle) {
  final double mod = angle % 360;
  return mod < 0 ? mod + 360 : mod;
}

double _degToRad(double deg) => deg * math.pi / 180.0;

int? _asInt(Object? v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  return null;
}

num? _asNum(Object? v) {
  if (v is num) return v;
  return null;
}

String _formatMmSs(int remainingMs) {
  final int totalSec = (remainingMs / 1000).ceil().clamp(0, 99 * 60);
  final int m = totalSec ~/ 60;
  final int s = totalSec % 60;
  final String mm = m.toString().padLeft(2, '0');
  final String ss = s.toString().padLeft(2, '0');
  // Timer digits stay LTR regardless of Arabic UI.
  return '$mm:$ss';
}
