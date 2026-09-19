import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../content/content_asset_cache.dart';
import '../state/match_snapshot.dart';
import '../ui/widgets/challenge_sfx.dart';
import 'challenge_engine.dart';

/// Common Word — الكلمة المشتركة (`trivia.common_word`).
///
/// Binding visual: midnight Arabic constellation mockup, painted
/// programmatically (no challenge image assets).
class CommonWordEngine implements ChallengeEngine {
  @override
  String get engineId => 'trivia.common_word';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _CommonWordWidget(challengeContext: challengeContext);
  }
}

class _CommonWordClue {
  const _CommonWordClue({
    required this.id,
    required this.text,
    this.visualHint,
  });

  final String id;
  final String text;
  final String? visualHint;
}

class _CommonWordWidget extends StatefulWidget {
  const _CommonWordWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_CommonWordWidget> createState() => _CommonWordWidgetState();
}

class _CommonWordWidgetState extends State<_CommonWordWidget>
    with TickerProviderStateMixin {
  static final Set<String> _seenChallenges = <String>{};

  static const Color _navy = Color(0xFF040B14);
  static const Color _navyMid = Color(0xFF0A1628);
  static const Color _cyan = Color(0xFF3DE8FF);
  static const Color _cyanSoft = Color(0xFF9AF6FF);
  static const Color _gold = Color(0xFFE0C15A);
  static const Color _goldBright = Color(0xFFF6E39A);
  static const Color _cream = Color(0xFFF7FAFC);

  late final AnimationController _entrance;
  late final AnimationController _result;
  late final Ticker _ticker;
  late final ValueNotifier<double> _time;

  String? _pendingKey;
  String? _selectedKey;
  bool _disposed = false;
  bool _reconnect = false;
  bool _loopStarted = false;
  bool _loopStopping = false;

  ChallengeContext get _ctx => widget.challengeContext;
  Map<String, dynamic> get _cfg => _ctx.challenge.clientConfig;

  String get _backgroundSfxAssetId {
    final Object? raw = _cfg['backgroundSfxAssetId'];
    if (raw is String && raw.trim().isNotEmpty) return raw.trim();
    return ChallengeSfx.defaultCommonWordBackgroundAssetId;
  }

  List<_CommonWordClue> get _clues {
    final Object? raw = _cfg['clues'];
    if (raw is! List) return const <_CommonWordClue>[];
    final List<_CommonWordClue> out = <_CommonWordClue>[];
    for (final Object? item in raw) {
      if (item is! Map) continue;
      final String id = item['id'] is String ? item['id'] as String : '';
      final String text = item['text'] is String ? item['text'] as String : '';
      if (id.isEmpty || text.isEmpty) continue;
      out.add(
        _CommonWordClue(
          id: id,
          text: text,
          visualHint: item['visualHint'] is String
              ? item['visualHint'] as String
              : null,
        ),
      );
    }
    return out;
  }

  List<String> get _optionKeys {
    final Object? raw = _cfg['optionKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList(growable: false);
    }
    return const <String>[];
  }

  String? _optionText(String key) {
    final Object? raw = _cfg['optionTexts'];
    if (raw is Map && raw[key] is String) {
      return raw[key] as String;
    }
    return null;
  }

  String _resolved(
    TranslationResolver resolver,
    String key,
    Object? pinned,
  ) {
    if (pinned is String && pinned.trim().isNotEmpty) return pinned;
    if (key.isEmpty) return '';
    return resolver.resolve(key);
  }

  bool get _reduceMotion => MediaQuery.disableAnimationsOf(context);

  @override
  void initState() {
    super.initState();
    _reconnect = _seenChallenges.contains(_ctx.challenge.challengeInstanceId);
    _seenChallenges.add(_ctx.challenge.challengeInstanceId);
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    _result = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _time = ValueNotifier<double>(0);
    _ticker = createTicker((Duration elapsed) {
      if (_disposed) return;
      _time.value = elapsed.inMilliseconds / 1000.0;
    })..start();
    if (_reconnect) {
      _entrance.value = 1;
    } else {
      _entrance.forward();
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_startBackgroundBed());
    });
  }

  Future<void> _startBackgroundBed() async {
    if (_disposed || _loopStarted || !mounted) return;
    // Respect reduced-motion / no-animation accessibility for looping beds.
    if (MediaQuery.disableAnimationsOf(context)) return;
    final String assetId = _backgroundSfxAssetId;
    await ContentAssetCache.instance.ensureAsset(assetId);
    if (_disposed || !mounted) return;
    final String? outcome = _ctx.localOutcome;
    if (outcome != null) return;
    final bool started = await ChallengeSfx.instance.playLoop(assetId);
    if (_disposed) {
      if (started) {
        await ChallengeSfx.instance.stopLoop();
      }
      return;
    }
    _loopStarted = started;
  }

  Future<void> _stopBackgroundBed() async {
    if (_loopStopping || !_loopStarted) {
      await ChallengeSfx.instance.stopLoop();
      _loopStarted = false;
      return;
    }
    _loopStopping = true;
    _loopStarted = false;
    try {
      await ChallengeSfx.instance.stopLoop();
    } finally {
      _loopStopping = false;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_reduceMotion && !_reconnect && _entrance.value < 1) {
      _entrance.duration = const Duration(milliseconds: 260);
    }
  }

  @override
  void didUpdateWidget(covariant _CommonWordWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    final AnswerSubmissionStatus prev = oldWidget.challengeContext.answerStatus;
    final AnswerSubmissionStatus next = _ctx.answerStatus;
    if (prev == AnswerSubmissionStatus.pending &&
        next == AnswerSubmissionStatus.rejected) {
      _pendingKey = null;
      setState(() {});
    }
    final String? outcome = _ctx.localOutcome;
    if (outcome != null &&
        oldWidget.challengeContext.localOutcome != outcome) {
      unawaited(_stopBackgroundBed());
      if (outcome == 'success') {
        unawaited(HapticFeedback.mediumImpact());
      } else {
        unawaited(HapticFeedback.heavyImpact());
      }
      if (!_reduceMotion) {
        _result.forward(from: 0);
      } else {
        _result.value = 1;
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_stopBackgroundBed());
    _ticker.dispose();
    _time.dispose();
    _entrance.dispose();
    _result.dispose();
    super.dispose();
  }

  void _onSelect(String optionKey) {
    if (_ctx.isInteractionLocked || _pendingKey != null) return;
    setState(() {
      _pendingKey = optionKey;
      _selectedKey = optionKey;
    });
    HapticFeedback.selectionClick();
    _ctx.onSubmit(<String, dynamic>{'chosenOptionKey': optionKey});
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final List<_CommonWordClue> clues = _clues;
    final List<String> options = _optionKeys;
    final String title = _resolved(
      resolver,
      (_cfg['titleKey'] as String?) ?? 'challenge.common_word.title',
      _cfg['titleText'],
    );
    final String instruction = _resolved(
      resolver,
      (_cfg['promptKey'] as String?) ?? 'challenge.common_word.prompt',
      _cfg['instructionText'],
    );
    final String timerLabel = _resolved(
      resolver,
      'challenge.common_word.time_remaining',
      null,
    );
    final String? outcome = _ctx.localOutcome;
    final bool timedOut = outcome == 'timeout';
    final bool success = outcome == 'success';
    final bool failure = outcome == 'failure';
    final String? revealWord = success && _selectedKey != null
        ? (_optionText(_selectedKey!) ?? _selectedKey)
        : null;

    return Semantics(
      label: '$title. $instruction',
      child: AnimatedBuilder(
        animation: Listenable.merge(<Listenable>[_entrance, _result, _time]),
        builder: (BuildContext context, Widget? _) {
          final double t = _entrance.value;
          final double seconds = _time.value;
          final double pulse = _reduceMotion
              ? 0.5
              : (0.5 + 0.5 * math.sin(seconds * 2.1));
          final double dim = timedOut ? 0.5 : (failure ? 0.85 : 1.0);

          return Stack(
            fit: StackFit.expand,
            children: <Widget>[
              RepaintBoundary(
                child: CustomPaint(
                  painter: _AtmospherePainter(
                    progress: t,
                    pulse: pulse,
                    time: seconds,
                    dim: dim,
                    reduceMotion: _reduceMotion,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 2, 12, 8),
                child: Column(
                  children: <Widget>[
                    Opacity(
                      opacity: Curves.easeOut.transform(t.clamp(0.0, 1.0)),
                      child: _ServerTimerChrome(
                        challengeStartsAtMs: _ctx.challenge.startsAtMs,
                        challengeDeadlineAtMs: _ctx.challenge.deadlineAtMs,
                        estimateServerNowMs: _ctx.estimateServerNowMs,
                        label: timerLabel.isEmpty ||
                                timerLabel.startsWith('MISSING:')
                            ? 'الوقت المتبقي'
                            : timerLabel,
                        cyan: _cyan,
                        cream: _cream,
                        frozen: timedOut,
                      ),
                    ),
                    const SizedBox(height: 2),
                    _TitleBlock(
                      title: title,
                      instruction: instruction,
                      progress: Curves.easeOutCubic.transform(
                        ((t - 0.06) / 0.28).clamp(0.0, 1.0),
                      ),
                      gold: _gold,
                      goldBright: _goldBright,
                      cream: _cream,
                      cyan: _cyan,
                    ),
                    const SizedBox(height: 2),
                    Expanded(
                      flex: 5,
                      child: _ConstellationStage(
                        clues: clues,
                        entrance: t,
                        time: seconds,
                        pulse: pulse,
                        reduceMotion: _reduceMotion,
                        revealWord: revealWord,
                        successFlash: success ? _result.value : 0,
                        failureDim: failure ? _result.value : 0,
                        timeoutDim: timedOut ? 1.0 : 0.0,
                        navy: _navy,
                        navyMid: _navyMid,
                        cyan: _cyan,
                        cyanSoft: _cyanSoft,
                        gold: _gold,
                        cream: _cream,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Flexible(
                      flex: 3,
                      child: _AnswerGrid(
                        options: options,
                        optionText: (String key) =>
                            _resolved(resolver, key, _optionText(key)),
                        progress: t,
                        selectedKey: _selectedKey,
                        pendingKey: _pendingKey,
                        success: success,
                        failure: failure,
                        timedOut: timedOut,
                        resultT: _result.value,
                        locked: _ctx.isInteractionLocked ||
                            _pendingKey != null ||
                            timedOut,
                        onSelect: _onSelect,
                        cyan: _cyan,
                        gold: _gold,
                        navy: _navyMid,
                        cream: _cream,
                        time: seconds,
                        reduceMotion: _reduceMotion,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Timer chrome (server-authoritative; MM:SS)
// ---------------------------------------------------------------------------

class _ServerTimerChrome extends StatefulWidget {
  const _ServerTimerChrome({
    required this.challengeStartsAtMs,
    required this.challengeDeadlineAtMs,
    required this.estimateServerNowMs,
    required this.label,
    required this.cyan,
    required this.cream,
    required this.frozen,
  });

  final int challengeStartsAtMs;
  final int challengeDeadlineAtMs;
  final int Function() estimateServerNowMs;
  final String label;
  final Color cyan;
  final Color cream;
  final bool frozen;

  @override
  State<_ServerTimerChrome> createState() => _ServerTimerChromeState();
}

class _ServerTimerChromeState extends State<_ServerTimerChrome> {
  Timer? _timer;
  double _progress = 1;
  String _clock = '00:00';

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(milliseconds: 50), (_) => _tick());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _tick() {
    final int nowMs = widget.estimateServerNowMs();
    if (nowMs <= 0) return;
    final int deadline = widget.challengeDeadlineAtMs;
    final int startsAt = widget.challengeStartsAtMs;
    final int durationMs = (deadline - startsAt).clamp(1, 60000);
    final double prog = 1.0 - ((nowMs - startsAt) / durationMs);
    final int remainingMs = (deadline - nowMs).clamp(0, 99 * 1000);
    final int totalSec = (remainingMs / 1000).floor();
    final String mm = (totalSec ~/ 60).toString().padLeft(2, '0');
    final String ss = (totalSec % 60).toString().padLeft(2, '0');
    if (!mounted) return;
    setState(() {
      _progress = widget.frozen ? 0 : prog.clamp(0.0, 1.0);
      _clock = '$mm:$ss';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'remaining time $_clock',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            widget.label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: widget.cream.withValues(alpha: 0.9),
              letterSpacing: 0.4,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              shadows: <Shadow>[
                Shadow(
                  color: widget.cyan.withValues(alpha: 0.35),
                  blurRadius: 8,
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          SizedBox(
            width: 104,
            height: 104,
            child: CustomPaint(
              painter: _TimerRingPainter(
                progress: _progress,
                cyan: widget.cyan,
              ),
              child: Center(
                child: Text(
                  _clock,
                  textDirection: TextDirection.ltr,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: widget.cream,
                    fontWeight: FontWeight.w800,
                    fontFeatures: const <ui.FontFeature>[
                      ui.FontFeature.tabularFigures(),
                    ],
                    fontSize: 26,
                    shadows: <Shadow>[
                      Shadow(
                        color: widget.cyan.withValues(alpha: 0.45),
                        blurRadius: 10,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TimerRingPainter extends CustomPainter {
  _TimerRingPainter({required this.progress, required this.cyan});

  final double progress;
  final Color cyan;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = Offset(size.width / 2, size.height / 2);
    final double r = size.width / 2 - 6;

    canvas.drawCircle(
      c,
      r + 8,
      Paint()
        ..color = cyan.withValues(alpha: 0.22)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
    );
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..shader = ui.Gradient.radial(c, r, <Color>[
          const Color(0xFF123048),
          const Color(0xFF071422),
          const Color(0xFF040B14),
        ], <double>[0, 0.55, 1]),
    );
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.8
        ..color = cyan.withValues(alpha: 0.18),
    );
    canvas.drawCircle(
      c,
      r - 5,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.1
        ..color = cyan.withValues(alpha: 0.12),
    );

    final double sweep = 2 * math.pi * progress.clamp(0.0, 1.0);
    canvas.drawArc(
      Rect.fromCircle(center: c, radius: r),
      -math.pi / 2,
      sweep,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5.2
        ..strokeCap = StrokeCap.round
        ..color = cyan.withValues(alpha: 0.45)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
    canvas.drawArc(
      Rect.fromCircle(center: c, radius: r),
      -math.pi / 2,
      sweep,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..strokeCap = StrokeCap.round
        ..color = const Color(0xFFB8F7FF),
    );
  }

  @override
  bool shouldRepaint(covariant _TimerRingPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

// ---------------------------------------------------------------------------
// Title — gold display + flanking flourishes
// ---------------------------------------------------------------------------

class _TitleBlock extends StatelessWidget {
  const _TitleBlock({
    required this.title,
    required this.instruction,
    required this.progress,
    required this.gold,
    required this.goldBright,
    required this.cream,
    required this.cyan,
  });

  final String title;
  final String instruction;
  final double progress;
  final Color gold;
  final Color goldBright;
  final Color cream;
  final Color cyan;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: progress,
      child: Transform.translate(
        offset: Offset(0, (1 - progress) * 12),
        child: Column(
          children: <Widget>[
            SizedBox(
              height: 44,
              child: Stack(
                alignment: Alignment.center,
                children: <Widget>[
                  CustomPaint(
                    size: const Size(320, 44),
                    painter: _TitleFlourishPainter(gold: gold, cyan: cyan),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 48),
                    child: Text(
                      title,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                        color: goldBright,
                        fontWeight: FontWeight.w900,
                        fontSize: 32,
                        height: 1.1,
                        shadows: <Shadow>[
                          Shadow(
                            color: gold.withValues(alpha: 0.7),
                            blurRadius: 18,
                          ),
                          Shadow(
                            color: gold.withValues(alpha: 0.35),
                            blurRadius: 36,
                            offset: const Offset(0, 3),
                          ),
                          Shadow(
                            color: Colors.black.withValues(alpha: 0.55),
                            blurRadius: 4,
                            offset: const Offset(0, 1),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Text(
              instruction,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: cream.withValues(alpha: 0.95),
                height: 1.35,
                fontSize: 14.5,
                fontWeight: FontWeight.w500,
                shadows: <Shadow>[
                  Shadow(
                    color: cyan.withValues(alpha: 0.3),
                    blurRadius: 10,
                  ),
                  Shadow(
                    color: Colors.black.withValues(alpha: 0.5),
                    blurRadius: 4,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TitleFlourishPainter extends CustomPainter {
  _TitleFlourishPainter({required this.gold, required this.cyan});

  final Color gold;
  final Color cyan;

  @override
  void paint(Canvas canvas, Size size) {
    final double midY = size.height / 2;
    final double cx = size.width / 2;
    final Paint stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.35
      ..strokeCap = StrokeCap.round
      ..color = gold.withValues(alpha: 0.88);
    final Paint glow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.2
      ..color = gold.withValues(alpha: 0.22)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);

    void wing(double dir) {
      final Path p = Path()
        ..moveTo(cx + dir * 52, midY)
        ..cubicTo(
          cx + dir * 78,
          midY - 14,
          cx + dir * 108,
          midY + 10,
          cx + dir * 138,
          midY - 2,
        )
        ..moveTo(cx + dir * 52, midY)
        ..cubicTo(
          cx + dir * 72,
          midY + 12,
          cx + dir * 100,
          midY - 8,
          cx + dir * 128,
          midY + 6,
        )
        ..moveTo(cx + dir * 128, midY + 6)
        ..quadraticBezierTo(
          cx + dir * 142,
          midY + 2,
          cx + dir * 148,
          midY - 8,
        );
      canvas.drawPath(p, glow);
      canvas.drawPath(p, stroke);
      canvas.drawCircle(
        Offset(cx + dir * 148, midY - 8),
        2.2,
        Paint()..color = gold.withValues(alpha: 0.9),
      );
    }

    wing(-1);
    wing(1);

    // Center jewel under title
    canvas.drawCircle(
      Offset(cx, midY + 16),
      2.6,
      Paint()..color = cyan.withValues(alpha: 0.85),
    );
    canvas.drawCircle(
      Offset(cx, midY + 16),
      5.2,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.0
        ..color = gold.withValues(alpha: 0.75),
    );
  }

  @override
  bool shouldRepaint(covariant _TitleFlourishPainter oldDelegate) => false;
}

// ---------------------------------------------------------------------------
// Constellation
// ---------------------------------------------------------------------------

class _LayoutGeom {
  const _LayoutGeom({
    required this.top,
    required this.left,
    required this.right,
    required this.center,
    required this.cardW,
    required this.cardH,
    required this.nodeR,
  });

  final Offset top;
  final Offset left;
  final Offset right;
  final Offset center;
  final double cardW;
  final double cardH;
  final double nodeR;

  /// Beam start points on card edges (not centers).
  Offset get topAnchor => Offset(top.dx, top.dy + cardH / 2);
  Offset get leftAnchor => Offset(left.dx + cardW / 2, left.dy);
  Offset get rightAnchor => Offset(right.dx - cardW / 2, right.dy);
}

_LayoutGeom _computeGeom(Size size) {
  final double cardW = (size.width * 0.38).clamp(108.0, 148.0);
  final double cardH = (size.height * 0.24).clamp(64.0, 84.0);
  const double nodeR = 42.0;
  final Offset top = Offset(size.width / 2, cardH / 2 + 4);
  final Offset left = Offset(cardW / 2 + 4, size.height - cardH / 2 - 6);
  final Offset right = Offset(
    size.width - cardW / 2 - 4,
    size.height - cardH / 2 - 6,
  );
  final Offset center = Offset(
    size.width / 2,
    (top.dy + left.dy) / 2 + cardH * 0.06,
  );
  return _LayoutGeom(
    top: top,
    left: left,
    right: right,
    center: center,
    cardW: cardW,
    cardH: cardH,
    nodeR: nodeR,
  );
}

class _ConstellationStage extends StatelessWidget {
  const _ConstellationStage({
    required this.clues,
    required this.entrance,
    required this.time,
    required this.pulse,
    required this.reduceMotion,
    required this.revealWord,
    required this.successFlash,
    required this.failureDim,
    required this.timeoutDim,
    required this.navy,
    required this.navyMid,
    required this.cyan,
    required this.cyanSoft,
    required this.gold,
    required this.cream,
  });

  final List<_CommonWordClue> clues;
  final double entrance;
  final double time;
  final double pulse;
  final bool reduceMotion;
  final String? revealWord;
  final double successFlash;
  final double failureDim;
  final double timeoutDim;
  final Color navy;
  final Color navyMid;
  final Color cyan;
  final Color cyanSoft;
  final Color gold;
  final Color cream;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final Size size = Size(constraints.maxWidth, constraints.maxHeight);
        final _LayoutGeom g = _computeGeom(size);
        final _CommonWordClue? top = clues.isNotEmpty ? clues[0] : null;
        final _CommonWordClue? left = clues.length > 1 ? clues[1] : null;
        final _CommonWordClue? right = clues.length > 2 ? clues[2] : null;

        final double revealTop = Curves.easeOutCubic.transform(
          ((entrance - 0.18) / 0.2).clamp(0.0, 1.0),
        );
        final double revealSide = Curves.easeOutCubic.transform(
          ((entrance - 0.28) / 0.2).clamp(0.0, 1.0),
        );
        final double lineT = Curves.easeOut.transform(
          ((entrance - 0.38) / 0.28).clamp(0.0, 1.0),
        );
        final double nodeT = Curves.easeOutBack.transform(
          ((entrance - 0.46) / 0.22).clamp(0.0, 1.0),
        );
        final double flowBoost = 1.0 + successFlash * 0.85;
        final double lineDim =
            (1.0 - timeoutDim * 0.65 - failureDim * 0.25) * flowBoost;

        return Semantics(
          label: 'unknown common word',
          child: Stack(
            clipBehavior: Clip.none,
            children: <Widget>[
              RepaintBoundary(
                child: CustomPaint(
                  size: size,
                  painter: _EnergyConnectionsPainter(
                    geom: g,
                    lineProgress: lineT,
                    time: time,
                    pulse: pulse,
                    cyan: cyan,
                    cyanSoft: cyanSoft,
                    gold: gold,
                    dim: lineDim,
                    reduceMotion: reduceMotion,
                  ),
                ),
              ),
              if (top != null)
                Positioned(
                  left: g.top.dx - g.cardW / 2,
                  top: g.top.dy - g.cardH / 2,
                  child: Opacity(
                    opacity: revealTop,
                    child: Transform.translate(
                      offset: Offset(0, (1 - revealTop) * 14),
                      child: _ClueCard(
                        clue: top,
                        width: g.cardW,
                        height: g.cardH,
                        navy: navyMid,
                        gold: gold,
                        cyan: cyan,
                        cream: cream,
                        time: time,
                        reduceMotion: reduceMotion,
                      ),
                    ),
                  ),
                ),
              if (left != null)
                Positioned(
                  left: g.left.dx - g.cardW / 2,
                  top: g.left.dy - g.cardH / 2,
                  child: Opacity(
                    opacity: revealSide,
                    child: Transform.translate(
                      offset: Offset(-(1 - revealSide) * 16, 0),
                      child: _ClueCard(
                        clue: left,
                        width: g.cardW,
                        height: g.cardH,
                        navy: navyMid,
                        gold: gold,
                        cyan: cyan,
                        cream: cream,
                        time: time,
                        reduceMotion: reduceMotion,
                      ),
                    ),
                  ),
                ),
              if (right != null)
                Positioned(
                  left: g.right.dx - g.cardW / 2,
                  top: g.right.dy - g.cardH / 2,
                  child: Opacity(
                    opacity: revealSide,
                    child: Transform.translate(
                      offset: Offset((1 - revealSide) * 16, 0),
                      child: _ClueCard(
                        clue: right,
                        width: g.cardW,
                        height: g.cardH,
                        navy: navyMid,
                        gold: gold,
                        cyan: cyan,
                        cream: cream,
                        time: time,
                        reduceMotion: reduceMotion,
                      ),
                    ),
                  ),
                ),
              Positioned(
                left: g.center.dx - g.nodeR,
                top: g.center.dy - g.nodeR,
                child: Transform.scale(
                  scale: 0.88 + 0.12 * nodeT,
                  child: Opacity(
                    opacity: nodeT.clamp(0.0, 1.0),
                    child: _CenterNode(
                      radius: g.nodeR,
                      time: time,
                      pulse: pulse,
                      reduceMotion: reduceMotion,
                      revealWord: revealWord,
                      successFlash: successFlash,
                      failureDim: failureDim,
                      timeoutDim: timeoutDim,
                      navy: navy,
                      cyan: cyan,
                      cyanSoft: cyanSoft,
                      gold: gold,
                      cream: cream,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ClueCard extends StatelessWidget {
  const _ClueCard({
    required this.clue,
    required this.width,
    required this.height,
    required this.navy,
    required this.gold,
    required this.cyan,
    required this.cream,
    required this.time,
    required this.reduceMotion,
  });

  final _CommonWordClue clue;
  final double width;
  final double height;
  final Color navy;
  final Color gold;
  final Color cyan;
  final Color cream;
  final double time;
  final bool reduceMotion;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'clue ${clue.text}',
      child: SizedBox(
        width: width,
        height: height,
        child: CustomPaint(
          painter: _ClueCardPainter(
            hint: clue.visualHint,
            navy: navy,
            gold: gold,
            cyan: cyan,
            time: time,
            reduceMotion: reduceMotion,
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 16),
            child: Center(
              child: Text(
                clue.text,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: cream,
                  fontWeight: FontWeight.w900,
                  fontSize: 18,
                  height: 1.15,
                  shadows: <Shadow>[
                    Shadow(
                      color: Colors.black.withValues(alpha: 0.75),
                      blurRadius: 8,
                    ),
                    Shadow(
                      color: cyan.withValues(alpha: 0.35),
                      blurRadius: 10,
                    ),
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

class _ClueCardPainter extends CustomPainter {
  _ClueCardPainter({
    required this.hint,
    required this.navy,
    required this.gold,
    required this.cyan,
    required this.time,
    required this.reduceMotion,
  });

  final String? hint;
  final Color navy;
  final Color gold;
  final Color cyan;
  final double time;
  final bool reduceMotion;

  @override
  void paint(Canvas canvas, Size size) {
    final RRect rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(14),
    );

    // Soft outer neon bloom
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = cyan.withValues(alpha: 0.38)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = cyan.withValues(alpha: 0.18)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );

    // Body
    canvas.drawRRect(
      rrect,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(0, size.height),
          <Color>[
            const Color(0xFF16344C),
            navy,
            const Color(0xFF071018),
          ],
          <double>[0, 0.55, 1],
        ),
    );

    _paintAtmosphere(canvas, size);

    // Dual neon border
    canvas.drawRRect(
      rrect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..color = cyan.withValues(alpha: 0.95),
    );
    canvas.drawRRect(
      rrect.deflate(3.2),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.9
        ..color = gold.withValues(alpha: 0.4),
    );

    // Top sheen
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(3, 3, size.width - 6, size.height * 0.4),
        const Radius.circular(11),
      ),
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(0, size.height * 0.4),
          <Color>[
            Colors.white.withValues(alpha: 0.1),
            Colors.transparent,
          ],
        ),
    );

    // Bottom gold diamond
    _drawDiamond(
      canvas,
      Offset(size.width / 2, size.height - 9),
      3.6,
      gold.withValues(alpha: 0.95),
    );
  }

  void _paintAtmosphere(Canvas canvas, Size size) {
    final Rect clip = Offset.zero & size;
    canvas.save();
    canvas.clipRRect(
      RRect.fromRectAndRadius(clip, const Radius.circular(14)),
    );

    switch (hint) {
      case 'needle':
      case 'thread':
        _needleArt(canvas, size);
        break;
      case 'storm':
      case 'cloud':
        _stormArt(canvas, size);
        break;
      case 'water':
      case 'drop':
        _waterArt(canvas, size);
        break;
      default:
        _neutralArt(canvas, size);
    }
    canvas.restore();
  }

  void _needleArt(Canvas canvas, Size size) {
    final Offset eye = Offset(size.width * 0.78, size.height * 0.28);
    final Paint metal = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.1
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFF9EC8D8).withValues(alpha: 0.55);
    canvas.drawLine(
      Offset(size.width * 0.18, size.height * 0.78),
      Offset(eye.dx - 6, eye.dy + 8),
      metal,
    );
    canvas.drawOval(
      Rect.fromCenter(center: eye, width: 14, height: 20),
      metal
        ..color = cyan.withValues(alpha: 0.5)
        ..strokeWidth = 1.8,
    );
    final Path thread = Path()
      ..moveTo(eye.dx + 2, eye.dy + 4)
      ..cubicTo(
        size.width * 0.55,
        size.height * 0.55,
        size.width * 0.4,
        size.height * 0.2,
        size.width * 0.22,
        size.height * 0.42,
      );
    canvas.drawPath(
      thread,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = gold.withValues(alpha: 0.45),
    );
    canvas.drawCircle(
      Offset(size.width * 0.3, size.height * 0.65),
      22,
      Paint()
        ..color = cyan.withValues(alpha: 0.06)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
    );
  }

  void _stormArt(Canvas canvas, Size size) {
    final Paint cloud = Paint()
      ..color = const Color(0xFF7A93A8).withValues(alpha: 0.28)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5);
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(size.width * 0.55, size.height * 0.38),
        width: size.width * 0.7,
        height: size.height * 0.42,
      ),
      cloud,
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(size.width * 0.35, size.height * 0.45),
        width: size.width * 0.45,
        height: size.height * 0.32,
      ),
      cloud..color = const Color(0xFF5A7088).withValues(alpha: 0.22),
    );
    final double flicker =
        reduceMotion ? 0.7 : 0.55 + 0.45 * math.sin(time * 7.5);
    final Path bolt = Path()
      ..moveTo(size.width * 0.52, size.height * 0.42)
      ..lineTo(size.width * 0.46, size.height * 0.58)
      ..lineTo(size.width * 0.54, size.height * 0.58)
      ..lineTo(size.width * 0.44, size.height * 0.82);
    canvas.drawPath(
      bolt,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeJoin = StrokeJoin.round
        ..color = cyan.withValues(alpha: 0.55 * flicker)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2),
    );
    canvas.drawPath(
      bolt,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = Colors.white.withValues(alpha: 0.75 * flicker),
    );
  }

  void _waterArt(Canvas canvas, Size size) {
    final Offset c = Offset(size.width * 0.62, size.height * 0.52);
    for (int i = 0; i < 5; i++) {
      final double phase = reduceMotion ? 0 : time * 1.4;
      final double r = 8.0 + i * 9.0 + math.sin(phase + i) * 1.5;
      canvas.drawOval(
        Rect.fromCenter(
          center: c,
          width: r * 2.2,
          height: r * 0.85,
        ),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.3
          ..color = cyan.withValues(alpha: 0.28 - i * 0.04),
      );
    }
    final Path drop = Path()
      ..moveTo(c.dx - 18, c.dy - 10)
      ..quadraticBezierTo(c.dx - 8, c.dy, c.dx - 18, c.dy + 12)
      ..quadraticBezierTo(c.dx - 28, c.dy, c.dx - 18, c.dy - 10);
    canvas.drawPath(
      drop,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(c.dx - 18, c.dy - 12),
          Offset(c.dx - 18, c.dy + 12),
          <Color>[
            cyan.withValues(alpha: 0.45),
            cyan.withValues(alpha: 0.08),
          ],
        ),
    );
    canvas.drawCircle(
      c,
      28,
      Paint()
        ..color = const Color(0xFF1A6A88).withValues(alpha: 0.18)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12),
    );
  }

  void _neutralArt(Canvas canvas, Size size) {
    final Offset c = Offset(size.width * 0.7, size.height * 0.55);
    for (int i = 0; i < 5; i++) {
      canvas.drawCircle(
        c,
        6.0 + i * 7.0,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.9
          ..color = cyan.withValues(alpha: 0.1),
      );
    }
  }

  void _drawDiamond(Canvas canvas, Offset c, double s, Color color) {
    final Path p = Path()
      ..moveTo(c.dx, c.dy - s)
      ..lineTo(c.dx + s, c.dy)
      ..lineTo(c.dx, c.dy + s)
      ..lineTo(c.dx - s, c.dy)
      ..close();
    canvas.drawPath(p, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _ClueCardPainter oldDelegate) =>
      oldDelegate.hint != hint ||
      oldDelegate.time != time ||
      oldDelegate.reduceMotion != reduceMotion;
}

class _CenterNode extends StatelessWidget {
  const _CenterNode({
    required this.radius,
    required this.time,
    required this.pulse,
    required this.reduceMotion,
    required this.revealWord,
    required this.successFlash,
    required this.failureDim,
    required this.timeoutDim,
    required this.navy,
    required this.cyan,
    required this.cyanSoft,
    required this.gold,
    required this.cream,
  });

  final double radius;
  final double time;
  final double pulse;
  final bool reduceMotion;
  final String? revealWord;
  final double successFlash;
  final double failureDim;
  final double timeoutDim;
  final Color navy;
  final Color cyan;
  final Color cyanSoft;
  final Color gold;
  final Color cream;

  @override
  Widget build(BuildContext context) {
    final double breathe =
        reduceMotion ? 1.0 : 1.0 + 0.04 * math.sin(pulse * math.pi * 2);
    return Semantics(
      label: revealWord != null
          ? 'common word $revealWord'
          : 'unknown common word',
      child: Transform.scale(
        scale: breathe * (1 + successFlash * 0.08),
        child: SizedBox(
          width: radius * 2,
          height: radius * 2,
          child: CustomPaint(
            painter: _CenterNodePainter(
              time: time,
              pulse: pulse,
              reduceMotion: reduceMotion,
              successFlash: successFlash,
              failureDim: failureDim,
              timeoutDim: timeoutDim,
              navy: navy,
              cyan: cyan,
              cyanSoft: cyanSoft,
              gold: gold,
            ),
            child: Center(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 280),
                child: revealWord != null
                    ? Text(
                        key: ValueKey<String>(revealWord!),
                        revealWord!,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                          color: gold,
                          fontWeight: FontWeight.w900,
                          fontSize: 17,
                          shadows: <Shadow>[
                            Shadow(
                              color: cyan.withValues(alpha: 0.5),
                              blurRadius: 12,
                            ),
                          ],
                        ),
                      )
                    : Text(
                        key: const ValueKey<String>('q'),
                        '?',
                        style: Theme.of(context).textTheme.headlineLarge
                            ?.copyWith(
                          color: gold.withValues(
                            alpha: 1 - failureDim * 0.35,
                          ),
                          fontWeight: FontWeight.w900,
                          fontSize: 38,
                          shadows: <Shadow>[
                            Shadow(
                              color: gold.withValues(alpha: 0.65),
                              blurRadius: 16,
                            ),
                            Shadow(
                              color: cyan.withValues(alpha: 0.4),
                              blurRadius: 14,
                            ),
                          ],
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CenterNodePainter extends CustomPainter {
  _CenterNodePainter({
    required this.time,
    required this.pulse,
    required this.reduceMotion,
    required this.successFlash,
    required this.failureDim,
    required this.timeoutDim,
    required this.navy,
    required this.cyan,
    required this.cyanSoft,
    required this.gold,
  });

  final double time;
  final double pulse;
  final bool reduceMotion;
  final double successFlash;
  final double failureDim;
  final double timeoutDim;
  final Color navy;
  final Color cyan;
  final Color cyanSoft;
  final Color gold;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = Offset(size.width / 2, size.height / 2);
    final double r = size.width / 2 - 3;
    final double dim = (1 - timeoutDim * 0.55) * (1 - failureDim * 0.2);

    // Ambient bloom
    canvas.drawCircle(
      c,
      r + 14,
      Paint()
        ..color = cyan.withValues(alpha: (0.22 + 0.1 * pulse) * dim)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 16),
    );
    canvas.drawCircle(
      c,
      r + 6,
      Paint()
        ..color = gold.withValues(alpha: 0.12 * dim)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );

    canvas.drawCircle(
      c,
      r,
      Paint()
        ..shader = ui.Gradient.radial(c, r, <Color>[
          const Color(0xFF1E3A52),
          const Color(0xFF0C1C2C),
          navy,
        ], <double>[0, 0.55, 1]),
    );

    // Double gold rings
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..color = gold.withValues(alpha: 0.95 * dim),
    );
    canvas.drawCircle(
      c,
      r - 5,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = gold.withValues(alpha: 0.55 * dim),
    );
    canvas.drawCircle(
      c,
      r - 9,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = cyan.withValues(alpha: 0.28 * dim),
    );

    // Orbiting glow-light
    if (!reduceMotion && timeoutDim < 0.9) {
      final double angle = time * 1.65;
      const double sweep = 0.95;
      canvas.drawArc(
        Rect.fromCircle(center: c, radius: r + 1.5),
        angle,
        sweep,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 6
          ..strokeCap = StrokeCap.round
          ..shader = ui.Gradient.sweep(
            c,
            <Color>[
              Colors.transparent,
              cyanSoft.withValues(alpha: 0.05),
              cyanSoft.withValues(alpha: 0.95 * dim),
              cyan.withValues(alpha: 0.2),
              Colors.transparent,
            ],
            <double>[0.0, 0.32, 0.55, 0.78, 1.0],
            TileMode.clamp,
            angle,
            angle + sweep,
          )
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
      );
      final Offset head = Offset(
        c.dx + math.cos(angle + sweep * 0.58) * (r + 1.5),
        c.dy + math.sin(angle + sweep * 0.58) * (r + 1.5),
      );
      canvas.drawCircle(
        head,
        5.5,
        Paint()
          ..color = cyanSoft.withValues(alpha: 0.9 * dim)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      );
      canvas.drawCircle(head, 2.4, Paint()..color = Colors.white);
    } else {
      canvas.drawCircle(
        c,
        r + 1,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.2
          ..color = cyan.withValues(alpha: 0.4 * dim),
      );
    }

    if (successFlash > 0) {
      canvas.drawCircle(
        c,
        r + 6,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..color = cyanSoft.withValues(alpha: 0.6 * successFlash),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _CenterNodePainter oldDelegate) =>
      oldDelegate.time != time ||
      oldDelegate.pulse != pulse ||
      oldDelegate.successFlash != successFlash ||
      oldDelegate.timeoutDim != timeoutDim ||
      oldDelegate.failureDim != failureDim;
}

/// Energy beams + traveling feed points (clue edge → node rim).
class _EnergyConnectionsPainter extends CustomPainter {
  _EnergyConnectionsPainter({
    required this.geom,
    required this.lineProgress,
    required this.time,
    required this.pulse,
    required this.cyan,
    required this.cyanSoft,
    required this.gold,
    required this.dim,
    required this.reduceMotion,
  });

  final _LayoutGeom geom;
  final double lineProgress;
  final double time;
  final double pulse;
  final Color cyan;
  final Color cyanSoft;
  final Color gold;
  final double dim;
  final bool reduceMotion;

  @override
  void paint(Canvas canvas, Size size) {
    final List<Offset> sources = <Offset>[
      geom.topAnchor,
      geom.leftAnchor,
      geom.rightAnchor,
    ];
    for (int i = 0; i < sources.length; i++) {
      _drawFeed(canvas, sources[i], geom.center, geom.nodeR, phase: i * 0.33);
    }
  }

  void _drawFeed(
    Canvas canvas,
    Offset from,
    Offset hub,
    double nodeR, {
    required double phase,
  }) {
    final Offset dir = hub - from;
    final double len = dir.distance;
    if (len < 1) return;
    final Offset unit = dir / len;
    final Offset to = hub - unit * (nodeR + 2);
    final Offset end = Offset.lerp(from, to, lineProgress)!;

    // Soft bloom beam
    canvas.drawLine(
      from,
      end,
      Paint()
        ..color = cyan.withValues(alpha: 0.28 * dim)
        ..strokeWidth = 7
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    canvas.drawLine(
      from,
      end,
      Paint()
        ..shader = ui.Gradient.linear(from, end, <Color>[
          gold.withValues(alpha: 0.55 * dim),
          cyan.withValues(alpha: (0.85 + 0.15 * pulse) * dim),
          cyanSoft.withValues(alpha: 0.7 * dim),
        ], <double>[0, 0.45, 1])
        ..strokeWidth = 1.85
        ..strokeCap = StrokeCap.round,
    );

    // Junction ornaments
    _diamond(canvas, from, 3.4, gold.withValues(alpha: 0.9 * dim));
    _diamond(
      canvas,
      Offset.lerp(from, to, 0.1)!,
      2.4,
      cyan.withValues(alpha: 0.75 * dim),
    );

    if (lineProgress < 0.05) return;

    final int count = reduceMotion ? 1 : 4;
    for (int i = 0; i < count; i++) {
      final double speed = reduceMotion ? 0 : 0.48;
      final double t =
          ((time * speed + phase + i / count) % 1.0) * lineProgress;
      final Offset p = Offset.lerp(from, to, t)!;
      final double fade = (1 - (t - 0.72).clamp(0.0, 0.28) / 0.28);

      // Trail
      if (!reduceMotion && t > 0.04) {
        final Offset trail = Offset.lerp(from, to, (t - 0.06).clamp(0.0, 1.0))!;
        canvas.drawLine(
          trail,
          p,
          Paint()
            ..color = cyanSoft.withValues(alpha: 0.35 * dim * fade)
            ..strokeWidth = 2.2
            ..strokeCap = StrokeCap.round
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2),
        );
      }

      canvas.drawCircle(
        p,
        4.2,
        Paint()
          ..color = cyanSoft.withValues(alpha: 0.65 * dim * fade)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
      );
      canvas.drawCircle(
        p,
        2.0,
        Paint()..color = Colors.white.withValues(alpha: 0.98 * dim * fade),
      );
    }
  }

  void _diamond(Canvas canvas, Offset c, double s, Color color) {
    final Path p = Path()
      ..moveTo(c.dx, c.dy - s)
      ..lineTo(c.dx + s, c.dy)
      ..lineTo(c.dx, c.dy + s)
      ..lineTo(c.dx - s, c.dy)
      ..close();
    canvas.drawPath(p, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _EnergyConnectionsPainter oldDelegate) =>
      oldDelegate.lineProgress != lineProgress ||
      oldDelegate.time != time ||
      oldDelegate.pulse != pulse ||
      oldDelegate.dim != dim;
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

class _AnswerGrid extends StatelessWidget {
  const _AnswerGrid({
    required this.options,
    required this.optionText,
    required this.progress,
    required this.selectedKey,
    required this.pendingKey,
    required this.success,
    required this.failure,
    required this.timedOut,
    required this.resultT,
    required this.locked,
    required this.onSelect,
    required this.cyan,
    required this.gold,
    required this.navy,
    required this.cream,
    required this.time,
    required this.reduceMotion,
  });

  final List<String> options;
  final String Function(String key) optionText;
  final double progress;
  final String? selectedKey;
  final String? pendingKey;
  final bool success;
  final bool failure;
  final bool timedOut;
  final double resultT;
  final bool locked;
  final void Function(String key) onSelect;
  final Color cyan;
  final Color gold;
  final Color navy;
  final Color cream;
  final double time;
  final bool reduceMotion;

  @override
  Widget build(BuildContext context) {
    final int cross = options.length <= 3 ? options.length.clamp(1, 3) : 2;
    final double gridIn = Curves.easeOutCubic.transform(
      ((progress - 0.55) / 0.32).clamp(0.0, 1.0),
    );
    return Opacity(
      opacity: gridIn,
      child: Transform.translate(
        offset: Offset(0, (1 - gridIn) * 18),
        child: GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: options.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cross,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 2.35,
          ),
          itemBuilder: (BuildContext context, int index) {
            final String key = options[index];
            return _AnswerButton(
              label: optionText(key),
              selected: selectedKey == key,
              pending: pendingKey == key,
              correct: success && selectedKey == key,
              incorrect: failure && selectedKey == key,
              timedOut: timedOut,
              resultT: resultT,
              enabled: !locked,
              cyan: cyan,
              gold: gold,
              navy: navy,
              cream: cream,
              time: time,
              reduceMotion: reduceMotion,
              stagger: index * 0.17,
              onTap: () => onSelect(key),
            );
          },
        ),
      ),
    );
  }
}

class _AnswerButton extends StatefulWidget {
  const _AnswerButton({
    required this.label,
    required this.selected,
    required this.pending,
    required this.correct,
    required this.incorrect,
    required this.timedOut,
    required this.resultT,
    required this.enabled,
    required this.onTap,
    required this.cyan,
    required this.gold,
    required this.navy,
    required this.cream,
    required this.time,
    required this.reduceMotion,
    required this.stagger,
  });

  final String label;
  final bool selected;
  final bool pending;
  final bool correct;
  final bool incorrect;
  final bool timedOut;
  final double resultT;
  final bool enabled;
  final VoidCallback onTap;
  final Color cyan;
  final Color gold;
  final Color navy;
  final Color cream;
  final double time;
  final bool reduceMotion;
  final double stagger;

  @override
  State<_AnswerButton> createState() => _AnswerButtonState();
}

class _AnswerButtonState extends State<_AnswerButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final bool highlighted =
        (widget.selected || widget.pending) && !widget.incorrect;
    Color border = widget.cyan.withValues(alpha: 0.92);
    Color fillTop = const Color(0xFF143048);
    Color fillBottom = widget.navy;
    Color labelColor = widget.cream;
    double glow = 0.42;

    if (widget.correct) {
      border = Color.lerp(
        Colors.white,
        LhColors.success,
        widget.resultT.clamp(0.0, 1.0),
      )!;
      fillTop = Color.lerp(
        const Color(0xFF4DF0FF),
        const Color(0xFF7DFFC4),
        widget.resultT.clamp(0.0, 1.0),
      )!;
      fillBottom = Color.lerp(
        const Color(0xFF22E7F2),
        LhColors.success,
        widget.resultT.clamp(0.0, 1.0),
      )!;
      labelColor = const Color(0xFF04101C);
      glow = 0.95;
    } else if (widget.incorrect) {
      border = Color.lerp(
        widget.cyan,
        LhColors.warning,
        widget.resultT.clamp(0.0, 1.0),
      )!;
      fillTop = const Color(0xFF2A140C);
      fillBottom = const Color(0xFF1A0C08);
      glow = 0.55;
    } else if (highlighted) {
      border = widget.cyan;
      fillTop = const Color(0xFF4DF0FF);
      fillBottom = const Color(0xFF22E7F2);
      labelColor = const Color(0xFF04101C);
      glow = widget.pending ? 1.0 : 0.88;
    } else if (widget.timedOut) {
      border = widget.cyan.withValues(alpha: 0.28);
      glow = 0.12;
    } else {
      final double breath = widget.reduceMotion
          ? 0.55
          : 0.45 +
              0.55 *
                  (0.5 +
                      0.5 *
                          math.sin(
                            widget.time * 2.0 + widget.stagger * math.pi,
                          ));
      glow = 0.38 + 0.28 * breath;
    }

    final double shake = widget.incorrect
        ? math.sin(widget.resultT * math.pi * 6) * 3.5 * (1 - widget.resultT)
        : 0;
    final double dim = widget.timedOut && !widget.selected ? 0.55 : 1.0;

    String stateLabel = widget.label;
    if (widget.pending) stateLabel = '${widget.label}, pending';
    if (widget.correct) stateLabel = '${widget.label}, correct';
    if (widget.incorrect) stateLabel = '${widget.label}, incorrect';

    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: stateLabel,
      selected: widget.selected,
      child: Transform.translate(
        offset: Offset(shake, 0),
        child: GestureDetector(
          onTapDown:
              widget.enabled ? (_) => setState(() => _pressed = true) : null,
          onTapCancel: () => setState(() => _pressed = false),
          onTapUp: widget.enabled
              ? (_) {
                  setState(() => _pressed = false);
                  widget.onTap();
                }
              : null,
          child: AnimatedScale(
            scale: _pressed ? 0.96 : 1.0,
            duration: const Duration(milliseconds: 90),
            curve: Curves.easeOut,
            child: CustomPaint(
              painter: _AnswerButtonPainter(
                border: border,
                fillTop: fillTop,
                fillBottom: fillBottom,
                gold: widget.gold,
                glow: glow * (widget.timedOut && !widget.selected ? 0.45 : 1),
                dim: dim,
                diamondsBright: highlighted || widget.correct,
              ),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    widget.label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: labelColor.withValues(
                        alpha: widget.timedOut && !widget.selected ? 0.5 : 1,
                      ),
                      fontWeight: FontWeight.w900,
                      fontSize: 18,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AnswerButtonPainter extends CustomPainter {
  _AnswerButtonPainter({
    required this.border,
    required this.fillTop,
    required this.fillBottom,
    required this.gold,
    required this.glow,
    required this.dim,
    required this.diamondsBright,
  });

  final Color border;
  final Color fillTop;
  final Color fillBottom;
  final Color gold;
  final double glow;
  final double dim;
  final bool diamondsBright;

  @override
  void paint(Canvas canvas, Size size) {
    final RRect r = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(12),
    );
    canvas.drawRRect(
      r,
      Paint()
        ..color = border.withValues(alpha: 0.45 * glow * dim)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
    );
    canvas.drawRRect(
      r,
      Paint()
        ..color = border.withValues(alpha: 0.22 * glow * dim)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
    );
    canvas.drawRRect(
      r,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(0, size.height),
          <Color>[
            fillTop.withValues(alpha: dim),
            fillBottom.withValues(alpha: dim),
          ],
        ),
    );
    canvas.drawRRect(
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = diamondsBright ? 2.6 : 2.3
        ..color = border.withValues(alpha: dim),
    );
    canvas.drawRRect(
      r.deflate(3),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7
        ..color = border.withValues(alpha: 0.35 * dim),
    );

    final Color diamond =
        diamondsBright ? const Color(0xFF04101C) : gold;
    final double diamondA = diamondsBright ? 0.55 : 0.95;
    _diamond(canvas, Offset(6, size.height / 2), 3.0, diamond, dim * diamondA);
    _diamond(
      canvas,
      Offset(size.width - 6, size.height / 2),
      3.0,
      diamond,
      dim * diamondA,
    );
  }

  void _diamond(
    Canvas canvas,
    Offset c,
    double s,
    Color color,
    double dim,
  ) {
    final Path p = Path()
      ..moveTo(c.dx, c.dy - s)
      ..lineTo(c.dx + s, c.dy)
      ..lineTo(c.dx, c.dy + s)
      ..lineTo(c.dx - s, c.dy)
      ..close();
    canvas.drawPath(p, Paint()..color = color.withValues(alpha: dim));
  }

  @override
  bool shouldRepaint(covariant _AnswerButtonPainter oldDelegate) =>
      oldDelegate.border != border ||
      oldDelegate.fillTop != fillTop ||
      oldDelegate.fillBottom != fillBottom ||
      oldDelegate.glow != glow ||
      oldDelegate.dim != dim ||
      oldDelegate.diamondsBright != diamondsBright;
}

// ---------------------------------------------------------------------------
// Atmosphere — layered cityscape / water / lanterns / arch
// ---------------------------------------------------------------------------

class _AtmospherePainter extends CustomPainter {
  _AtmospherePainter({
    required this.progress,
    required this.pulse,
    required this.time,
    required this.dim,
    required this.reduceMotion,
  });

  final double progress;
  final double pulse;
  final double time;
  final double dim;
  final bool reduceMotion;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect rect = Offset.zero & size;
    final double p = progress.clamp(0.0, 1.0) * dim;

    // Deep night sky
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset.zero,
          Offset(0, size.height),
          <Color>[
            const Color(0xFF0A1A30).withValues(alpha: p),
            const Color(0xFF06101E).withValues(alpha: dim),
            const Color(0xFF02060C).withValues(alpha: dim),
          ],
          <double>[0, 0.48, 1],
        ),
    );

    // Stars
    final math.Random rng = math.Random(42);
    for (int i = 0; i < 48; i++) {
      final double x = rng.nextDouble() * size.width;
      final double y = rng.nextDouble() * size.height * 0.62;
      final double twinkle = reduceMotion
          ? 0.7
          : 0.45 + 0.55 * math.sin(time * (1.2 + i % 5) + i);
      canvas.drawCircle(
        Offset(x, y),
        0.6 + (i % 3) * 0.35,
        Paint()
          ..color = Colors.white.withValues(alpha: 0.18 * p * twinkle),
      );
    }

    // Soft cyan / gold haze
    final double drift = reduceMotion ? 0 : math.sin(time * 0.35) * 12;
    canvas.drawCircle(
      Offset(size.width * 0.3 + drift, size.height * 0.38),
      90,
      Paint()
        ..color = const Color(0xFF3DE8FF).withValues(alpha: 0.05 * p)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 36),
    );
    canvas.drawCircle(
      Offset(size.width * 0.75 - drift, size.height * 0.48),
      70,
      Paint()
        ..color = const Color(0xFFE0C15A).withValues(alpha: 0.04 * p)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 30),
    );

    // Double framing arch
    _drawArch(canvas, size, p, lift: 0.0, alpha: 0.16, width: 1.6);
    _drawArch(canvas, size, p, lift: 0.018, alpha: 0.08, width: 1.1);

    final double horizon = size.height * 0.76;

    // Far city layer (lighter silhouette)
    _drawSkyline(
      canvas,
      size,
      horizon: horizon + 6,
      heightScale: 0.72,
      color: const Color(0xFF0A1524).withValues(alpha: 0.55 * p),
      seed: 3,
    );
    // Near city layer
    _drawSkyline(
      canvas,
      size,
      horizon: horizon,
      heightScale: 1.0,
      color: const Color(0xFF02060D).withValues(alpha: 0.92 * p),
      seed: 7,
    );

    // Domes accents
    _dome(canvas, Offset(size.width * 0.22, horizon - 28), 18, p);
    _dome(canvas, Offset(size.width * 0.78, horizon - 34), 22, p);
    _dome(canvas, Offset(size.width * 0.5, horizon - 20), 14, p * 0.7);

    // Water
    canvas.drawRect(
      Rect.fromLTWH(0, horizon, size.width, size.height - horizon),
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, horizon),
          Offset(0, size.height),
          <Color>[
            const Color(0xFF0C2840).withValues(alpha: 0.7 * p),
            const Color(0xFF061520).withValues(alpha: 0.85 * p),
            const Color(0xFF02060C).withValues(alpha: 0.95 * dim),
          ],
          <double>[0, 0.4, 1],
        ),
    );

    // Vertical shimmer reflections
    for (int i = 0; i < 9; i++) {
      final double x = size.width * (0.12 + i * 0.09);
      final double wobble =
          reduceMotion ? 0 : math.sin(time * 1.8 + i * 0.7) * 3;
      canvas.drawLine(
        Offset(x + wobble, horizon + 4),
        Offset(x - wobble * 0.4, size.height - 8),
        Paint()
          ..strokeWidth = 1.4
          ..shader = ui.Gradient.linear(
            Offset(x, horizon),
            Offset(x, size.height),
            <Color>[
              const Color(0xFF3DE8FF).withValues(alpha: 0.14 * p),
              const Color(0xFFE0C15A).withValues(alpha: 0.06 * p),
              Colors.transparent,
            ],
            <double>[0, 0.35, 1],
          ),
      );
    }

    // Warm lanterns with hanging bodies
    _lantern(canvas, Offset(size.width * 0.12, horizon - 42), p, pulse);
    _lantern(canvas, Offset(size.width * 0.88, horizon - 36), p, pulse);
    _lantern(canvas, Offset(size.width * 0.32, horizon - 18), p * 0.7, pulse);

    // Vignette
    canvas.drawRect(
      rect,
      Paint()
        ..shader = ui.Gradient.radial(
          Offset(size.width / 2, size.height * 0.4),
          size.height * 0.82,
          <Color>[
            Colors.transparent,
            Colors.black.withValues(alpha: 0.62 * dim),
          ],
        ),
    );
  }

  void _drawArch(
    Canvas canvas,
    Size size,
    double p, {
    required double lift,
    required double alpha,
    required double width,
  }) {
    final Path arch = Path()
      ..moveTo(size.width * 0.02, size.height * (0.7 + lift))
      ..quadraticBezierTo(
        size.width * 0.5,
        size.height * (-0.06 - lift),
        size.width * 0.98,
        size.height * (0.7 + lift),
      );
    canvas.drawPath(
      arch,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = width + 4
        ..color = const Color(0xFF3DE8FF).withValues(alpha: alpha * 0.35 * p)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawPath(
      arch,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = width
        ..color = const Color(0xFF3DE8FF).withValues(alpha: alpha * p),
    );
  }

  void _drawSkyline(
    Canvas canvas,
    Size size, {
    required double horizon,
    required double heightScale,
    required Color color,
    required int seed,
  }) {
    final Path skyline = Path()..moveTo(0, horizon + 40);
    const int buildings = 22;
    for (int i = 0; i <= buildings; i++) {
      final double x = size.width * (i / buildings);
      final double n = math.sin(i * 1.37 + seed) * math.cos(i * 0.61 + seed);
      double h = (14 + 36 * n.abs()) * heightScale;
      if (i % 5 == 2) h += 18 * heightScale;
      skyline.lineTo(x, horizon - h);
      if (i % 4 == 1) {
        // Minaret
        skyline
          ..lineTo(x + 2, horizon - h - 16 * heightScale)
          ..lineTo(x + 5, horizon - h);
      }
    }
    skyline
      ..lineTo(size.width, horizon + 40)
      ..close();
    canvas.drawPath(skyline, Paint()..color = color);
  }

  void _dome(Canvas canvas, Offset c, double r, double p) {
    canvas.drawArc(
      Rect.fromCircle(center: c, radius: r),
      math.pi,
      math.pi,
      true,
      Paint()..color = const Color(0xFF010408).withValues(alpha: 0.75 * p),
    );
    canvas.drawLine(
      Offset(c.dx, c.dy - r),
      Offset(c.dx, c.dy - r - 8),
      Paint()
        ..strokeWidth = 1.2
        ..color = const Color(0xFFE0C15A).withValues(alpha: 0.25 * p),
    );
  }

  void _lantern(Canvas canvas, Offset c, double p, double pulse) {
    final double glow = 0.85 + 0.15 * pulse;
    canvas.drawCircle(
      c,
      22,
      Paint()
        ..color = const Color(0xFFFFB347).withValues(alpha: 0.16 * p * glow)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 16),
    );
    // Cap
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(c.dx, c.dy - 7), width: 10, height: 4),
        const Radius.circular(2),
      ),
      Paint()..color = const Color(0xFFD4AF37).withValues(alpha: 0.55 * p),
    );
    // Body
    final Path body = Path()
      ..moveTo(c.dx - 5, c.dy - 5)
      ..lineTo(c.dx + 5, c.dy - 5)
      ..lineTo(c.dx + 4, c.dy + 7)
      ..lineTo(c.dx - 4, c.dy + 7)
      ..close();
    canvas.drawPath(
      body,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(c.dx, c.dy - 5),
          Offset(c.dx, c.dy + 7),
          <Color>[
            const Color(0xFFFFE0A0).withValues(alpha: 0.7 * p * glow),
            const Color(0xFFFF8C2A).withValues(alpha: 0.45 * p),
          ],
        ),
    );
    // Hang line + tassel
    canvas.drawLine(
      Offset(c.dx, c.dy + 7),
      Offset(c.dx, c.dy + 18),
      Paint()
        ..strokeWidth = 1.1
        ..color = const Color(0xFFD4AF37).withValues(alpha: 0.4 * p),
    );
    canvas.drawCircle(
      Offset(c.dx, c.dy + 19),
      1.6,
      Paint()..color = const Color(0xFFFFC875).withValues(alpha: 0.55 * p),
    );
  }

  @override
  bool shouldRepaint(covariant _AtmospherePainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.pulse != pulse ||
      oldDelegate.time != time ||
      oldDelegate.dim != dim;
}
