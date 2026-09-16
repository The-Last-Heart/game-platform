import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
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
                        color: const Color(0xFF7CF7FF),
                        fontWeight: FontWeight.w800,
                        fontSize: 30,
                        height: 1.15,
                        shadows: const <Shadow>[
                          Shadow(color: Color(0xAA22E7F2), blurRadius: 8),
                          Shadow(color: Color(0x8822E7F2), blurRadius: 22),
                          Shadow(color: Color(0x5522E7F2), blurRadius: 40),
                        ],
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  resolver.resolve(promptKey),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFFD7EEF5),
                        fontWeight: FontWeight.w500,
                        shadows: const <Shadow>[
                          Shadow(color: Color(0x4422E7F2), blurRadius: 10),
                        ],
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

// ---------------------------------------------------------------------------
// Visual chrome — match reference: thick metallic segments, amber lock wedges,
// chamber pillars, neon bloom, hexagonal lock button.
// ---------------------------------------------------------------------------

const Color _kCyan = Color(0xFF22E7F2);
const Color _kCyanBright = Color(0xFF7CF7FF);
const Color _kCyanDeep = Color(0xFF0A3A4A);
const Color _kNavy = Color(0xFF071526);
const Color _kNavyMid = Color(0xFF0D2740);
const Color _kAmber = Color(0xFFFFC247);
const Color _kAmberHot = Color(0xFFFFE08A);
const Color _kFail = Color(0xFFFF6B4A);

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
                      color: _kCyanBright.withValues(alpha: 0.95),
                      fontWeight: FontWeight.w600,
                      shadows: const <Shadow>[
                        Shadow(color: Color(0x6622E7F2), blurRadius: 8),
                      ],
                    ),
              ),
            ),
            Directionality(
              textDirection: TextDirection.ltr,
              child: Text(
                timeLabel,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: _kCyanBright,
                      fontFeatures: const <ui.FontFeature>[
                        ui.FontFeature.tabularFigures(),
                      ],
                      fontWeight: FontWeight.w800,
                      shadows: const <Shadow>[
                        Shadow(color: Color(0x8822E7F2), blurRadius: 12),
                      ],
                    ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 12,
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
      Rect.fromLTWH(0, 1, size.width, size.height - 2),
      const Radius.circular(3),
    );
    canvas.drawRRect(
      frame.inflate(2),
      Paint()
        ..color = _kCyan.withValues(alpha: 0.22)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    canvas.drawRRect(
      frame,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = _kCyan.withValues(alpha: 0.7),
    );
    final double fillW = (size.width - 4) * progress.clamp(0.0, 1.0);
    if (fillW <= 0) return;
    final Rect fill = Rect.fromLTWH(2, 3, fillW, size.height - 6);
    canvas.drawRRect(
      RRect.fromRectAndRadius(fill, const Radius.circular(2)),
      Paint()
        ..shader = ui.Gradient.linear(
          fill.centerLeft,
          fill.centerRight,
          const <Color>[_kCyanDeep, _kCyan, _kCyanBright],
          const <double>[0, 0.55, 1],
        ),
    );
    final double hx = fill.left + fill.width * shimmer;
    canvas.drawRect(
      Rect.fromLTWH(hx - 16, fill.top, 32, fill.height),
      Paint()
        ..blendMode = BlendMode.plus
        ..shader = ui.Gradient.linear(
          Offset(hx - 16, 0),
          Offset(hx + 16, 0),
          <Color>[
            Colors.transparent,
            Colors.white.withValues(alpha: 0.45),
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
            ? _kCyan
            : failed
                ? _kFail
                : active
                    ? _kAmber
                    : _kCyan.withValues(alpha: 0.75);
        final String status = locked
            ? lockedLabels
            : failed
                ? failedLabel
                : rotatingLabel;
        return Expanded(
          child: Semantics(
            label: '${labels[i]}, $status',
            child: Column(
              children: <Widget>[
                SizedBox(
                  width: 52,
                  height: 52,
                  child: CustomPaint(
                    painter: _StatusBadgePainter(
                      accent: accent,
                      locked: locked,
                      active: active,
                      failed: failed,
                    ),
                    child: Icon(
                      locked
                          ? Icons.lock_rounded
                          : failed
                              ? Icons.lock_open_rounded
                              : Icons.sync_rounded,
                      color: Colors.white,
                      size: 22,
                      shadows: <Shadow>[
                        Shadow(color: accent.withValues(alpha: 0.9), blurRadius: 10),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  labels[i],
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: const Color(0xFFE8F6FA),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                ),
                Text(
                  status,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        shadows: <Shadow>[
                          Shadow(color: accent.withValues(alpha: 0.55), blurRadius: 8),
                        ],
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

class _StatusBadgePainter extends CustomPainter {
  _StatusBadgePainter({
    required this.accent,
    required this.locked,
    required this.active,
    required this.failed,
  });

  final Color accent;
  final bool locked;
  final bool active;
  final bool failed;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.shortestSide * 0.46;
    canvas.drawCircle(
      c,
      r + 4,
      Paint()
        ..color = accent.withValues(alpha: active || locked ? 0.4 : 0.2)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..shader = ui.Gradient.radial(
          c,
          r,
          <Color>[
            accent.withValues(alpha: locked ? 0.45 : 0.18),
            _kNavy.withValues(alpha: 0.92),
          ],
        ),
    );
    // Mini segmented ring.
    const int segs = 12;
    for (int s = 0; s < segs; s += 1) {
      final double a0 = (s / segs) * math.pi * 2 - math.pi / 2;
      final double sweep = (math.pi * 2 / segs) * 0.72;
      final bool marker = s == 0;
      final Color col = marker && !locked
          ? (failed ? _kFail : _kAmber)
          : accent.withValues(alpha: locked ? 0.95 : 0.7);
      canvas.drawArc(
        Rect.fromCircle(center: c, radius: r * 0.88),
        a0,
        sweep,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3.2
          ..strokeCap = StrokeCap.butt
          ..color = col,
      );
    }
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.8
        ..color = accent,
    );
  }

  @override
  bool shouldRepaint(covariant _StatusBadgePainter oldDelegate) {
    return oldDelegate.accent != accent ||
        oldDelegate.locked != locked ||
        oldDelegate.active != active ||
        oldDelegate.failed != failed;
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
      height: 56,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onPressed : null,
          customBorder: const _BevelButtonBorder(),
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
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.4,
                      fontSize: 26,
                      shadows: const <Shadow>[
                        Shadow(color: Color(0xAA22E7F2), blurRadius: 12),
                        Shadow(color: Color(0x66000000), blurRadius: 4),
                      ],
                    ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BevelButtonBorder extends ShapeBorder {
  const _BevelButtonBorder();

  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.zero;

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) =>
      _bevelPath(rect.deflate(2));

  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) =>
      _bevelPath(rect);

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {}

  @override
  ShapeBorder scale(double t) => this;
}

Path _bevelPath(Rect rect) {
  final double cut = math.min(18, rect.height * 0.38);
  return Path()
    ..moveTo(rect.left + cut, rect.top)
    ..lineTo(rect.right - cut, rect.top)
    ..lineTo(rect.right, rect.top + cut)
    ..lineTo(rect.right, rect.bottom - cut)
    ..lineTo(rect.right - cut, rect.bottom)
    ..lineTo(rect.left + cut, rect.bottom)
    ..lineTo(rect.left, rect.bottom - cut)
    ..lineTo(rect.left, rect.top + cut)
    ..close();
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
    final Rect rect = Offset.zero & size;
    final Path path = _bevelPath(rect);
    final Color edge = enabled ? _kCyanBright : _kCyan.withValues(alpha: 0.35);

    canvas.drawPath(
      path,
      Paint()
        ..color = edge.withValues(alpha: enabled ? 0.45 : 0.18)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 16),
    );
    canvas.drawPath(
      path,
      Paint()
        ..shader = ui.Gradient.linear(
          rect.topCenter,
          rect.bottomCenter,
          <Color>[
            const Color(0xFF051018),
            const Color(0xFF0A2C3C),
            _kCyan.withValues(alpha: enabled ? 0.65 : 0.22),
          ],
          const <double>[0, 0.42, 1],
        ),
    );
    // Inner bevel highlight.
    canvas.drawPath(
      _bevelPath(rect.deflate(3)),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = Colors.white.withValues(alpha: enabled ? 0.28 : 0.1),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..color = edge,
    );
    final double sx = size.width * shimmer;
    canvas.save();
    canvas.clipPath(path);
    canvas.drawRect(
      rect,
      Paint()
        ..blendMode = BlendMode.plus
        ..shader = ui.Gradient.linear(
          Offset(sx - 50, 0),
          Offset(sx + 50, 0),
          <Color>[
            Colors.transparent,
            Colors.white.withValues(alpha: pending ? 0.1 : 0.28),
            Colors.transparent,
          ],
          const <double>[0, 0.5, 1],
        ),
    );
    canvas.restore();
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

  static const int _segments = 28;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double scale = (0.88 + 0.12 * entrance).clamp(0.88, 1.0);
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.scale(scale);
    canvas.translate(-c.dx, -c.dy);

    _paintChamber(canvas, size, c);

    final double beamLen = size.shortestSide * 0.44;
    final double beamAlpha =
        (0.7 + 0.25 * math.sin(tickMs / 380)) * entrance * (1 - timeout * 0.75);

    final List<double> radii = <double>[
      size.shortestSide * 0.435,
      size.shortestSide * 0.325,
      size.shortestSide * 0.215,
    ];
    final List<double> thicknesses = <double>[
      size.shortestSide * 0.055,
      size.shortestSide * 0.048,
      size.shortestSide * 0.042,
    ];

    // Beam under rings so segments sit on top of it.
    _paintBeam(canvas, c, beamLen, beamAlpha);

    for (int i = rings.length - 1; i >= 0; i -= 1) {
      if (i >= radii.length) continue;
      final _RingSpec ring = rings[i];
      final double angle = i < anglesDeg.length ? anglesDeg[i] : 0;
      final bool active = !ring.locked && i == activeIndex && result == 'active';
      final double dim = (ring.locked
              ? 1.0
              : active
                  ? 1.0
                  : 0.78) *
          (1 - timeout * 0.4);
      _paintMetallicRing(
        canvas,
        c,
        radii[i],
        thicknesses[i],
        angle,
        locked: ring.locked,
        active: active,
        dim: dim,
        direction: ring.direction,
        ringIndex: i,
      );
    }

    _paintGateArrow(canvas, c, radii.first + thicknesses.first * 0.7, beamAlpha);
    _paintHeart(canvas, c, size.shortestSide * 0.075);

    if (!reduceMotion && success < 0.02 && timeout < 0.4) {
      _paintRisingParticles(canvas, c, size.shortestSide * 0.48);
    }
    if (lockBurst > 0 && lockBurst < 1) {
      _paintLockBurst(canvas, c, radii[math.min(activeIndex, 2)]);
    }
    if (success > 0) {
      _paintSuccess(canvas, c, size.shortestSide * 0.5);
    }

    canvas.restore();
  }

  void _paintChamber(Canvas canvas, Size size, Offset c) {
    final Rect rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.radial(
          c,
          size.shortestSide * 0.72,
          const <Color>[
            Color(0xFF0B1E32),
            Color(0xFF050E1A),
            Color(0xFF02060D),
          ],
          const <double>[0, 0.55, 1],
        ),
    );

    // Soft hex / tech grid.
    final Paint grid = Paint()
      ..color = _kCyan.withValues(alpha: 0.045 * entrance)
      ..strokeWidth = 1;
    const double step = 16;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    // Side pillars with vertical neon strips.
    _paintPillar(canvas, size, left: true);
    _paintPillar(canvas, size, left: false);

    // Floor reflection pool.
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(c.dx, c.dy + size.shortestSide * 0.34),
        width: size.shortestSide * 0.78,
        height: size.shortestSide * 0.14,
      ),
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(c.dx, c.dy + size.shortestSide * 0.34),
          size.shortestSide * 0.4,
          <Color>[
            _kCyan.withValues(alpha: 0.16 * entrance),
            Colors.transparent,
          ],
        ),
    );
  }

  void _paintPillar(Canvas canvas, Size size, {required bool left}) {
    final double x = left ? 8.0 : size.width - 8.0;
    final double inset = left ? 18.0 : size.width - 18.0;
    final double pulse = reduceMotion
        ? 1
        : 0.75 + 0.25 * math.sin((tickMs / 500) + (left ? 0 : 1.4));

    final Path frame = Path()
      ..moveTo(x, 20)
      ..lineTo(inset, 36)
      ..lineTo(inset, size.height - 36)
      ..lineTo(x, size.height - 20);

    canvas.drawPath(
      frame,
      Paint()
        ..color = _kCyan.withValues(alpha: 0.28 * entrance * pulse)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawPath(
      frame,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..shader = ui.Gradient.linear(
          Offset(x, 0),
          Offset(inset, size.height),
          <Color>[
            _kNavyMid,
            _kCyan.withValues(alpha: 0.85 * pulse),
            _kNavyMid,
          ],
          const <double>[0, 0.5, 1],
        ),
    );

    // Vertical neon filament.
    final double fx = left ? 14.0 : size.width - 14.0;
    canvas.drawLine(
      Offset(fx, 48),
      Offset(fx, size.height - 48),
      Paint()
        ..color = _kCyan.withValues(alpha: 0.35 * entrance * pulse)
        ..strokeWidth = 3
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    canvas.drawLine(
      Offset(fx, 48),
      Offset(fx, size.height - 48),
      Paint()
        ..color = _kCyanBright.withValues(alpha: 0.7 * entrance * pulse)
        ..strokeWidth = 1.2,
    );
  }

  void _paintBeam(Canvas canvas, Offset c, double length, double alpha) {
    final double flicker = reduceMotion
        ? 1
        : 0.88 + 0.12 * math.sin(tickMs / 160);
    final Offset top = Offset(c.dx, c.dy - length);
    canvas.drawLine(
      top,
      c,
      Paint()
        ..color = _kCyan.withValues(alpha: 0.22 * alpha * flicker)
        ..strokeWidth = 14
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
    canvas.drawLine(
      top,
      c,
      Paint()
        ..shader = ui.Gradient.linear(
          top,
          c,
          <Color>[
            _kCyanBright.withValues(alpha: 0.15 * alpha),
            _kCyan.withValues(alpha: 0.85 * alpha * flicker),
            _kCyan.withValues(alpha: 0.2 * alpha),
          ],
          const <double>[0, 0.35, 1],
        )
        ..strokeWidth = 3.2
        ..strokeCap = StrokeCap.round,
    );
  }

  void _paintGateArrow(Canvas canvas, Offset c, double y, double alpha) {
    final double pulse = reduceMotion ? 1 : 0.72 + 0.28 * breathe;
    final Path tri = Path()
      ..moveTo(c.dx, c.dy - y + 2)
      ..lineTo(c.dx - 14, c.dy - y - 18)
      ..lineTo(c.dx + 14, c.dy - y - 18)
      ..close();
    canvas.drawPath(
      tri,
      Paint()
        ..color = _kCyan.withValues(alpha: 0.45 * alpha * pulse)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
    );
    canvas.drawPath(
      tri,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(c.dx, c.dy - y - 18),
          Offset(c.dx, c.dy - y + 2),
          <Color>[
            _kCyanBright.withValues(alpha: alpha * pulse),
            _kCyan.withValues(alpha: alpha * pulse),
          ],
        ),
    );
  }

  void _paintMetallicRing(
    Canvas canvas,
    Offset c,
    double radius,
    double thickness,
    double markerAngleDeg, {
    required bool locked,
    required bool active,
    required double dim,
    required int direction,
    required int ringIndex,
  }) {
    final double rOuter = radius + thickness * 0.5;
    final double rInner = radius - thickness * 0.5;
    final double halo = active
        ? (0.55 + 0.35 * breathe)
        : locked
            ? 0.5
            : 0.22;

    // Soft neon halo around the whole ring.
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = thickness + 10
        ..color = _kCyan.withValues(alpha: 0.14 * dim * halo)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );

    // Rotate so segment 0 (lock marker) is centered on markerAngleDeg.
    final double segSweep = (math.pi * 2) / _segments;
    final double markerCenter =
        _degToRad(markerAngleDeg) - math.pi / 2;
    final double base = markerCenter - segSweep * 0.5;

    for (int s = 0; s < _segments; s += 1) {
      final double a0 = base + s * segSweep + 0.012;
      final double a1 = base + (s + 1) * segSweep - 0.012;
      final bool isMarker = s == 0;
      final Path seg = _annularSegment(c, rOuter, rInner, a0, a1);

      Color fillLow = _kNavy;
      Color fillHigh = _kNavyMid;
      Color edge = _kCyan.withValues(alpha: 0.75 * dim);
      if (isMarker) {
        if (locked) {
          fillLow = const Color(0xFF0A4A55);
          fillHigh = _kCyanBright;
          edge = Colors.white.withValues(alpha: 0.95);
        } else if (result == 'timeout' && active) {
          fillLow = const Color(0xFF4A1810);
          fillHigh = _kFail;
          edge = _kFail;
        } else {
          fillLow = const Color(0xFF5A3A08);
          fillHigh = _kAmberHot;
          edge = _kAmberHot;
        }
      } else if (locked) {
        fillLow = const Color(0xFF083040);
        fillHigh = Color.lerp(_kNavyMid, _kCyan, 0.35)!;
        edge = _kCyanBright.withValues(alpha: 0.9 * dim);
      }

      // Marker bloom.
      if (isMarker) {
        canvas.drawPath(
          seg,
          Paint()
            ..color = (locked ? _kCyan : _kAmber).withValues(alpha: 0.45 * dim)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
        );
      }

      canvas.drawPath(
        seg,
        Paint()
          ..shader = ui.Gradient.radial(
            c,
            rOuter,
            <Color>[
              fillHigh.withValues(alpha: dim),
              fillLow.withValues(alpha: dim),
            ],
            <double>[rInner / rOuter * 0.85, 1],
          ),
      );

      // Outer / inner edge highlights.
      canvas.drawArc(
        Rect.fromCircle(center: c, radius: rOuter - 0.6),
        a0,
        a1 - a0,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..color = edge,
      );
      canvas.drawArc(
        Rect.fromCircle(center: c, radius: rInner + 0.6),
        a0,
        a1 - a0,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.1
          ..color = _kCyanBright.withValues(alpha: 0.35 * dim),
      );

      // Traveling light streak on non-marker segments.
      if (!reduceMotion && !isMarker && ((s + tickMs ~/ 70 + ringIndex) % 7) == 0) {
        canvas.drawPath(
          seg,
          Paint()
            ..blendMode = BlendMode.plus
            ..color = Colors.white.withValues(alpha: 0.12 * dim),
        );
      }
    }

    // Active ring breathing outline.
    if (active) {
      canvas.drawCircle(
        c,
        radius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = thickness + 4
          ..color = _kAmber.withValues(alpha: 0.18 + 0.12 * breathe)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
      );
    }

    // Direction curved arrow outside the ring.
    _paintDirectionArrow(
      canvas,
      c,
      rOuter + 10,
      direction,
      locked ? _kCyan : (active ? _kAmber : _kCyanBright),
      dim,
    );
  }

  Path _annularSegment(
    Offset c,
    double rOuter,
    double rInner,
    double a0,
    double a1,
  ) {
    final Path p = Path();
    final Offset o0 = Offset(c.dx + math.cos(a0) * rOuter, c.dy + math.sin(a0) * rOuter);
    final Offset i1 = Offset(c.dx + math.cos(a1) * rInner, c.dy + math.sin(a1) * rInner);
    p.moveTo(o0.dx, o0.dy);
    p.arcTo(Rect.fromCircle(center: c, radius: rOuter), a0, a1 - a0, false);
    p.lineTo(i1.dx, i1.dy);
    p.arcTo(Rect.fromCircle(center: c, radius: rInner), a1, -(a1 - a0), false);
    p.close();
    return p;
  }

  void _paintDirectionArrow(
    Canvas canvas,
    Offset c,
    double radius,
    int direction,
    Color color,
    double dim,
  ) {
    // Place curved arrow near ~2 o'clock for CW, ~10 o'clock for CCW.
    final double mid = direction > 0 ? -0.35 : math.pi + 0.35;
    final double a0 = mid - 0.28 * direction;
    final double a1 = mid + 0.28 * direction;
    final Path arc = Path()
      ..addArc(Rect.fromCircle(center: c, radius: radius), a0, a1 - a0);
    canvas.drawPath(
      arc,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeCap = StrokeCap.round
        ..color = color.withValues(alpha: 0.85 * dim)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
    canvas.drawPath(
      arc,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..strokeCap = StrokeCap.round
        ..color = color.withValues(alpha: 0.95 * dim),
    );
    final Offset tip = Offset(
      c.dx + math.cos(a1) * radius,
      c.dy + math.sin(a1) * radius,
    );
    final double tang = a1 + (direction > 0 ? math.pi / 2 : -math.pi / 2);
    final Path head = Path()
      ..moveTo(tip.dx, tip.dy)
      ..lineTo(
        tip.dx + math.cos(tang + 2.5) * 7,
        tip.dy + math.sin(tang + 2.5) * 7,
      )
      ..lineTo(
        tip.dx + math.cos(tang - 2.5) * 7,
        tip.dy + math.sin(tang - 2.5) * 7,
      )
      ..close();
    canvas.drawPath(head, Paint()..color = color.withValues(alpha: 0.95 * dim));
  }

  void _paintHeart(Canvas canvas, Offset c, double r) {
    final double beat = reduceMotion
        ? 1
        : 1 +
            0.05 *
                math.sin(breathe * math.pi * 2) *
                (1 + lockedCount * 0.2);
    final double fill = (lockedCount / 3.0).clamp(0.0, 1.0);
    final double glow =
        (0.3 + fill * 0.55 + success * 0.45) * (1 - timeout);
    final Path heart = _heartPath(c, r * beat);

    canvas.drawCircle(
      c,
      r * 1.55,
      Paint()
        ..color = _kCyan.withValues(alpha: 0.12 * glow)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 16),
    );
    canvas.drawPath(
      heart,
      Paint()
        ..color = _kCyan.withValues(alpha: glow * 0.5)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
    );
    canvas.drawPath(
      heart,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..color = _kCyanBright.withValues(
          alpha: (0.55 + fill * 0.45) * (1 - timeout * 0.7),
        ),
    );
    if (fill > 0) {
      canvas.drawPath(
        heart,
        Paint()..color = _kCyan.withValues(alpha: 0.12 + fill * 0.55),
      );
    }
    if (success > 0.15) {
      canvas.drawPath(
        heart,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.3 * success)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
      );
    }
  }

  Path _heartPath(Offset c, double r) {
    final Path p = Path();
    p.moveTo(c.dx, c.dy + r * 0.72);
    p.cubicTo(
      c.dx - r * 1.25,
      c.dy + r * 0.12,
      c.dx - r * 1.15,
      c.dy - r * 0.85,
      c.dx,
      c.dy - r * 0.32,
    );
    p.cubicTo(
      c.dx + r * 1.15,
      c.dy - r * 0.85,
      c.dx + r * 1.25,
      c.dy + r * 0.12,
      c.dx,
      c.dy + r * 0.72,
    );
    p.close();
    return p;
  }

  void _paintRisingParticles(Canvas canvas, Offset c, double radius) {
    for (int i = 0; i < 14; i += 1) {
      final double seed = i * 1.7;
      final double rise = ((tickMs / 35) + seed * 20) % 140 / 140;
      final double ang = seed + rise * 0.55;
      final double rad = radius * (0.5 + rise * 0.5);
      final Offset p = Offset(
        c.dx + math.cos(ang) * rad * 0.35,
        c.dy + math.sin(ang) * rad - rise * 28,
      );
      canvas.drawCircle(
        p,
        1.2 + (i % 3) * 0.5,
        Paint()..color = _kCyanBright.withValues(alpha: 0.4 * (1 - rise)),
      );
    }
  }

  void _paintLockBurst(Canvas canvas, Offset c, double radius) {
    final double t = lockBurst;
    canvas.drawCircle(
      c,
      radius * (0.85 + t * 0.45),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4 * (1 - t)
        ..color = _kCyan.withValues(alpha: 0.6 * (1 - t)),
    );
    canvas.drawCircle(
      c,
      radius * (0.65 + t * 0.55),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2 * (1 - t)
        ..color = Colors.white.withValues(alpha: 0.4 * (1 - t)),
    );
  }

  void _paintSuccess(Canvas canvas, Offset c, double radius) {
    final double t = success;
    for (int i = 0; i < 10; i += 1) {
      final double a = (i / 10) * math.pi * 2 - math.pi / 2;
      final double len = radius * (0.25 + 0.55 * t);
      canvas.drawLine(
        Offset(c.dx + math.cos(a) * 14, c.dy + math.sin(a) * 14),
        Offset(c.dx + math.cos(a) * len, c.dy + math.sin(a) * len),
        Paint()
          ..color = _kCyanBright.withValues(alpha: 0.5 * (1 - t * 0.25))
          ..strokeWidth = 2.2
          ..strokeCap = StrokeCap.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
      );
    }
    if (!reduceMotion) {
      canvas.drawCircle(
        c,
        radius * t,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 5 * (1 - t)
          ..color = _kCyan.withValues(alpha: 0.55 * (1 - t)),
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
  return '$mm:$ss';
}
