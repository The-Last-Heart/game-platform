import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../content/content_asset_cache.dart';
import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../state/match_snapshot.dart';
import '../ui/widgets/challenge_countdown.dart';
import '../ui/widgets/challenge_sfx.dart';
import 'challenge_engine.dart';
import 'three_doors_asset_layout.dart';

const String kThreeDoorsRoomAsset = 'assets/backgrounds/three_doors_room.jpg';

class ThreeDoorsLogicEngine implements ChallengeEngine {
  @override
  String get engineId => 'logic.three_doors';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _ThreeDoorsWidget(challengeContext: challengeContext);
  }
}

class _ThreeDoorsWidget extends StatefulWidget {
  const _ThreeDoorsWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_ThreeDoorsWidget> createState() => _ThreeDoorsWidgetState();
}

class _ThreeDoorsWidgetState extends State<_ThreeDoorsWidget>
    with TickerProviderStateMixin {
  static const List<String> _doorIds = <String>['A', 'B', 'C'];

  late final AnimationController _ambient;
  late final AnimationController _entrance;
  late final AnimationController _resultPulse;
  ui.Image? _roomImage;
  String? _selectedDoorId;
  bool _submitted = false;
  bool _reconnect = false;
  bool _disposed = false;
  bool _reduceMotionCached = false;
  bool _ambientStarted = false;
  bool _loopStarted = false;
  bool _loopStopping = false;

  ChallengeContext get _ctx => widget.challengeContext;

  bool get _reduceMotion => _reduceMotionCached;

  Map<String, dynamic> get _cfg => _ctx.challenge.clientConfig;

  String get _backgroundSfxAssetId {
    final Object? raw = _cfg['backgroundSfxAssetId'];
    if (raw is String && raw.trim().isNotEmpty) return raw.trim();
    return ChallengeSfx.defaultThreeDoorsBackgroundAssetId;
  }

  List<({String id, String statement})> get _doors {
    final Object? raw = _cfg['doors'];
    if (raw is! List) {
      return _doorIds
          .map((String id) => (id: id, statement: ''))
          .toList(growable: false);
    }
    final List<({String id, String statement})> out =
        <({String id, String statement})>[];
    for (final Object? item in raw) {
      if (item is! Map) continue;
      final String id = item['id']?.toString() ?? '';
      final String statement = item['statement']?.toString() ?? '';
      if (id.isEmpty) continue;
      out.add((id: id, statement: statement));
    }
    if (out.length == 3) return out;
    return _doorIds
        .map((String id) => (id: id, statement: ''))
        .toList(growable: false);
  }

  @override
  void initState() {
    super.initState();
    _ambient = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
    );
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _resultPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _reconnect = _estimateElapsedMs() > 900;
    unawaited(_decodeRoomOnce());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_startBackgroundBed());
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotionCached = MediaQuery.disableAnimationsOf(context);
    if (_reconnect || _reduceMotionCached) {
      _entrance.value = 1;
    } else if (_entrance.status == AnimationStatus.dismissed) {
      _entrance.forward();
    }
    if (!_reduceMotionCached && !_ambientStarted) {
      _ambientStarted = true;
      unawaited(_ambient.repeat());
    }
  }

  Future<void> _startBackgroundBed() async {
    if (_disposed || _loopStarted || !mounted) return;
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

  Future<void> _decodeRoomOnce() async {
    final AssetImage provider = AssetImage(kThreeDoorsRoomAsset);
    final ImageStream stream = provider.resolve(ImageConfiguration.empty);
    final Completer<ui.Image> completer = Completer<ui.Image>();
    late final ImageStreamListener listener;
    listener = ImageStreamListener((ImageInfo info, bool _) {
      if (!completer.isCompleted) {
        completer.complete(info.image);
      }
      stream.removeListener(listener);
    }, onError: (Object error, StackTrace? stack) {
      if (!completer.isCompleted) {
        completer.completeError(error, stack);
      }
      stream.removeListener(listener);
    });
    stream.addListener(listener);
    try {
      final ui.Image image = await completer.future;
      if (_disposed) {
        image.dispose();
        return;
      }
      setState(() => _roomImage = image);
    } catch (_) {
      // Asset missing in tests — widget still lays out overlays.
    }
  }

  int _estimateElapsedMs() {
    final int now = _ctx.estimateServerNowMs();
    final int start = _ctx.challenge.startsAtMs;
    return math.max(0, now - start);
  }

  bool get _acceptingAnswers {
    if (_ctx.isInteractionLocked || _submitted) return false;
    if (_entrance.value < 0.98 && !_reconnect) return false;
    final int now = _ctx.estimateServerNowMs();
    return now >= _ctx.challenge.startsAtMs &&
        now <= _ctx.challenge.deadlineAtMs;
  }

  void _submit(String doorId) {
    if (!_acceptingAnswers) return;
    setState(() {
      _selectedDoorId = doorId;
      _submitted = true;
    });
    unawaited(HapticFeedback.selectionClick());
    _ctx.onSubmit(<String, dynamic>{'selectedDoorId': doorId});
  }

  @override
  void didUpdateWidget(covariant _ThreeDoorsWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    final AnswerSubmissionStatus prev = oldWidget.challengeContext.answerStatus;
    final AnswerSubmissionStatus next = _ctx.answerStatus;
    if (prev == AnswerSubmissionStatus.pending &&
        next == AnswerSubmissionStatus.rejected) {
      setState(() => _submitted = false);
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
        _resultPulse
          ..value = 0
          ..forward();
      }
    }
    if (_ctx.answerStatus == AnswerSubmissionStatus.confirmed ||
        _ctx.answerStatus == AnswerSubmissionStatus.pending) {
      _submitted = true;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_stopBackgroundBed());
    _ambient.dispose();
    _entrance.dispose();
    _resultPulse.dispose();
    _roomImage?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String title =
        (_cfg['titleText'] as String?)?.trim().isNotEmpty == true
        ? _cfg['titleText'] as String
        : resolver.resolve('challenge.three_doors.title');
    final String instruction =
        (_cfg['instructionText'] as String?)?.trim().isNotEmpty == true
        ? _cfg['instructionText'] as String
        : resolver.resolve(
            (_cfg['instructionKey'] as String?) ??
                'challenge.three_doors.instruction.exactly_one_true',
          );
    final List<({String id, String statement})> doors = _doors;
    final String? outcome = _ctx.localOutcome;
    final bool timedOut = outcome == 'timeout';
    final bool pending =
        _ctx.answerStatus == AnswerSubmissionStatus.pending ||
        (_submitted && outcome == null && !timedOut);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
        child: AnimatedBuilder(
          animation: Listenable.merge(<Listenable>[
            _ambient,
            _entrance,
            _resultPulse,
          ]),
          builder: (BuildContext context, Widget? _) {
            final double entrance = _entrance.value;
            final double ambient = _reduceMotion ? 0.35 : _ambient.value;
            return Column(
              children: <Widget>[
                Opacity(
                  opacity: 0.55 + 0.45 * Curves.easeOut.transform(entrance),
                  child: ChallengeCountdown(
                    challenge: _ctx.challenge,
                    estimateServerNowMs: _ctx.estimateServerNowMs,
                    ringColor: const Color(0xFFD4AF37),
                  ),
                ),
                const SizedBox(height: 6),
                Opacity(
                  opacity: Curves.easeOut.transform(
                    ((entrance - 0.45) / 0.25).clamp(0.0, 1.0),
                  ),
                  child: Text(
                    title,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: const Color(0xFFD4AF37),
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                      shadows: const <Shadow>[
                        Shadow(
                          color: Color(0x66000000),
                          blurRadius: 8,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Opacity(
                  opacity: Curves.easeOut.transform(
                    ((entrance - 0.55) / 0.25).clamp(0.0, 1.0),
                  ),
                  child: Semantics(
                    label: instruction,
                    child: Text(
                      instruction,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFFF0E6C8),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: LayoutBuilder(
                    builder: (BuildContext context, BoxConstraints constraints) {
                      final Size canvas = _fitCanvas(constraints.biggest);
                      final Offset origin = Offset(
                        (constraints.maxWidth - canvas.width) / 2,
                        (constraints.maxHeight - canvas.height) / 2,
                      );
                      return Stack(
                        children: <Widget>[
                          Positioned(
                            left: origin.dx,
                            top: origin.dy,
                            width: canvas.width,
                            height: canvas.height,
                            child: Opacity(
                              opacity: Curves.easeOut.transform(
                                (entrance / 0.25).clamp(0.0, 1.0),
                              ),
                              child: _roomImage == null
                                  ? Image.asset(
                                      kThreeDoorsRoomAsset,
                                      fit: BoxFit.contain,
                                      gaplessPlayback: true,
                                    )
                                  : RawImage(
                                      image: _roomImage,
                                      fit: BoxFit.fill,
                                      filterQuality: FilterQuality.medium,
                                    ),
                            ),
                          ),
                          Positioned(
                            left: origin.dx,
                            top: origin.dy,
                            width: canvas.width,
                            height: canvas.height,
                            child: RepaintBoundary(
                              child: CustomPaint(
                                painter: _ThreeDoorsFxPainter(
                                  ambient: ambient,
                                  entrance: entrance,
                                  reduceMotion: _reduceMotion,
                                  selectedDoorId: _selectedDoorId,
                                  pending: pending,
                                  outcome: outcome,
                                  timedOut: timedOut,
                                  resultT: _resultPulse.value,
                                  canvasSize: canvas,
                                ),
                              ),
                            ),
                          ),
                          for (int i = 0; i < doors.length; i++)
                            _overlayLabel(
                              door: doors[i],
                              canvas: canvas,
                              origin: origin,
                              entrance: entrance,
                              index: i,
                              pending: pending,
                              outcome: outcome,
                              timedOut: timedOut,
                            ),
                          for (int i = 0; i < doors.length; i++)
                            _overlayStatement(
                              door: doors[i],
                              canvas: canvas,
                              origin: origin,
                              entrance: entrance,
                              index: i,
                              timedOut: timedOut,
                            ),
                          for (final ({String id, String statement}) door
                              in doors)
                            _doorHitTarget(
                              doorId: door.id,
                              canvas: canvas,
                              origin: origin,
                            ),
                        ],
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                Transform.translate(
                  offset: Offset(
                    0,
                    _reduceMotion
                        ? 0
                        : (1 -
                                  Curves.easeOutCubic.transform(
                                    ((entrance - 0.7) / 0.3).clamp(0.0, 1.0),
                                  )) *
                              28,
                  ),
                  child: Opacity(
                    opacity: Curves.easeOut.transform(
                      ((entrance - 0.65) / 0.3).clamp(0.0, 1.0),
                    ),
                    child: Row(
                      children: <Widget>[
                        for (final String id in _doorIds)
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                              ),
                              child: _AnswerButton(
                                doorId: id,
                                selected: _selectedDoorId == id,
                                pending: pending && _selectedDoorId == id,
                                correct:
                                    outcome == 'success' &&
                                    _selectedDoorId == id,
                                incorrect:
                                    (outcome == 'failure' ||
                                        outcome == 'wrong') &&
                                    _selectedDoorId == id,
                                disabled: !_acceptingAnswers || timedOut,
                                ambient: ambient,
                                onPressed: () => _submit(id),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Size _fitCanvas(Size max) {
    final Size intrinsic = ThreeDoorsAssetLayout.intrinsicSize;
    final double scale = math.min(
      max.width / intrinsic.width,
      max.height / intrinsic.height,
    );
    return Size(intrinsic.width * scale, intrinsic.height * scale);
  }

  Widget _overlayLabel({
    required ({String id, String statement}) door,
    required Size canvas,
    required Offset origin,
    required double entrance,
    required int index,
    required bool pending,
    required String? outcome,
    required bool timedOut,
  }) {
    final Rect rect = ThreeDoorsAssetLayout.mapRect(
      design: ThreeDoorsAssetLayout.medallionFor(door.id),
      displayedSize: canvas,
      displayedOrigin: origin,
    );
    final double fade = Curves.easeOut.transform(
      ((entrance - 0.2 - index * 0.05) / 0.2).clamp(0.0, 1.0),
    );
    final bool selected = _selectedDoorId == door.id;
    return Positioned(
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      child: Opacity(
        opacity: fade * (timedOut ? 0.55 : 1),
        child: Semantics(
          label: 'Door ${door.id}',
          button: true,
          selected: selected,
          child: Center(
            child: Text(
              door.id,
              textDirection: TextDirection.ltr,
              style: TextStyle(
                color: selected
                    ? const Color(0xFF50E3FE)
                    : const Color(0xFFD4AF37),
                fontWeight: FontWeight.w800,
                fontSize: rect.height * 0.48,
                shadows: const <Shadow>[
                  Shadow(color: Color(0xAA000000), blurRadius: 4),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _overlayStatement({
    required ({String id, String statement}) door,
    required Size canvas,
    required Offset origin,
    required double entrance,
    required int index,
    required bool timedOut,
  }) {
    final Rect rect = ThreeDoorsAssetLayout.mapRect(
      design: ThreeDoorsAssetLayout.statementFor(door.id),
      displayedSize: canvas,
      displayedOrigin: origin,
    );
    final double fade = Curves.easeOut.transform(
      ((entrance - 0.28 - index * 0.06) / 0.22).clamp(0.0, 1.0),
    );
    return Positioned(
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      child: Opacity(
        opacity: fade * (timedOut ? 0.5 : 1),
        child: Semantics(
          label: 'Door ${door.id}: ${door.statement}',
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: rect.width * 0.92,
                maxHeight: rect.height * 0.92,
              ),
              child: Text(
                door.statement,
                textAlign: TextAlign.center,
                textDirection: TextDirection.rtl,
                maxLines: 3,
                style: TextStyle(
                  color: const Color(0xFFF7FAFC),
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  height: 1.2,
                  shadows: const <Shadow>[
                    Shadow(color: Color(0xCC000000), blurRadius: 3),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _doorHitTarget({
    required String doorId,
    required Size canvas,
    required Offset origin,
  }) {
    final Rect rect = ThreeDoorsAssetLayout.mapRect(
      design: ThreeDoorsAssetLayout.doorBoundsFor(doorId),
      displayedSize: canvas,
      displayedOrigin: origin,
    );
    return Positioned(
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _acceptingAnswers ? () => _submit(doorId) : null,
      ),
    );
  }
}

class _AnswerButton extends StatefulWidget {
  const _AnswerButton({
    required this.doorId,
    required this.selected,
    required this.pending,
    required this.correct,
    required this.incorrect,
    required this.disabled,
    required this.ambient,
    required this.onPressed,
  });

  final String doorId;
  final bool selected;
  final bool pending;
  final bool correct;
  final bool incorrect;
  final bool disabled;
  final double ambient;
  final VoidCallback onPressed;

  @override
  State<_AnswerButton> createState() => _AnswerButtonState();
}

class _AnswerButtonState extends State<_AnswerButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    Color border = const Color(0xFFD4AF37);
    if (widget.correct) border = const Color(0xFF50E3FE);
    if (widget.incorrect) border = const Color(0xFFE85D4C);
    final double glow = widget.selected || widget.pending
        ? 0.45 + 0.25 * math.sin(widget.ambient * math.pi * 2)
        : 0.15;

    return Semantics(
      button: true,
      enabled: !widget.disabled,
      selected: widget.selected,
      label: 'Answer ${widget.doorId}',
      child: GestureDetector(
        onTapDown: widget.disabled
            ? null
            : (_) => setState(() => _pressed = true),
        onTapUp: widget.disabled
            ? null
            : (_) {
                setState(() => _pressed = false);
                widget.onPressed();
              },
        onTapCancel: () => setState(() => _pressed = false),
        child: AnimatedScale(
          scale: _pressed ? 0.94 : 1,
          duration: const Duration(milliseconds: 90),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: border.withValues(alpha: 0.9), width: 1.6),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: <Color>[
                  const Color(0xFF0A1A2E).withValues(alpha: 0.92),
                  const Color(0xFF050C18).withValues(alpha: 0.95),
                ],
              ),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: border.withValues(alpha: glow),
                  blurRadius: 10,
                  spreadRadius: 0.5,
                ),
              ],
            ),
            child: Text(
              widget.doorId,
              textDirection: TextDirection.ltr,
              style: TextStyle(
                color: border,
                fontWeight: FontWeight.w800,
                fontSize: 22,
                letterSpacing: 1.2,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ThreeDoorsFxPainter extends CustomPainter {
  _ThreeDoorsFxPainter({
    required this.ambient,
    required this.entrance,
    required this.reduceMotion,
    required this.selectedDoorId,
    required this.pending,
    required this.outcome,
    required this.timedOut,
    required this.resultT,
    required this.canvasSize,
  });

  final double ambient;
  final double entrance;
  final bool reduceMotion;
  final String? selectedDoorId;
  final bool pending;
  final String? outcome;
  final bool timedOut;
  final double resultT;
  final Size canvasSize;

  @override
  void paint(Canvas canvas, Size size) {
    final double sx = size.width / ThreeDoorsAssetLayout.intrinsicSize.width;
    final double sy = size.height / ThreeDoorsAssetLayout.intrinsicSize.height;
    final double seamProgress = reduceMotion
        ? 1
        : Curves.easeOutCubic.transform(
            ((entrance - 0.05) / 0.35).clamp(0.0, 1.0),
          );
    final double breath = reduceMotion
        ? 0.7
        : 0.55 + 0.45 * (0.5 + 0.5 * math.sin(ambient * math.pi * 2));

    for (int i = 0; i < ThreeDoorsAssetLayout.doorSeams.length; i++) {
      final (double x, double top, double bottom) =
          ThreeDoorsAssetLayout.doorSeams[i];
      final String doorId = const <String>['A', 'B', 'C'][i];
      final bool selected = selectedDoorId == doorId;
      final bool success =
          outcome == 'success' && selected;
      final bool failure =
          (outcome == 'failure' || outcome == 'wrong') && selected;
      Color color = const Color(0xFF50E3FE);
      if (failure) color = const Color(0xFFE85D4C);
      if (timedOut) color = color.withValues(alpha: 0.25);
      final double litBottom = ui.lerpDouble(bottom, top, seamProgress)!;
      final Paint paint = Paint()
        ..shader = ui.Gradient.linear(
          Offset(x * sx, bottom * sy),
          Offset(x * sx, litBottom * sy),
          <Color>[
            color.withValues(alpha: 0.05),
            color.withValues(alpha: 0.55 * breath * (selected ? 1.2 : 1)),
            color.withValues(alpha: 0.05),
          ],
          const <double>[0, 0.55, 1],
        )
        ..strokeWidth = (selected ? 3.2 : 2.2) * sx
        ..style = PaintingStyle.stroke
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);
      canvas.drawLine(
        Offset(x * sx, bottom * sy),
        Offset(x * sx, litBottom * sy),
        paint,
      );

      if (selected && !timedOut) {
        final Rect door = ThreeDoorsAssetLayout.mapRect(
          design: ThreeDoorsAssetLayout.doorBoundsFor(doorId),
          displayedSize: size,
          displayedOrigin: Offset.zero,
        );
        final Paint halo = Paint()
          ..color = color.withValues(
            alpha: pending ? 0.18 + 0.1 * breath : 0.14,
          )
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18);
        canvas.drawRRect(
          RRect.fromRectAndRadius(door.inflate(6), const Radius.circular(18)),
          halo,
        );
        if (success && resultT > 0) {
          final Paint burst = Paint()
            ..color = const Color(0xFF50E3FE).withValues(alpha: 0.22 * (1 - resultT))
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              door.inflate(8 + 24 * resultT),
              const Radius.circular(22),
            ),
            burst,
          );
        }
      }
    }

    if (timedOut) {
      final Paint dim = Paint()..color = const Color(0x66000000);
      canvas.drawRect(Offset.zero & size, dim);
    }
  }

  @override
  bool shouldRepaint(covariant _ThreeDoorsFxPainter oldDelegate) {
    return oldDelegate.ambient != ambient ||
        oldDelegate.entrance != entrance ||
        oldDelegate.selectedDoorId != selectedDoorId ||
        oldDelegate.pending != pending ||
        oldDelegate.outcome != outcome ||
        oldDelegate.timedOut != timedOut ||
        oldDelegate.resultT != resultT ||
        oldDelegate.reduceMotion != reduceMotion;
  }
}
