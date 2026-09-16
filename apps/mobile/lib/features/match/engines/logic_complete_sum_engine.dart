import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

/// Collaborative real-time sum: each participant picks a number; totals sync live.
class LogicCompleteSumEngine implements ChallengeEngine {
  @override
  String get engineId => 'logic.complete_sum';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _CompleteSumWidget(challengeContext: challengeContext);
  }
}

class _CompleteSumWidget extends StatefulWidget {
  const _CompleteSumWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_CompleteSumWidget> createState() => _CompleteSumWidgetState();
}

class _CompleteSumWidgetState extends State<_CompleteSumWidget>
    with TickerProviderStateMixin {
  static const Duration _pendingAckTimeout = Duration(milliseconds: 800);
  static const Duration _totalAnimDuration = Duration(milliseconds: 260);

  late final AnimationController _entrance;
  late final AnimationController _breathe;
  late final AnimationController _totalAnim;
  late final AnimationController _incorrectPulse;
  late final AnimationController _successBurst;
  late final AnimationController _centerShake;
  late final AnimationController _rejectShake;
  late final AnimationController _energyTravel;
  late final AnimationController _optionPress;

  int _appliedSequence = -1;
  int _authTotal = 0;
  int _target = 0;
  double _arcFill = 0;
  double _totalFrom = 0;
  double _totalTo = 0;
  double _arcFrom = 0;
  double _arcTo = 0;
  bool _allSelected = false;
  bool _incorrectTotal = false;
  Map<String, int?> _selections = <String, int?>{};
  List<String> _participantIds = <String>[];
  List<int> _myChoices = <int>[];
  bool _isParticipant = false;

  /// Last authoritative selection for the local seat (null = never confirmed).
  int? _confirmedLocal;
  int? _pendingLocal;
  Timer? _pendingTimer;

  String? _pulsePlayerId;
  Offset? _travelFrom;
  bool _successFired = false;
  bool _endedEffect = false;
  int? _pressingChoice;
  bool _motionReduced = false;
  bool _depsReady = false;
  Timer? _pulseClearTimer;

  Map<String, dynamic> get _cfg =>
      widget.challengeContext.challenge.clientConfig;

  ChallengeContext get _ctx => widget.challengeContext;

  bool get _reduceMotion => _motionReduced;

  bool get _canPick {
    return _ctx.inputEnabled &&
        _isParticipant &&
        _myChoices.isNotEmpty &&
        !_successFired &&
        !_endedEffect;
  }

  String? get _localId => _ctx.localPlayerId;

  @override
  void initState() {
    super.initState();
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _breathe = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _totalAnim = AnimationController(
      vsync: this,
      duration: _totalAnimDuration,
    );
    _incorrectPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _successBurst = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 980),
    );
    _centerShake = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 480),
    );
    _rejectShake = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _energyTravel = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
    );
    _optionPress = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 180),
    );

    _ingestConfig(force: true);
    // Keep entrance at 1 — never drive opacity from 0. A paused/late ticker
    // (common on match route push) used to leave the whole surface blank.
    _entrance.value = 1;
    unawaited(_breathe.repeat(reverse: true));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _motionReduced = MediaQuery.disableAnimationsOf(context);
    if (_motionReduced) {
      _breathe.stop();
      _entrance.value = 1;
      _totalAnim.value = 1;
    }
    if (!_depsReady) {
      _depsReady = true;
    }
  }

  @override
  void didUpdateWidget(covariant _CompleteSumWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    _ingestConfig();
    _maybeHandlePhaseEnd(oldWidget.challengeContext.challenge.roundPhase);
  }

  @override
  void dispose() {
    _pendingTimer?.cancel();
    _pulseClearTimer?.cancel();
    _entrance.dispose();
    _breathe.dispose();
    _totalAnim.dispose();
    _incorrectPulse.dispose();
    _successBurst.dispose();
    _centerShake.dispose();
    _rejectShake.dispose();
    _energyTravel.dispose();
    _optionPress.dispose();
    super.dispose();
  }

  void _ingestConfig({bool force = false}) {
    final Map<String, dynamic> cfg = _cfg;
    final int sequence = (cfg['stateSequence'] as num?)?.toInt() ?? 0;
    if (!force && sequence < _appliedSequence) {
      return;
    }

    final List<String> nextIds = _parseStringList(cfg['participantIds']);
    final Map<String, int?> nextSelections = _parseSelections(cfg['selections']);
    final int nextTotal = (cfg['currentTotal'] as num?)?.toInt() ?? 0;
    final int nextTarget = (cfg['target'] as num?)?.toInt() ?? 0;
    final bool nextAll = cfg['allSelected'] == true;
    final bool nextIncorrect = cfg['incorrectTotal'] == true;
    final List<int> nextChoices = _parseIntList(cfg['myChoices']);
    final bool nextParticipant = cfg['isParticipant'] == true;

    final Map<String, int?> prevSelections = Map<String, int?>.of(_selections);
    final int prevTotal = _authTotal;
    final bool prevIncorrect = _incorrectTotal;

    final bool sequenceAdvanced = force || sequence > _appliedSequence;
    if (!sequenceAdvanced && !force) {
      // Same sequence: still allow local overlay fields (myChoices) refresh.
      _myChoices = nextChoices;
      _isParticipant = nextParticipant;
      return;
    }

    _appliedSequence = sequence;
    _participantIds = nextIds;
    _target = nextTarget;
    _allSelected = nextAll;
    _incorrectTotal = nextIncorrect;
    _myChoices = nextChoices;
    _isParticipant = nextParticipant;

    final String? localId = _localId;
    final int? authLocal =
        localId == null ? null : nextSelections[localId];

    if (_pendingLocal != null &&
        authLocal != null &&
        authLocal == _pendingLocal) {
      _confirmedLocal = authLocal;
      _clearPending(keepConfirmed: true);
      _pressingChoice = null;
    } else if (_pendingLocal == null && authLocal != null) {
      _confirmedLocal = authLocal;
    }

    _selections = nextSelections;

    final bool totalChanged = nextTotal != prevTotal;
    if (force || !totalChanged) {
      _authTotal = nextTotal;
      _arcFill = _arcProgress(nextTotal, nextTarget);
      _totalFrom = nextTotal.toDouble();
      _totalTo = nextTotal.toDouble();
      _arcFrom = _arcFill;
      _arcTo = _arcFill;
      _totalAnim.value = 1;
    } else {
      _animateTotal(from: prevTotal, to: nextTotal);
      _findRemotePulse(prevSelections, nextSelections);
    }

    if (nextIncorrect && !prevIncorrect) {
      _playIncorrectPulse();
    }

    if (nextAll && nextTotal == nextTarget && !_successFired) {
      _fireSuccess();
    }

    if (mounted) setState(() {});
  }

  void _maybeHandlePhaseEnd(RoundPhase previous) {
    final RoundPhase now = _ctx.challenge.roundPhase;
    if (_endedEffect) return;
    if (previous == RoundPhase.answer && now == RoundPhase.resolved) {
      _endedEffect = true;
      if (!_successFired) {
        unawaited(_centerShake.forward(from: 0));
      }
      if (mounted) setState(() {});
    }
  }

  void _animateTotal({required int from, required int to}) {
    _authTotal = to;
    _totalFrom = from.toDouble();
    _totalTo = to.toDouble();
    _arcFrom = _arcProgress(from, _target);
    _arcTo = _arcProgress(to, _target);
    _arcFill = _arcTo;
    if (_motionReduced || !_depsReady) {
      _totalAnim.value = 1;
      return;
    }
    unawaited(_totalAnim.forward(from: 0));
  }

  int get _displayTotal {
    final double t = Curves.easeOutCubic.transform(_totalAnim.value);
    return (_totalFrom + (_totalTo - _totalFrom) * t).round();
  }

  double get _displayArc {
    final double t = Curves.easeOutCubic.transform(_totalAnim.value);
    return _arcFrom + (_arcTo - _arcFrom) * t;
  }

  double _arcProgress(int total, int target) {
    if (target <= 0) return total > 0 ? 1 : 0;
    return (total / target).clamp(0.0, 1.0);
  }

  void _findRemotePulse(
    Map<String, int?> prev,
    Map<String, int?> next,
  ) {
    final String? localId = _localId;
    for (final String id in _participantIds) {
      if (id == localId) continue;
      final int? before = prev[id];
      final int? after = next[id];
      if (after != null && after != before) {
        _pulsePlayerId = id;
        _startEnergyTravel(id);
        _pulseClearTimer?.cancel();
        _pulseClearTimer = Timer(const Duration(milliseconds: 520), () {
          if (!mounted) return;
          if (_pulsePlayerId == id) {
            setState(() => _pulsePlayerId = null);
          }
        });
        return;
      }
    }
  }

  void _startEnergyTravel(String playerId) {
    if (_reduceMotion) return;
    final int index = _participantIds.indexOf(playerId);
    if (index < 0) return;
    // Approximate node offset relative to ring center (unit circle).
    final double angle = _angleForIndex(index);
    _travelFrom = Offset(math.cos(angle), math.sin(angle));
    unawaited(_energyTravel.forward(from: 0));
  }

  void _playIncorrectPulse() {
    if (_reduceMotion) {
      unawaited(_incorrectPulse.forward(from: 0));
      return;
    }
    unawaited(_incorrectPulse.forward(from: 0));
  }

  void _fireSuccess() {
    _successFired = true;
    try {
      HapticFeedback.mediumImpact();
    } catch (_) {}
    if (!_reduceMotion) {
      // Replay total punch so the inner readout pops with the ring.
      _totalFrom = _displayTotal.toDouble();
      _totalTo = _target.toDouble();
      _arcFrom = _displayArc;
      _arcTo = 1;
      unawaited(_totalAnim.forward(from: 0));
      unawaited(_successBurst.forward(from: 0));
    } else {
      _successBurst.value = 1;
      _totalAnim.value = 1;
      _authTotal = _target;
      _arcFill = 1;
    }
  }

  void _clearPending({required bool keepConfirmed}) {
    _pendingTimer?.cancel();
    _pendingTimer = null;
    _pendingLocal = null;
    if (!keepConfirmed) {
      // restored via _confirmedLocal already
    }
  }

  void _onChoiceTap(int value) {
    if (!_canPick) return;
    if (_pendingLocal != null) return;

    setState(() {
      _pendingLocal = value;
      _pressingChoice = value;
    });
    if (!_reduceMotion) {
      unawaited(_optionPress.forward(from: 0));
    }

    // Start the ring/total win motion as soon as this seat completes the sum,
    // without waiting for the live snapshot (which can lose the race to resolve).
    if (_wouldCompleteTarget(value)) {
      _fireSuccess();
    }

    _ctx.onSubmit(<String, dynamic>{
      'selectedValue': value,
      'final': false,
    });

    _pendingTimer?.cancel();
    _pendingTimer = Timer(_pendingAckTimeout, () {
      if (!mounted) return;
      if (_pendingLocal != value) return;
      // No matching authoritative ack — reject.
      setState(() {
        _pendingLocal = null;
        _pressingChoice = null;
      });
      if (!_reduceMotion) {
        unawaited(_rejectShake.forward(from: 0));
      }
    });
  }

  /// True when [localValue] plus every other seat's authoritative pick equals target.
  bool _wouldCompleteTarget(int localValue) {
    if (_target <= 0 || _participantIds.isEmpty) return false;
    final String? localId = _localId;
    if (localId == null || !_participantIds.contains(localId)) return false;
    int total = 0;
    for (final String id in _participantIds) {
      if (id == localId) {
        total += localValue;
        continue;
      }
      final int? other = _selections[id];
      if (other == null) return false;
      total += other;
    }
    return total == _target;
  }

  List<String> _parseStringList(Object? raw) {
    if (raw is List) {
      return raw
          .map((Object? v) => v?.toString() ?? '')
          .where((String s) => s.isNotEmpty)
          .take(6)
          .toList(growable: false);
    }
    return const <String>[];
  }

  List<int> _parseIntList(Object? raw) {
    if (raw is List) {
      return raw
          .map((Object? v) => (v as num?)?.toInt())
          .whereType<int>()
          .toList(growable: false);
    }
    return const <int>[];
  }

  Map<String, int?> _parseSelections(Object? raw) {
    if (raw is! Map) return <String, int?>{};
    final Map<String, int?> out = <String, int?>{};
    raw.forEach((Object? key, Object? value) {
      final String id = key.toString();
      if (value == null) {
        out[id] = null;
      } else if (value is num) {
        out[id] = value.toInt();
      }
    });
    return out;
  }

  int get _localSeatIndex {
    final String? localId = _localId;
    if (localId == null) return 0;
    final int i = _participantIds.indexOf(localId);
    return i < 0 ? 0 : i;
  }

  /// Local seat fixed near the bottom; others evenly spaced.
  double _angleForIndex(int participantIndex) {
    final int n = _participantIds.length;
    if (n <= 0) return math.pi / 2;
    final int relative =
        (participantIndex - _localSeatIndex + n) % n;
    return math.pi / 2 + relative * (2 * math.pi / n);
  }

  PlayerPublic? _playerFor(String id) {
    for (final PlayerPublic p in _ctx.players) {
      if (p.playerId == id) return p;
    }
    return null;
  }

  String _initialFor(String id) {
    final String source = _displayNameFor(id);
    if (source.isEmpty) return '?';
    return String.fromCharCode(source.runes.first).toUpperCase();
  }

  String _displayNameFor(String id) {
    final PlayerPublic? p = _playerFor(id);
    final String? name = p?.displayName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return id.isNotEmpty ? id : '?';
  }

  Color _colorFor(String id, int index) {
    final PlayerPublic? p = _playerFor(id);
    final String? raw = p?.avatarColor;
    if (raw != null && raw.startsWith('#') && raw.length >= 7) {
      final int? parsed = int.tryParse(raw.substring(1, 7), radix: 16);
      if (parsed != null) return Color(0xFF000000 | parsed);
    }
    return kPlayerAvatarColors[index % kPlayerAvatarColors.length];
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg = _cfg;
    final String titleKey =
        (cfg['titleKey'] as String?) ?? _ctx.challenge.promptKey;
    final String promptKey =
        (cfg['promptKey'] as String?) ?? _ctx.challenge.promptKey;
    final String currentTotalKey =
        (cfg['currentTotalKey'] as String?) ??
        'challenge.complete_sum.current_total';
    final String chooseNumberKey =
        (cfg['chooseNumberKey'] as String?) ??
        'challenge.complete_sum.choose';
    final String readyKey =
        (cfg['readyKey'] as String?) ?? 'challenge.complete_sum.ready';
    final String thinkingKey =
        (cfg['thinkingKey'] as String?) ?? 'challenge.complete_sum.thinking';
    final String youKey =
        (cfg['youKey'] as String?) ?? 'challenge.complete_sum.you';

    final String title = resolver.resolve(titleKey);
    final String prompt = resolver.resolve(
      promptKey,
      params: <String, String>{'target': '$_target'},
    );
    final String totalLabel = resolver.resolve(currentTotalKey);
    final String chooseLabel = resolver.resolve(chooseNumberKey);

    final bool overTarget = _displayTotal > _target && _target > 0;
    final bool successVisual =
        _successFired || (_allSelected && _displayTotal == _target);
    final Color accent = successVisual
        ? LhColors.success
        : overTarget || _incorrectTotal
        ? LhColors.warning
        : LhColors.success;

    final double entrance = _entrance.value;
    final bool dimmed = _endedEffect && !successVisual;

    return Directionality(
      textDirection: Directionality.of(context),
      child: AnimatedBuilder(
        animation: Listenable.merge(<Listenable>[
          _entrance,
          _breathe,
          _totalAnim,
          _incorrectPulse,
          _successBurst,
          _centerShake,
          _rejectShake,
          _energyTravel,
          _optionPress,
        ]),
        builder: (BuildContext context, Widget? child) {
          final double titleT = Curves.easeOut.transform(
            (entrance / 0.35).clamp(0.0, 1.0),
          );
          final double ringT = Curves.easeOutCubic.transform(
            ((entrance - 0.12) / 0.45).clamp(0.0, 1.0),
          );
          final double panelT = Curves.easeOut.transform(
            ((entrance - 0.35) / 0.55).clamp(0.0, 1.0),
          );
          // Keep a readable floor so a stuck animation never blanks the screen.
          final double titleOpacity = math.max(0.85, titleT);
          final double ringOpacity = math.max(0.85, ringT) * (dimmed ? 0.55 : 1);
          final double panelOpacity = math.max(0.85, panelT);

          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
            child: Column(
              children: <Widget>[
                Opacity(
                  opacity: titleOpacity,
                  child: Transform.translate(
                    offset: Offset(0, (1 - titleT) * 12),
                    child: Column(
                      children: <Widget>[
                        ChallengeCountdown(
                          challenge: _ctx.challenge,
                          estimateServerNowMs: _ctx.estimateServerNowMs,
                          size: 96,
                          ringColor: accent,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          title,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineMedium
                              ?.copyWith(
                                fontWeight: FontWeight.w700,
                                color: LhColors.text,
                              ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          prompt,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(color: LhColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: Opacity(
                    opacity: ringOpacity,
                    child: Transform.scale(
                      scale: 0.92 + 0.08 * ringT,
                      child: LayoutBuilder(
                        builder:
                            (BuildContext context, BoxConstraints constraints) {
                          final double side = math.min(
                            constraints.maxWidth,
                            constraints.maxHeight,
                          );
                          if (!side.isFinite || side <= 8) {
                            return const SizedBox.shrink();
                          }
                          return Center(
                            child: SizedBox(
                              width: side,
                              height: side,
                              child: RepaintBoundary(
                                child: _buildRingStage(
                                  context: context,
                                  size: side,
                                  accent: accent,
                                  overTarget: overTarget,
                                  successVisual: successVisual,
                                  totalLabel: totalLabel,
                                  readyKey: readyKey,
                                  thinkingKey: thinkingKey,
                                  youKey: youKey,
                                  resolver: resolver,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
                Opacity(
                  opacity: panelOpacity,
                  child: Transform.translate(
                    offset: Offset(0, (1 - panelT) * 18),
                    child: _buildChoicesPanel(
                      context: context,
                      chooseLabel: chooseLabel,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildRingStage({
    required BuildContext context,
    required double size,
    required Color accent,
    required bool overTarget,
    required bool successVisual,
    required String totalLabel,
    required String readyKey,
    required String thinkingKey,
    required String youKey,
    required TranslationResolver resolver,
  }) {
    final double shakeX = math.sin(_centerShake.value * math.pi * 6) *
        6 *
        (1 - _centerShake.value);
    final double rejectX = math.sin(_rejectShake.value * math.pi * 7) *
        5 *
        (1 - _rejectShake.value);
    final double incorrectGlow = _incorrectPulse.value;
    final double successT = _successBurst.value;
    final double breathe = _reduceMotion ? 0.5 : _breathe.value;

    final Color meterColor = Color.lerp(
          accent,
          LhColors.primary,
          overTarget ? 0.55 : 0,
        ) ??
        accent;

    return Transform.translate(
      offset: Offset(shakeX + rejectX, 0),
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: <Widget>[
          // Ambient navy disc
          Container(
            width: size * 0.92,
            height: size * 0.92,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: <Color>[
                  LhColors.elevated.withValues(alpha: 0.95),
                  LhColors.bg.withValues(alpha: 0.4),
                ],
              ),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: meterColor.withValues(
                    alpha: 0.18 + incorrectGlow * 0.25 + successT * 0.35,
                  ),
                  blurRadius: 28 + successT * 40,
                  spreadRadius: 2 + successT * 8,
                ),
              ],
            ),
          ),
          // Energy arc
          CustomPaint(
            size: Size(size, size),
            painter: _EnergyRingPainter(
              progress: overTarget ? 1 : _displayArc,
              color: meterColor,
              warning: overTarget || incorrectGlow > 0.05,
              success: successVisual,
              successT: successT,
              stroke: size * 0.045,
            ),
          ),
          // Traveling energy pulse
          if (_travelFrom != null && _energyTravel.isAnimating)
            CustomPaint(
              size: Size(size, size),
              painter: _TravelPulsePainter(
                from: _travelFrom!,
                t: _energyTravel.value,
                color: LhColors.success,
                ringRadius: size * 0.34,
              ),
            ),
          // Success shockwave + streaks
          if (successT > 0)
            CustomPaint(
              size: Size(size, size),
              painter: _SuccessBurstPainter(t: successT, color: LhColors.success),
            ),
          // Center meter readout — scales and brightens on hit.
          Transform.scale(
            scale: successVisual
                ? 1 +
                    Curves.elasticOut.transform(successT.clamp(0.0, 1.0)) * 0.22
                : 1,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  totalLabel,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: successVisual
                        ? LhColors.success.withValues(alpha: 0.9)
                        : LhColors.textMuted,
                    letterSpacing: 0.2,
                    fontWeight:
                        successVisual ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
                const SizedBox(height: 4),
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Text(
                    '$_displayTotal / $_target',
                    key: const ValueKey<String>('complete_sum_total'),
                    style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                      color: meterColor,
                      fontWeight: FontWeight.w800,
                      fontSize: successVisual
                          ? (Theme.of(context)
                                      .textTheme
                                      .headlineLarge
                                      ?.fontSize ??
                                  32) +
                              4 * successT
                          : null,
                      shadows: <Shadow>[
                        Shadow(
                          color: meterColor.withValues(
                            alpha: 0.55 + successT * 0.35,
                          ),
                          blurRadius: 12 + successT * 18,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Participant nodes
          for (int i = 0; i < _participantIds.length; i++)
            _buildPlayerNode(
              context: context,
              index: i,
              size: size,
              breathe: breathe,
              readyLabel: resolver.resolve(readyKey),
              thinkingLabel: resolver.resolve(thinkingKey),
              youLabel: resolver.resolve(youKey),
            ),
        ],
      ),
    );
  }

  Widget _buildPlayerNode({
    required BuildContext context,
    required int index,
    required double size,
    required double breathe,
    required String readyLabel,
    required String thinkingLabel,
    required String youLabel,
  }) {
    final String id = _participantIds[index];
    final bool isLocal = id == _localId;
    final int? auth = _selections[id];
    final int? shown = isLocal
        ? (_pendingLocal ?? auth ?? _confirmedLocal)
        : auth;
    final bool selected = shown != null;
    // Pending is optimistic; authoritative null still means unselected.
    final bool authSelected = auth != null;
    final bool pending = isLocal && _pendingLocal != null;
    final bool pulsing = _pulsePlayerId == id;

    final double angle = _angleForIndex(index);
    final double radius = size * 0.38;
    final double nodeSize = size * 0.18;
    final Offset center = Offset(size / 2, size / 2);
    final Offset pos = Offset(
      center.dx + math.cos(angle) * radius - nodeSize / 2,
      center.dy + math.sin(angle) * radius - nodeSize / 2,
    );

    final double stagger = ((_entrance.value - 0.2 - index * 0.06) / 0.35)
        .clamp(0.0, 1.0);
    final double nodeScale =
        0.8 + 0.2 * Curves.easeOut.transform(stagger);
    // Nodes may stagger in, but never stay fully invisible.
    final double nodeOpacity = math.max(0.55, stagger);

    final Color color = _colorFor(id, index);
    final double glow = selected
        ? 0.55
        : 0.25 + breathe * 0.35;

    return Positioned(
      left: pos.dx,
      top: pos.dy,
      width: nodeSize,
      height: nodeSize + 28,
      child: Opacity(
        opacity: nodeOpacity,
        child: Transform.scale(
          scale: nodeScale * (pulsing ? 1.08 : 1),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              SizedBox(
                width: nodeSize * 0.9,
                height: nodeSize * 0.9,
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.center,
                  children: <Widget>[
                    AnimatedContainer(
                      duration: _reduceMotion
                          ? Duration.zero
                          : const Duration(milliseconds: 220),
                      width: nodeSize * 0.78,
                      height: nodeSize * 0.78,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: LhColors.elevated,
                        border: Border.all(
                          color: selected
                              ? LhColors.success
                              : color.withValues(alpha: 0.7 + glow * 0.3),
                          width: selected ? 2.4 : 1.6,
                        ),
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: (selected ? LhColors.success : color)
                                .withValues(
                              alpha: selected ? 0.45 : glow * 0.5,
                            ),
                            blurRadius: selected ? 14 : 10 + breathe * 8,
                            spreadRadius: selected ? 1 : 0,
                          ),
                        ],
                      ),
                      alignment: Alignment.center,
                      // Identity stays in the avatar — never swap for the pick.
                      child: Text(
                        _initialFor(id),
                        style: TextStyle(
                          color: selected ? LhColors.text : LhColors.textMuted,
                          fontWeight: FontWeight.w700,
                          fontSize: nodeSize * 0.22,
                        ),
                      ),
                    ),
                    if (selected)
                      Positioned(
                        right: 0,
                        top: -2,
                        child: AnimatedSwitcher(
                          duration: _reduceMotion
                              ? Duration.zero
                              : const Duration(milliseconds: 220),
                          transitionBuilder:
                              (Widget child, Animation<double> anim) {
                            return FadeTransition(
                              opacity: anim,
                              child: ScaleTransition(
                                scale: anim,
                                child: child,
                              ),
                            );
                          },
                          child: Container(
                            key: ValueKey<String>('sel-$id-$shown'),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 5,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: LhColors.success,
                              borderRadius: BorderRadius.circular(8),
                              boxShadow: <BoxShadow>[
                                BoxShadow(
                                  color: LhColors.success.withValues(
                                    alpha: 0.45,
                                  ),
                                  blurRadius: 6,
                                ),
                              ],
                            ),
                            child: Text(
                              '$shown',
                              style: TextStyle(
                                color: LhColors.bg,
                                fontWeight: FontWeight.w800,
                                fontSize: math.max(10, nodeSize * 0.16),
                                height: 1.1,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Text(
                isLocal ? youLabel : _displayNameFor(id),
                key: ValueKey<String>(isLocal ? 'local-name' : 'name-$id'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: LhColors.text,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                isLocal
                    ? (selected ? readyLabel : thinkingLabel)
                    : (authSelected ? readyLabel : thinkingLabel),
                key: ValueKey<String>(
                  isLocal
                      ? 'local-status'
                      : (authSelected ? 'ready-$id' : 'thinking-$id'),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: selected ? LhColors.success : LhColors.textMuted,
                  fontSize: 9,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildChoicesPanel({
    required BuildContext context,
    required String chooseLabel,
  }) {
    if (!_isParticipant || _myChoices.isEmpty) {
      final TranslationResolver resolver = AppLocalization.of(context);
      final String message = _isParticipant
          ? chooseLabel
          : resolver.resolve(TranslationKeys.spectatorMessage);
      return Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: LhColors.textMuted,
          ),
        ),
      );
    }

    return Column(
      children: <Widget>[
        Text(
          chooseLabel,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: LhColors.textMuted,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: <Widget>[
            for (int i = 0; i < _myChoices.length; i++) ...<Widget>[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: _ChoiceButton(
                  value: _myChoices[i],
                  enabled: _canPick && _pendingLocal == null,
                  highlighted: _pendingLocal == _myChoices[i] ||
                      _confirmedLocal == _myChoices[i],
                  pressing: _pressingChoice == _myChoices[i],
                  pressT: _optionPress.value,
                  onTap: () => _onChoiceTap(_myChoices[i]),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _ChoiceButton extends StatelessWidget {
  const _ChoiceButton({
    required this.value,
    required this.enabled,
    required this.highlighted,
    required this.pressing,
    required this.pressT,
    required this.onTap,
  });

  final int value;
  final bool enabled;
  final bool highlighted;
  final bool pressing;
  final double pressT;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final double scale = pressing
        ? 1 - 0.08 * Curves.easeOutBack.transform(pressT.clamp(0.0, 1.0))
        : 1;
    return Transform.scale(
      scale: scale,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: LhRadii.mdAll,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            height: 56,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: LhRadii.mdAll,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: highlighted
                    ? <Color>[
                        LhColors.success.withValues(alpha: 0.35),
                        LhColors.elevated,
                      ]
                    : <Color>[
                        LhColors.elevated,
                        LhColors.surface,
                      ],
              ),
              border: Border.all(
                color: highlighted
                    ? LhColors.success
                    : LhColors.border,
                width: highlighted ? 2 : 1.2,
              ),
              boxShadow: highlighted
                  ? <BoxShadow>[
                      BoxShadow(
                        color: LhColors.success.withValues(alpha: 0.35),
                        blurRadius: 12,
                      ),
                    ]
                  : null,
            ),
            child: Text(
              '$value',
              key: ValueKey<String>('choice-$value'),
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: enabled ? LhColors.text : LhColors.disabled,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _EnergyRingPainter extends CustomPainter {
  _EnergyRingPainter({
    required this.progress,
    required this.color,
    required this.warning,
    required this.success,
    required this.successT,
    required this.stroke,
  });

  final double progress;
  final Color color;
  final bool warning;
  final bool success;
  final double successT;
  final double stroke;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = Offset(size.width / 2, size.height / 2);
    final double radius = size.shortestSide * 0.34;
    final Rect rect = Rect.fromCircle(center: c, radius: radius);

    final Paint track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = LhColors.border.withValues(alpha: 0.7)
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, 0, math.pi * 2, false, track);

    final Color glowColor = warning
        ? Color.lerp(color, LhColors.primary, 0.35) ?? color
        : color;

    final Paint arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(
        colors: <Color>[
          glowColor.withValues(alpha: 0.25),
          glowColor,
          glowColor.withValues(alpha: 0.85),
        ],
      ).createShader(rect);

    // Start from top (-pi/2).
    canvas.drawArc(
      rect,
      -math.pi / 2,
      math.pi * 2 * progress.clamp(0.0, 1.0),
      false,
      arc,
    );

    if (success && successT > 0) {
      final double ease = Curves.easeOut.transform(successT.clamp(0.0, 1.0));
      final Paint halo = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke * (1.2 + ease * 1.4)
        ..color = LhColors.success.withValues(alpha: 0.45 * (1 - ease));
      canvas.drawCircle(c, radius + ease * 28, halo);

      final Paint fillPulse = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke * (1 + (1 - ease) * 0.6)
        ..color = LhColors.success.withValues(alpha: 0.55 + (1 - ease) * 0.35)
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(rect, -math.pi / 2, math.pi * 2, false, fillPulse);

      final Paint outer = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke * 0.55
        ..color = LhColors.success.withValues(alpha: 0.28 * (1 - ease));
      canvas.drawCircle(c, radius + ease * 46, outer);
    }
  }

  @override
  bool shouldRepaint(covariant _EnergyRingPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.color != color ||
        oldDelegate.warning != warning ||
        oldDelegate.success != success ||
        oldDelegate.successT != successT ||
        oldDelegate.stroke != stroke;
  }
}

class _TravelPulsePainter extends CustomPainter {
  _TravelPulsePainter({
    required this.from,
    required this.t,
    required this.color,
    required this.ringRadius,
  });

  final Offset from;
  final double t;
  final Color color;
  final double ringRadius;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = Offset(size.width / 2, size.height / 2);
    final Offset start = c + from * ringRadius;
    final Offset p = Offset.lerp(start, c, Curves.easeIn.transform(t))!;
    final Paint paint = Paint()
      ..color = color.withValues(alpha: 0.85 * (1 - t * 0.3))
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawCircle(p, 7 * (1 - t * 0.4), paint);
  }

  @override
  bool shouldRepaint(covariant _TravelPulsePainter oldDelegate) {
    return oldDelegate.t != t ||
        oldDelegate.from != from ||
        oldDelegate.color != color;
  }
}

class _SuccessBurstPainter extends CustomPainter {
  _SuccessBurstPainter({required this.t, required this.color});

  final double t;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = Offset(size.width / 2, size.height / 2);
    final double maxR = size.shortestSide * 0.48;
    final Paint wave = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..color = color.withValues(alpha: (1 - t) * 0.7);
    canvas.drawCircle(c, maxR * t, wave);

    final Paint streak = Paint()
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..color = color.withValues(alpha: (1 - t) * 0.55);
    for (int i = 0; i < 10; i++) {
      final double a = i * (math.pi * 2 / 10);
      final double r0 = maxR * 0.2 * t;
      final double r1 = maxR * (0.35 + 0.55 * t);
      canvas.drawLine(
        c + Offset(math.cos(a) * r0, math.sin(a) * r0),
        c + Offset(math.cos(a) * r1, math.sin(a) * r1),
        streak,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _SuccessBurstPainter oldDelegate) {
    return oldDelegate.t != t || oldDelegate.color != color;
  }
}
