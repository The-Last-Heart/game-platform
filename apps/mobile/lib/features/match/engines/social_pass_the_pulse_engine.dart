import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_sfx.dart';
import 'challenge_engine.dart';

/// Sequential clockwise pulse: tap when the pulse reaches your node.
class SocialPassThePulseEngine implements ChallengeEngine {
  @override
  String get engineId => 'social.pass_the_pulse';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _PassThePulseWidget(challengeContext: challengeContext);
  }
}

class _Participant {
  const _Participant({
    required this.playerId,
    required this.displayName,
  });

  final String playerId;
  final String displayName;
}

class _Leg {
  const _Leg({
    required this.legId,
    required this.playerId,
    required this.routeIndex,
    required this.travelStartAtMs,
    required this.expectedArrivalAtMs,
    required this.windowOpensAtMs,
    required this.windowClosesAtMs,
  });

  final String legId;
  final String playerId;
  final int routeIndex;
  final int travelStartAtMs;
  final int expectedArrivalAtMs;
  final int windowOpensAtMs;
  final int windowClosesAtMs;
}

enum _NodeVisual { waiting, upcoming, active, hit, missed }

class _PassThePulseWidget extends StatefulWidget {
  const _PassThePulseWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_PassThePulseWidget> createState() => _PassThePulseWidgetState();
}

