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
import 'laser_routing_audio.dart';
import 'laser_routing_models.dart';
import 'laser_routing_painter.dart';
import '../state/match_snapshot.dart';

class LaserRoutingEngine implements ChallengeEngine {
  @override
  String get engineId => 'laser.routing';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _LaserRoutingWidget(challengeContext: challengeContext);
  }
}

class _LaserRoutingWidget extends StatefulWidget {
  const _LaserRoutingWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_LaserRoutingWidget> createState() => _LaserRoutingWidgetState();
}

class _LaserRoutingWidgetState extends State<_LaserRoutingWidget>
    with TickerProviderStateMixin {
  static final Set<String> _seenChallenges = <String>{};

  late final AnimationController _entrance;
  late final AnimationController _success;
  late final AnimationController _timeout;
  late final AnimationController _pathReveal;
  late final Ticker _ticker;
  late final ValueNotifier<double> _time;
  final LaserRoutingAudioMachine _audio = LaserRoutingAudioMachine();
  final Map<String, AnimationController> _turns = <String, AnimationController>{};

  String? _pendingId;
  String? _selectedId;
  int _lastSequence = -1;
  bool _disposed = false;
  Timer? _pendingTimer;
  int _lastAudioAttemptMs = -1000;

  ChallengeContext get _ctx => widget.challengeContext;
  Map<String, dynamic> get _cfg => _ctx.challenge.clientConfig;

  @override
  void initState() {
    super.initState();
    final bool reconnect = _seenChallenges.contains(_ctx.challenge.challengeInstanceId);
    _seenChallenges.add(_ctx.challenge.challengeInstanceId);
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _success = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _timeout = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _pathReveal = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _time = ValueNotifier<double>(0);
    _ticker = createTicker((Duration elapsed) {
      final double seconds = elapsed.inMilliseconds / 1000;
      _time.value = seconds;
      _maybeStartLoop(elapsed.inMilliseconds);
    })..start();
    if (reconnect) {
      _entrance.value = 1;
      _pathReveal.value = 1;
    } else {
      _entrance.forward();
      _pathReveal.forward();
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncFromConfig(reconnect: reconnect));
  }

  @override
  void didUpdateWidget(covariant _LaserRoutingWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    final AnswerSubmissionStatus previous = oldWidget.challengeContext.answerStatus;
    if (previous == AnswerSubmissionStatus.pending &&
        _ctx.answerStatus == AnswerSubmissionStatus.rejected) {
      _pendingId = null;
      _pendingTimer?.cancel();
      final LaserRoutingSnapshot? snap = _snapshot;
      if (snap != null) {
        for (final LaserComponentView component in snap.components) {
          if (!component.interactive) continue;
          final AnimationController? controller = _turns[component.id];
          if (controller == null) continue;
          controller.animateTo(
            _orientationValue(component),
            curve: Curves.easeOutCubic,
          );
        }
      }
    }
    _syncFromConfig(reconnect: false);
  }

  LaserRoutingSnapshot? get _snapshot => parseLaserRoutingSnapshot(_cfg);

  void _syncFromConfig({required bool reconnect}) {
    final LaserRoutingSnapshot? snap = _snapshot;
    if (snap == null) return;
    if (!reconnect &&
        snap.stateSequence < _lastSequence &&
        !snap.isSuccess &&
        !snap.isTimeout) {
      return;
    }
    for (final LaserComponentView component in snap.components) {
      if (!component.interactive) continue;
      final double target = _orientationValue(component);
      final AnimationController controller = _turns.putIfAbsent(
        component.id,
        () => AnimationController(
          vsync: this,
          duration: const Duration(milliseconds: 280),
          value: target,
        ),
      );
      if ((controller.value - target).abs() > 0.01 && _pendingId != component.id) {
        controller.animateTo(target, curve: Curves.easeOutBack);
      } else if (_pendingId != component.id) {
        controller.value = target;
      }
    }
    if (snap.stateSequence != _lastSequence) {
      _lastSequence = snap.stateSequence;
      if (_pendingId != null) {
        _pendingId = null;
        _pendingTimer?.cancel();
      }
      if (!reconnect) {
        _pathReveal
          ..value = 0.15
          ..forward();
      }
    }
    if (snap.isSuccess && _success.value == 0) {
      _success.forward();
    }
    if (snap.isTimeout && _timeout.value == 0) {
      _timeout.forward();
    }
    unawaited(_pushAudio(snap: snap, reconnect: reconnect));
  }

  void _maybeStartLoop(int elapsedMs) {
    if (_disposed || _audio.looping) return;
    if (elapsedMs - _lastAudioAttemptMs < 80) return;
    final LaserRoutingSnapshot? snap = _snapshot;
    if (snap == null || snap.isSuccess || snap.isTimeout) return;
    final int now = _ctx.estimateServerNowMs();
    if (now < snap.puzzleStartsAtMs + snap.startDelayMs) return;
    _lastAudioAttemptMs = elapsedMs;
    unawaited(_pushAudio(snap: snap, reconnect: false));
  }

  Future<void> _pushAudio({
    required LaserRoutingSnapshot snap,
    required bool reconnect,
  }) {
    final int now = _ctx.estimateServerNowMs();
    final bool playable = !snap.isSuccess &&
        !snap.isTimeout &&
        now >= snap.puzzleStartsAtMs + snap.startDelayMs;
    return _audio.sync(
      challengeId: _ctx.challenge.challengeInstanceId,
      reconnect: reconnect,
      playable: playable,
      success: snap.isSuccess,
      timeout: snap.isTimeout,
      stateSequence: snap.stateSequence,
      reflectionOccurred: snap.reflectionOccurred,
      lastAcceptedCommandId: snap.lastAcceptedCommandId,
      loopAssetId: snap.loopAssetId,
      reflectionAssetId: snap.reflectionAssetId,
      heartAssetId: snap.heartAssetId,
    );
  }

  double _orientationValue(LaserComponentView component) {
    if (component.kind == 'mirror') {
      return component.orientation == 'backslash' ? 1 : 0;
    }
    return component.axis == 'vertical' ? 1 : 0;
  }

  @override
  void dispose() {
    _disposed = true;
    _ticker.dispose();
    _time.dispose();
    _entrance.dispose();
    _success.dispose();
    _timeout.dispose();
    _pathReveal.dispose();
    for (final AnimationController controller in _turns.values) {
      controller.dispose();
    }
    _pendingTimer?.cancel();
    unawaited(_audio.dispose());
    super.dispose();
  }

  void _onTapComponent(LaserComponentView component) {
    final LaserRoutingSnapshot? snap = _snapshot;
    if (snap == null || !component.interactive) return;
    if (!snap.isParticipant || snap.isSuccess || snap.isTimeout) return;
    if (_ctx.isInteractionLocked || _pendingId != null) return;
    final int now = _ctx.estimateServerNowMs();
    if (now < snap.puzzleStartsAtMs + snap.startDelayMs) return;
    setState(() {
      _pendingId = component.id;
      _selectedId = component.id;
      final AnimationController? turn = _turns[component.id];
      if (turn != null) {
        final double next = turn.value < 0.5 ? 1 : 0;
        turn.animateTo(next, curve: Curves.easeOutBack);
      }
    });
    try {
      HapticFeedback.lightImpact();
    } catch (_) {}
    _ctx.onSubmit(<String, dynamic>{
      'componentId': component.id,
      'expectedSequence': snap.stateSequence,
      'final': false,
    });
    _pendingTimer?.cancel();
    _pendingTimer = Timer(const Duration(milliseconds: 900), () {
      if (!mounted || _disposed) return;
      setState(() => _pendingId = null);
    });
  }

  String _progressText(LaserRoutingSnapshot snap, TranslationResolver resolver) {
    if (snap.variant == 'pulse_gates') {
      return resolver.resolve(
        'challenge.laser.progress_gates',
        params: <String, String>{
          'open': '${snap.gatesOpen}',
          'total': '${snap.gatesTotal}',
        },
      );
    }
    if (snap.variant == 'dual_fusion') {
      if (snap.connectedPaths >= 2) {
        return resolver.resolve('challenge.laser.progress_fusion');
      }
      return resolver.resolve(
        'challenge.laser.progress_fusion_partial',
        params: <String, String>{'count': '${snap.connectedPaths}'},
      );
    }
    return resolver.resolve(
      'challenge.laser.progress_mirrors',
      params: <String, String>{
        'correct': '${snap.mirrorsHit}',
        'total': '${snap.mirrorsTotal}',
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final LaserRoutingSnapshot? snap = _snapshot;
    final TranslationResolver resolver = AppLocalization.of(context);
    if (snap == null) {
      return Center(
        child: Text(
          resolver.resolve('challenge.laser.a11y_fallback'),
          style: const TextStyle(color: LhColors.textMuted),
          textAlign: TextAlign.center,
        ),
      );
    }
    final MediaQueryData mq = MediaQuery.of(context);
    final bool reduced = mq.disableAnimations;
    // ChallengePlayView draws hearts/energy/round as a non-interactive overlay
    // on a full-bleed engine. Keep the countdown bar below that chrome.
    const double headerClearance = 52;
    final List<Listenable> paintListenables = <Listenable>[
      _entrance,
      _success,
      _timeout,
      _pathReveal,
      _time,
      ..._turns.values,
    ];

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, headerClearance, 16, 12),
        child: Column(
          children: <Widget>[
            AnimatedBuilder(
              animation: _time,
              builder: (BuildContext context, Widget? child) {
                final int remaining = math.max(
                  0,
                  _ctx.challenge.deadlineAtMs - _ctx.estimateServerNowMs(),
                );
                final double remainingRatio = _ctx.challenge.durationMs <= 0
                    ? 0
                    : (remaining / _ctx.challenge.durationMs).clamp(0.0, 1.0);
                return _TimePanel(
                  ratio: remainingRatio,
                  remainingMs: remaining,
                  label: resolver.resolve('challenge.laser.time_remaining'),
                );
              },
            ),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                resolver.resolve(snap.titleKey),
                style: const TextStyle(
                  fontFamily: lhFontFamily,
                  color: Colors.white,
                  fontSize: 34,
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              resolver.resolve(snap.promptKey),
              style: const TextStyle(
                fontFamily: lhFontFamily,
                color: Color(0xFF9ED4E6),
                fontSize: 15,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 10),
            Expanded(
              child: LayoutBuilder(
                builder: (BuildContext context, BoxConstraints constraints) {
                  final double side = math.min(constraints.maxWidth, constraints.maxHeight);
                  return Center(
                    child: Semantics(
                      label: resolver.resolve('challenge.laser.a11y_board'),
                      child: SizedBox(
                        width: side,
                        height: side,
                        child: RepaintBoundary(
                          child: AnimatedBuilder(
                            animation: Listenable.merge(paintListenables),
                            builder: (BuildContext context, Widget? child) {
                              final Map<String, double> rotations =
                                  <String, double>{
                                for (final MapEntry<String, AnimationController> e
                                    in _turns.entries)
                                  e.key: e.value.value,
                              };
                              return CustomPaint(
                                isComplex: true,
                                willChange: true,
                                painter: LaserRoutingBoardPainter(
                                  snapshot: snap,
                                  time: reduced ? 0 : _time.value,
                                  entrance: reduced ? 1 : _entrance.value,
                                  success: _success.value,
                                  timeout: _timeout.value,
                                  selectedId: _selectedId,
                                  pendingId: _pendingId,
                                  rotations: rotations,
                                  reducedMotion: reduced,
                                  pathReveal: reduced ? 1 : _pathReveal.value,
                                ),
                                child: _HitOverlay(
                                  snapshot: snap,
                                  onTap: _onTapComponent,
                                  enabled: snap.isParticipant &&
                                      !snap.isSuccess &&
                                      !snap.isTimeout &&
                                      !_ctx.isInteractionLocked,
                                  resolver: resolver,
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 10),
            _ProgressCapsule(text: _progressText(snap, resolver)),
          ],
        ),
      ),
    );
  }
}

typedef TranslationResolverLike = TranslationResolver;

class _HitOverlay extends StatelessWidget {
  const _HitOverlay({
    required this.snapshot,
    required this.onTap,
    required this.enabled,
    required this.resolver,
  });

  final LaserRoutingSnapshot snapshot;
  final void Function(LaserComponentView component) onTap;
  final bool enabled;
  final TranslationResolver resolver;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double pad = math.min(constraints.maxWidth, constraints.maxHeight) * 0.06;
        final Rect board = Rect.fromLTWH(
          pad,
          pad,
          constraints.maxWidth - pad * 2,
          constraints.maxHeight - pad * 2,
        );
        final double cw = board.width / snapshot.width;
        final double ch = board.height / snapshot.height;
        return Stack(
          children: <Widget>[
            for (final LaserComponentView component in snapshot.components.where((LaserComponentView c) => c.interactive))
              Positioned(
                left: board.left + component.col * cw,
                top: board.top + component.row * ch,
                width: cw,
                height: ch,
                child: Semantics(
                  button: true,
                  enabled: enabled,
                  label: resolver.resolve(
                    component.kind == 'gate'
                        ? 'challenge.laser.a11y_gate'
                        : 'challenge.laser.a11y_mirror',
                    params: <String, String>{'id': component.id},
                  ),
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: enabled ? () => onTap(component) : null,
                    child: const SizedBox.expand(),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _TimePanel extends StatelessWidget {
  const _TimePanel({
    required this.ratio,
    required this.remainingMs,
    required this.label,
  });

  final double ratio;
  final int remainingMs;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label ${(remainingMs / 1000).ceil()}',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFF071B2B),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0xFF3CE7FF).withValues(alpha: 0.5)),
        ),
        child: Row(
          children: <Widget>[
            Text(
              label,
              style: const TextStyle(color: Color(0xFF9ED4E6), fontSize: 12),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: ratio,
                  minHeight: 8,
                  backgroundColor: const Color(0xFF12344A),
                  color: const Color(0xFF3CE7FF),
                ),
              ),
            ),
            const SizedBox(width: 10),
            const Icon(Icons.hourglass_bottom, color: Color(0xFF3CE7FF), size: 16),
            const SizedBox(width: 4),
            Directionality(
              textDirection: TextDirection.ltr,
              child: Text(
                '${(remainingMs / 1000).ceil()}',
                style: const TextStyle(
                  color: Colors.white,
                  fontFeatures: <ui.FontFeature>[ui.FontFeature.tabularFigures()],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProgressCapsule extends StatelessWidget {
  const _ProgressCapsule({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: text,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFF071B2B),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0xFF3CE7FF).withValues(alpha: 0.45)),
        ),
        child: Text(
          text,
          style: const TextStyle(
            fontFamily: lhFontFamily,
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