class _PassThePulseWidgetState extends State<_PassThePulseWidget>
    with TickerProviderStateMixin {
  late final AnimationController _ticker;
  late final AnimationController _entrance;
  late final AnimationController _breathe;
  late final AnimationController _hitBurst;
  late final AnimationController _missShake;
  late final AnimationController _buttonPress;
  late final AnimationController _finalWave;

  int _appliedSequence = -1;
  List<_Participant> _participants = <_Participant>[];
  List<_Leg> _legs = <_Leg>[];
  Map<String, String> _results = <String, String>{};
  String? _currentLegId;
  String? _currentTargetId;
  int _pulseStartAtMs = 0;
  int _startDelayMs = 800;
  bool _challengeCompleted = false;
  bool _skipEntrance = false;
  bool _motionReduced = false;
  bool _depsReady = false;
  bool _optimisticPress = false;
  bool _submittedForLeg = false;
  Timer? _pendingAckTimer;
  String? _effectPlayerId;
  String? _effectKind;
  double _displayAngle = 0;
  bool _hasDisplayAngle = false;
  /// Last leg index for which arrival heartbeat SFX was handled.
  int _arrivalSfxCursor = -1;
  /// After first tick sync, skip already-passed arrivals (reconnect mid-round).
  bool _arrivalSfxPrimed = false;

  ChallengeContext get _ctx => widget.challengeContext;
  Map<String, dynamic> get _cfg => _ctx.challenge.clientConfig;

  String? get _localId => _ctx.localPlayerId;

  bool get _isParticipant {
    final Object? flag = _cfg['isParticipant'];
    if (flag is bool) return flag;
    // Room-wide live snapshots may omit the seat flag — derive from the
    // frozen participant list / route instead of leaving the button dead.
    final String? local = _localId;
    if (local == null) return false;
    if (_participants.any((_Participant p) => p.playerId == local)) {
      return true;
    }
    final Object? route = _cfg['routePlayerIds'];
    if (route is List) {
      return route.whereType<String>().contains(local);
    }
    return false;
  }

  bool get _localIsTarget {
    final String? local = _localId;
    if (local == null || !_isParticipant) return false;
    if (_currentTargetId != local) return false;
    return (_results[local] ?? 'waiting') == 'waiting';
  }

  bool get _canTap {
    return _ctx.inputEnabled &&
        _localIsTarget &&
        !_submittedForLeg &&
        !_challengeCompleted;
  }

  @override
  void initState() {
    super.initState();
    _ticker = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..addListener(_onTick);
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _breathe = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _hitBurst = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _missShake = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 360),
    );
    _buttonPress = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 140),
    );
    _finalWave = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );

    _ingest(force: true);
    _skipEntrance = _shouldSkipEntrance();
    if (_skipEntrance || _motionReduced) {
      _entrance.value = 1;
    } else {
      unawaited(_entrance.forward());
    }
    unawaited(_breathe.repeat(reverse: true));
    unawaited(_ticker.repeat());
  }

  bool _shouldSkipEntrance() {
    final int now = _ctx.estimateServerNowMs();
    if (now <= 0 || _pulseStartAtMs <= 0) return false;
    // Reconnect mid-round: skip entrance once pulse travel has begun.
    return now >= _pulseStartAtMs + _startDelayMs;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _motionReduced = MediaQuery.disableAnimationsOf(context);
    if (_motionReduced) {
      _breathe.stop();
      _entrance.value = 1;
    }
    if (!_depsReady) {
      _depsReady = true;
    }
  }

  @override
  void didUpdateWidget(covariant _PassThePulseWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    _ingest();
  }

  @override
  void dispose() {
    _pendingAckTimer?.cancel();
    _ticker.dispose();
    _entrance.dispose();
    _breathe.dispose();
    _hitBurst.dispose();
    _missShake.dispose();
    _buttonPress.dispose();
    _finalWave.dispose();
    super.dispose();
  }

  void _onTick() {
    if (!mounted) return;
    _maybePlayArrivalSfx();
    setState(() {});
  }

  String get _pulseSfxAssetId {
    final Object? raw = _cfg['pulseSfxAssetId'];
    if (raw is String && raw.isNotEmpty) return raw;
    return ChallengeSfx.defaultPulseAssetId;
  }

  /// Play shared [sfx.pulse] once when the pulse reaches each node.
  void _maybePlayArrivalSfx() {
    if (_legs.isEmpty || _challengeCompleted) return;
    final int now = _ctx.estimateServerNowMs();
    if (now <= 0) return;

    if (!_arrivalSfxPrimed) {
      _arrivalSfxPrimed = true;
      for (int i = 0; i < _legs.length; i++) {
        if (now >= _legs[i].expectedArrivalAtMs) {
          _arrivalSfxCursor = i;
        } else {
          break;
        }
      }
      return;
    }

    for (int i = _arrivalSfxCursor + 1; i < _legs.length; i++) {
      if (now < _legs[i].expectedArrivalAtMs) break;
      _arrivalSfxCursor = i;
      unawaited(ChallengeSfx.instance.pulse(assetId: _pulseSfxAssetId));
    }
  }

  void _ingest({bool force = false}) {
    final Map<String, dynamic> cfg = _cfg;
    final int sequence = (cfg['stateSequence'] as num?)?.toInt() ?? 0;
    if (!force && sequence < _appliedSequence) {
      return;
    }
    final bool advanced = force || sequence > _appliedSequence;
    final Map<String, String> prevResults = Map<String, String>.of(_results);
    final List<_Leg> prevLegs = _legs;

    _participants = _parseParticipants(cfg['participants']);
    _legs = _parseLegs(cfg['legs']);
    _results = _parseResults(cfg['results']);
    _currentLegId = cfg['currentLegId'] as String?;
    _currentTargetId = cfg['currentTargetPlayerId'] as String?;
    _pulseStartAtMs = (cfg['pulseStartAtMs'] as num?)?.toInt() ?? 0;
    _startDelayMs = (cfg['startDelayMs'] as num?)?.toInt() ?? 800;
    _challengeCompleted = cfg['challengeStatus'] == 'completed';

    final bool legsReset = force ||
        prevLegs.length != _legs.length ||
        (prevLegs.isNotEmpty &&
            _legs.isNotEmpty &&
            prevLegs.first.legId != _legs.first.legId);
    if (legsReset) {
      _arrivalSfxCursor = -1;
      _arrivalSfxPrimed = false;
    }

    if (advanced) {
      _appliedSequence = sequence;
      if (_submittedForLeg &&
          _localId != null &&
          (_results[_localId!] == 'hit' || _results[_localId!] == 'missed')) {
        _pendingAckTimer?.cancel();
        _submittedForLeg = false;
        _optimisticPress = false;
      }
      for (final MapEntry<String, String> e in _results.entries) {
        final String? prev = prevResults[e.key];
        if (prev == e.value) continue;
        if (e.value == 'hit') {
          _effectPlayerId = e.key;
          _effectKind = 'hit';
          unawaited(_hitBurst.forward(from: 0));
          if (!_motionReduced) {
            unawaited(HapticFeedback.lightImpact());
          }
        } else if (e.value == 'missed') {
          _effectPlayerId = e.key;
          _effectKind = 'miss';
          unawaited(_missShake.forward(from: 0));
        }
      }
      if (_challengeCompleted && !_finalWave.isAnimating) {
        unawaited(_finalWave.forward(from: 0));
        _ticker.stop();
      }
    }
  }

  List<_Participant> _parseParticipants(Object? raw) {
    if (raw is! List) return <_Participant>[];
    final List<_Participant> out = <_Participant>[];
    for (final Object? item in raw) {
      if (item is! Map) continue;
      final String? id = item['playerId'] as String?;
      final String? name = (item['displayName'] as String?)?.trim();
      if (id == null || id.isEmpty || name == null || name.isEmpty) continue;
      out.add(_Participant(playerId: id, displayName: name));
    }
    return out;
  }

  List<_Leg> _parseLegs(Object? raw) {
    if (raw is! List) return <_Leg>[];
    final List<_Leg> out = <_Leg>[];
    for (final Object? item in raw) {
      if (item is! Map) continue;
      final String? legId = item['legId'] as String?;
      final String? playerId = item['playerId'] as String?;
      if (legId == null || playerId == null) continue;
      out.add(
        _Leg(
          legId: legId,
          playerId: playerId,
          routeIndex: (item['routeIndex'] as num?)?.toInt() ?? out.length,
          travelStartAtMs: (item['travelStartAtMs'] as num?)?.toInt() ?? 0,
          expectedArrivalAtMs:
              (item['expectedArrivalAtMs'] as num?)?.toInt() ?? 0,
          windowOpensAtMs: (item['windowOpensAtMs'] as num?)?.toInt() ?? 0,
          windowClosesAtMs: (item['windowClosesAtMs'] as num?)?.toInt() ?? 0,
        ),
      );
    }
    return out;
  }

  Map<String, String> _parseResults(Object? raw) {
    if (raw is! Map) return <String, String>{};
    final Map<String, String> out = <String, String>{};
    raw.forEach((Object? key, Object? value) {
      if (key is String && value is String) {
        out[key] = value;
      }
    });
    return out;
  }

  double _angleForIndex(int routeIndex, int localRouteIndex, int n) {
    final int delta = (routeIndex - localRouteIndex) % n;
    return math.pi / 2 + (2 * math.pi * delta / n);
  }

  int _localRouteIndex() {
    final String? local = _localId;
    if (local == null) return 0;
    for (int i = 0; i < _participants.length; i += 1) {
      if (_participants[i].playerId == local) return i;
    }
    return 0;
  }

  /// Authoritative pulse angle from server timestamps (radians, y-down).
  double _computePulseAngle(int nowMs) {
    final int n = _participants.length;
    if (n < 2 || _legs.isEmpty) return math.pi / 2;
    final int localIdx = _localRouteIndex();
    if (nowMs < _pulseStartAtMs + _startDelayMs) {
      final double first = _angleForIndex(0, localIdx, n);
      return first - (2 * math.pi / n);
    }
    for (int i = 0; i < _legs.length; i += 1) {
      final _Leg leg = _legs[i];
      if (nowMs < leg.travelStartAtMs) {
        final double end = _angleForIndex(i, localIdx, n);
        return end - (2 * math.pi / n);
      }
      if (nowMs <= leg.expectedArrivalAtMs) {
        final double start = _angleForIndex(i, localIdx, n) - (2 * math.pi / n);
        final double end = _angleForIndex(i, localIdx, n);
        final double t = ((nowMs - leg.travelStartAtMs) /
                math.max(1, leg.expectedArrivalAtMs - leg.travelStartAtMs))
            .clamp(0.0, 1.0);
        // Clockwise: increasing angle.
        var delta = end - start;
        if (delta < 0) delta += 2 * math.pi;
        return start + delta * t;
      }
    }
    final double last = _angleForIndex(n - 1, localIdx, n);
    return last;
  }

  double _smoothedAngle(int nowMs) {
    final double target = _computePulseAngle(nowMs);
    if (!_hasDisplayAngle || _motionReduced) {
      _displayAngle = target;
      _hasDisplayAngle = true;
      return target;
    }
    // Small corrections lerp; large gaps snap.
    var diff = target - _displayAngle;
    while (diff > math.pi) {
      diff -= 2 * math.pi;
    }
    while (diff < -math.pi) {
      diff += 2 * math.pi;
    }
    if (diff.abs() > 0.45) {
      _displayAngle = target;
    } else {
      _displayAngle += diff * 0.28;
    }
    return _displayAngle;
  }

  _NodeVisual _visualFor(String playerId, int nowMs) {
    final String result = _results[playerId] ?? 'waiting';
    if (result == 'hit') return _NodeVisual.hit;
    if (result == 'missed') return _NodeVisual.missed;
    if (_currentTargetId == playerId) {
      _Leg? leg;
      for (final _Leg candidate in _legs) {
        if (candidate.playerId == playerId) {
          leg = candidate;
          break;
        }
      }
      if (leg != null &&
          nowMs >= leg.windowOpensAtMs &&
          nowMs <= leg.windowClosesAtMs) {
        return _NodeVisual.active;
      }
      return _NodeVisual.upcoming;
    }
    return _NodeVisual.waiting;
  }

  void _onTap() {
    if (!_canTap) return;
    final String? legId = _currentLegId;
    if (legId == null) return;
    setState(() {
      _optimisticPress = true;
      _submittedForLeg = true;
    });
    _pendingAckTimer?.cancel();
    _pendingAckTimer = Timer(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      final String? local = _localId;
      if (local == null) return;
      final String result = _results[local] ?? 'waiting';
      if (result == 'waiting' && _submittedForLeg) {
        setState(() {
          _submittedForLeg = false;
          _optimisticPress = false;
        });
      }
    });
    unawaited(_buttonPress.forward(from: 0));
    if (!_motionReduced) {
      unawaited(HapticFeedback.selectionClick());
    }
    // Progress submit — keeps session input unlocked (same as complete_sum).
    _ctx.onSubmit(<String, dynamic>{
      'legId': legId,
      'final': false,
    });
  }

  String? _requiredKey(String field) {
    final Object? value = _cfg[field];
    if (value is! String) return null;
    final String trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  String _formatMmSs(int remainingMs, String localeCode) {
    final int totalSec = (remainingMs / 1000).ceil().clamp(0, 99 * 60);
    final int mm = totalSec ~/ 60;
    final int ss = totalSec % 60;
    final String raw =
        '${mm.toString().padLeft(2, '0')}:${ss.toString().padLeft(2, '0')}';
    if (!localeCode.toLowerCase().startsWith('ar')) {
      return raw;
    }
    const List<String> digits = <String>[
      '٠',
      '١',
      '٢',
      '٣',
      '٤',
      '٥',
      '٦',
      '٧',
      '٨',
      '٩',
    ];
    return raw.split('').map((String c) {
      final int? d = int.tryParse(c);
      return d != null ? digits[d] : c;
    }).join();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String? titleKey = _requiredKey('titleKey');
    final String? promptKey = _requiredKey('promptKey');
    final String? actionKey = _requiredKey('actionKey');
    final String? youKey = _requiredKey('youKey');
    final String? timeKey = _requiredKey('timeRemainingKey');
    final String? tapReadyKey = _requiredKey('a11yTapReadyKey');
    final String? tapWaitKey = _requiredKey('a11yTapWaitKey');

    if (titleKey == null ||
        promptKey == null ||
        actionKey == null ||
        youKey == null ||
        timeKey == null ||
        _participants.length < 2) {
      return const SizedBox.shrink();
    }

    final int nowMs = _ctx.estimateServerNowMs();
    final int remainingMs =
        (_ctx.challenge.deadlineAtMs - nowMs).clamp(0, 99 * 60 * 1000);
    final double timeProgress = (_ctx.challenge.durationMs <= 0)
        ? 0
        : (remainingMs / _ctx.challenge.durationMs).clamp(0.0, 1.0);
    final String localeCode = resolver.resolveLocaleMetadata().localeCode;
    final double pulseAngle = _smoothedAngle(nowMs);
    final int localIdx = _localRouteIndex();
    final int n = _participants.length;
    final String youLabel = resolver.resolve(youKey);
    final bool allHit = _participants.every(
      ( _Participant p) => _results[p.playerId] == 'hit',
    );

    final double entrance = _entrance.value;
    final double titleOpacity = entrance;
    final double titleSlide = (1 - entrance) * 16;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        children: <Widget>[
          Transform.translate(
            offset: Offset(0, titleSlide),
            child: Opacity(
              opacity: titleOpacity,
              child: Column(
                children: <Widget>[
                  Text(
                    resolver.resolve(titleKey),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                          color: LhColors.success,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 6),
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
          ),
          const SizedBox(height: 12),
          _TimeBar(
            label: resolver.resolve(timeKey),
            timeLabel: _formatMmSs(remainingMs, localeCode),
            progress: timeProgress,
          ),
          const SizedBox(height: 8),
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
                          _ticker,
                          _breathe,
                          _hitBurst,
                          _missShake,
                          _finalWave,
                          _entrance,
                        ]),
                        builder: (BuildContext context, Widget? child) {
                          return CustomPaint(
                            painter: _OrbitPainter(
                              participants: _participants,
                              localRouteIndex: localIdx,
                              pulseAngle: pulseAngle,
                              breathe: _breathe.value,
                              entrance: entrance,
                              reduceMotion: _motionReduced,
                              results: _results,
                              currentTargetId: _currentTargetId,
                              nowMs: nowMs,
                              legs: _legs,
                              effectPlayerId: _effectPlayerId,
                              effectKind: _effectKind,
                              hitBurst: _hitBurst.value,
                              missShake: _missShake.value,
                              finalWave: _finalWave.value,
                              allHitFinale: _challengeCompleted && allHit,
                              visualFor: (String id) => _visualFor(id, nowMs),
                              angleFor: (int i) =>
                                  _angleForIndex(i, localIdx, n),
                            ),
                            child: Stack(
                              children: <Widget>[
                                for (int i = 0; i < n; i += 1)
                                  _buildNodeLabel(
                                    context: context,
                                    index: i,
                                    side: side,
                                    localIdx: localIdx,
                                    youLabel: youLabel,
                                    nowMs: nowMs,
                                  ),
                              ],
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
          const SizedBox(height: 8),
          Opacity(
            opacity: entrance.clamp(0.0, 1.0),
            child: Transform.translate(
              offset: Offset(0, (1 - entrance) * 20),
              child: _TapButton(
                label: resolver.resolve(actionKey),
                enabled: _canTap,
                bright: _localIsTarget,
                press: _buttonPress.value,
                optimistic: _optimisticPress,
                semanticLabel: _localIsTarget
                    ? resolver.resolve(
                        tapReadyKey ?? actionKey,
                      )
                    : resolver.resolve(tapWaitKey ?? actionKey),
                onTap: _onTap,
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _buildNodeLabel({
    required BuildContext context,
    required int index,
    required double side,
    required int localIdx,
    required String youLabel,
    required int nowMs,
  }) {
    final _Participant p = _participants[index];
    final double angle = _angleForIndex(index, localIdx, _participants.length);
    final double radius = side * 0.38;
    final double cx = side / 2 + radius * math.cos(angle);
    final double cy = side / 2 + radius * math.sin(angle);
    final bool isLocal = p.playerId == _localId;
    final _NodeVisual visual = _visualFor(p.playerId, nowMs);
    final double nodeSize = visual == _NodeVisual.active ? 78.0 : 68.0;

    return Positioned(
      left: cx - nodeSize / 2,
      top: cy - nodeSize / 2,
      width: nodeSize,
      height: nodeSize + (isLocal ? 14 : 0),
      child: Semantics(
        label: p.displayName,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Flexible(
              child: Text(
                p.displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: LhColors.text,
                  fontSize: p.displayName.length > 10 ? 11 : 13,
                  fontWeight: FontWeight.w600,
                  fontFamily: lhFontFamily,
                ),
              ),
            ),
            if (isLocal)
              Text(
                youLabel,
                maxLines: 1,
                style: const TextStyle(
                  color: LhColors.success,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  fontFamily: lhFontFamily,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TimeBar extends StatelessWidget {
  const _TimeBar({
    required this.label,
    required this.timeLabel,
    required this.progress,
  });

  final String label;
  final String timeLabel;
  final double progress;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: LhRadii.pillAll,
        border: Border.all(color: LhColors.success.withValues(alpha: 0.55)),
      ),
      child: Column(
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: LhColors.textMuted,
                    fontSize: 12,
                    fontFamily: lhFontFamily,
                  ),
                ),
              ),
              Text(
                timeLabel,
                style: const TextStyle(
                  color: LhColors.text,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
                  fontFamily: lhFontFamily,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: LhRadii.pillAll,
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: LhColors.border,
              color: LhColors.success,
            ),
          ),
        ],
      ),
    );
  }
}

class _TapButton extends StatelessWidget {
  const _TapButton({
    required this.label,
    required this.enabled,
    required this.bright,
    required this.press,
    required this.optimistic,
    required this.semanticLabel,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final bool bright;
  final double press;
  final bool optimistic;
  final String semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final double scale = 1 - press * 0.08 - (optimistic ? 0.04 : 0);
    final Color ring = bright
        ? LhColors.success
        : LhColors.success.withValues(alpha: 0.35);
    return Semantics(
      button: true,
      enabled: enabled,
      label: semanticLabel,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        child: Transform.scale(
          scale: scale,
          child: Container(
            width: 108,
            height: 108,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: LhColors.elevated,
              border: Border.all(color: ring, width: bright ? 4 : 2),
              boxShadow: bright
                  ? <BoxShadow>[
                      BoxShadow(
                        color: LhColors.success.withValues(alpha: 0.45),
                        blurRadius: 18,
                        spreadRadius: 2,
                      ),
                    ]
                  : null,
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: TextStyle(
                color: enabled ? LhColors.text : LhColors.textMuted,
                fontSize: 22,
                fontWeight: FontWeight.w700,
                fontFamily: lhFontFamily,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _OrbitPainter extends CustomPainter {
  _OrbitPainter({
    required this.participants,
    required this.localRouteIndex,
    required this.pulseAngle,
    required this.breathe,
    required this.entrance,
    required this.reduceMotion,
    required this.results,
    required this.currentTargetId,
    required this.nowMs,
    required this.legs,
    required this.effectPlayerId,
    required this.effectKind,
    required this.hitBurst,
    required this.missShake,
    required this.finalWave,
    required this.allHitFinale,
    required this.visualFor,
    required this.angleFor,
  });

  final List<_Participant> participants;
  final int localRouteIndex;
  final double pulseAngle;
  final double breathe;
  final double entrance;
  final bool reduceMotion;
  final Map<String, String> results;
  final String? currentTargetId;
  final int nowMs;
  final List<_Leg> legs;
  final String? effectPlayerId;
  final String? effectKind;
  final double hitBurst;
  final double missShake;
  final double finalWave;
  final bool allHitFinale;
  final _NodeVisual Function(String playerId) visualFor;
  final double Function(int routeIndex) angleFor;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset center = Offset(size.width / 2, size.height / 2);
    final double radius = size.shortestSide * 0.38;
    final double orbitAlpha = entrance.clamp(0.0, 1.0);

    // Soft grid dots.
    final Paint grid = Paint()
      ..color = LhColors.border.withValues(alpha: 0.35 * orbitAlpha)
      ..strokeWidth = 1;
    for (double r = radius * 0.35; r < radius; r += radius * 0.22) {
      canvas.drawCircle(center, r, grid..style = PaintingStyle.stroke);
    }

    final Paint orbit = Paint()
      ..color = LhColors.success.withValues(alpha: 0.75 * orbitAlpha)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2;
    final double sweep = 2 * math.pi * orbitAlpha;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      sweep,
      false,
      orbit,
    );

    if (allHitFinale && finalWave > 0) {
      final Paint wave = Paint()
        ..color = LhColors.success.withValues(alpha: 0.35 * (1 - finalWave))
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6;
      canvas.drawCircle(center, radius * (0.7 + finalWave * 0.5), wave);
    }

    // Central heart.
    final double heartScale =
        (0.85 + 0.15 * entrance) * (1 + breathe * 0.04 + finalWave * 0.06);
    final TextPainter heart = TextPainter(
      text: TextSpan(
        text: String.fromCharCode(Icons.favorite.codePoint),
        style: TextStyle(
          fontSize: size.shortestSide * 0.14 * heartScale,
          fontFamily: Icons.favorite.fontFamily,
          package: Icons.favorite.fontPackage,
          color: LhColors.success,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    heart.paint(
      canvas,
      center - Offset(heart.width / 2, heart.height / 2),
    );

    for (int i = 0; i < participants.length; i += 1) {
      final _Participant p = participants[i];
      final double angle = angleFor(i);
      Offset nodeCenter = Offset(
        center.dx + radius * math.cos(angle),
        center.dy + radius * math.sin(angle),
      );
      if (effectPlayerId == p.playerId &&
          effectKind == 'miss' &&
          !reduceMotion) {
        nodeCenter += Offset(math.sin(missShake * math.pi * 6) * 4, 0);
      }
      final _NodeVisual visual = visualFor(p.playerId);
      final bool isLocal = i == localRouteIndex;
      _paintNode(
        canvas,
        nodeCenter,
        visual: visual,
        isLocal: isLocal,
        stagger: ((i + 1) / participants.length) * entrance,
      );
      if (effectPlayerId == p.playerId &&
          effectKind == 'hit' &&
          hitBurst > 0 &&
          !reduceMotion) {
        final Paint ring = Paint()
          ..color = LhColors.success.withValues(alpha: 0.55 * (1 - hitBurst))
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3;
        canvas.drawCircle(nodeCenter, 28 + hitBurst * 26, ring);
        canvas.drawCircle(nodeCenter, 34 + hitBurst * 34, ring);
        final Paint streak = Paint()
          ..color = LhColors.success.withValues(alpha: 0.7 * (1 - hitBurst))
          ..strokeWidth = 2;
        final Offset mid = Offset.lerp(nodeCenter, center, hitBurst)!;
        canvas.drawLine(nodeCenter, mid, streak);
      }
    }

    // Pulse + trail.
    if (entrance > 0.2) {
      final Offset pulse = Offset(
        center.dx + radius * math.cos(pulseAngle),
        center.dy + radius * math.sin(pulseAngle),
      );
      if (!reduceMotion) {
        for (int t = 1; t <= 6; t += 1) {
          final double back = pulseAngle - t * 0.07;
          final Offset trail = Offset(
            center.dx + radius * math.cos(back),
            center.dy + radius * math.sin(back),
          );
          canvas.drawCircle(
            trail,
            5.0 - t * 0.55,
            Paint()
              ..color = LhColors.success.withValues(alpha: 0.35 / t),
          );
        }
      }
      canvas.drawCircle(
        pulse,
        9,
        Paint()
          ..color = Colors.white
          ..maskFilter = reduceMotion
              ? null
              : const MaskFilter.blur(BlurStyle.normal, 6),
      );
      canvas.drawCircle(pulse, 6, Paint()..color = Colors.white);
    }
  }

  void _paintNode(
    Canvas canvas,
    Offset c, {
    required _NodeVisual visual,
    required bool isLocal,
    required double stagger,
  }) {
    final double alpha = stagger.clamp(0.0, 1.0);
    Color ring = LhColors.success.withValues(alpha: 0.45 * alpha);
    double width = 2;
    double radius = 30;
    if (visual == _NodeVisual.upcoming) {
      ring = LhColors.success.withValues(alpha: (0.45 + breathe * 0.35) * alpha);
      width = 2.5;
    } else if (visual == _NodeVisual.active) {
      ring = Colors.white.withValues(alpha: 0.9 * alpha);
      width = 3.5;
      radius = 34;
      if (!reduceMotion) {
        canvas.drawCircle(
          c,
          radius + 8 + breathe * 6,
          Paint()
            ..color = LhColors.success.withValues(alpha: 0.2)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      }
    } else if (visual == _NodeVisual.hit) {
      ring = const Color(0xFF3DFF9A).withValues(alpha: 0.9 * alpha);
      width = 3;
    } else if (visual == _NodeVisual.missed) {
      ring = LhColors.warning.withValues(alpha: 0.55 * alpha);
      width = 2;
    }
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..color = LhColors.surface.withValues(alpha: 0.85 * alpha)
        ..style = PaintingStyle.fill,
    );
    canvas.drawCircle(
      c,
      radius,
      Paint()
        ..color = ring
        ..style = PaintingStyle.stroke
        ..strokeWidth = width,
    );
    if (isLocal) {
      canvas.drawCircle(
        c,
        radius + 5,
        Paint()
          ..color = LhColors.success.withValues(alpha: 0.55 * alpha)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    }
    Color dot = LhColors.textMuted;
    if (visual == _NodeVisual.hit) {
      dot = const Color(0xFF3DFF9A);
    } else if (visual == _NodeVisual.active) {
      dot = LhColors.success;
    } else if (visual == _NodeVisual.missed) {
      dot = LhColors.warning;
    }
    canvas.drawCircle(c + const Offset(0, 18), 3.2, Paint()..color = dot);
  }

  @override
  bool shouldRepaint(covariant _OrbitPainter oldDelegate) => true;
}
