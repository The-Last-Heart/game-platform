import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../content/content_asset_cache.dart';
import '../ui/widgets/challenge_countdown.dart';
import '../ui/widgets/challenge_sfx.dart';
import 'challenge_engine.dart';
import 'neon_cable_rive_spark.dart' deferred as rive_spark;

class PrecisionNeonCableEngine implements ChallengeEngine {
  @override
  String get engineId => 'precision.neon_cable';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _NeonCableWidget(challengeContext: challengeContext);
  }
}

class _NeonCableWidget extends StatefulWidget {
  const _NeonCableWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_NeonCableWidget> createState() => _NeonCableWidgetState();
}

class _NeonCableWidgetState extends State<_NeonCableWidget>
    with TickerProviderStateMixin {
  bool _submitted = false;
  bool _dragging = false;
  /// True once the plug has snapped into any socket (correct or wrong).
  /// Blocks further drag until submit, or until a retry reset clears it.
  bool _plugged = false;
  bool _loading = true;
  String? _sparkKind; // cyan | red
  Offset? _plugCenter;
  late final AnimationController _glowPulse;
  late final AnimationController _sparkAnim;
  final Map<String, ui.Image> _images = <String, ui.Image>{};

  Object? _sparkRiveFile;
  Object? _sparkController;
  bool _useRiveSparks = false;
  bool _riveLibraryLoaded = false;

  Map<String, dynamic> get _cfg =>
      widget.challengeContext.challenge.clientConfig;

  Map<String, dynamic> get _assetIds {
    final Object? raw = _cfg['assetIds'];
    if (raw is Map) {
      return raw.map(
        (Object? k, Object? v) => MapEntry(k.toString(), v),
      );
    }
    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> get _sockets {
    final Object? raw = _cfg['sockets'];
    if (raw is! List) return const <Map<String, dynamic>>[];
    return raw
        .whereType<Map<dynamic, dynamic>>()
        .map(
          (Map<dynamic, dynamic> e) => e.map(
            (dynamic k, dynamic v) => MapEntry(k.toString(), v),
          ),
        )
        .toList(growable: false);
  }

  String get _correctSocketId =>
      (_cfg['correctSocketId'] as String?) ?? '';

  String get _wrongDropPolicy =>
      (_cfg['wrongDropPolicy'] as String?) ?? 'fail_final';

  double get _snapRadiusNorm =>
      ((_cfg['snapRadiusNorm'] as num?)?.toDouble() ?? 0.09);

  Offset get _plugStartNorm => Offset(
        ((_cfg['plugStartXNorm'] as num?)?.toDouble() ?? 0.28),
        ((_cfg['plugStartYNorm'] as num?)?.toDouble() ?? 0.50),
      );

  Offset get _cableAnchorNorm => Offset(
        ((_cfg['cableAnchorXNorm'] as num?)?.toDouble() ?? 0.08),
        ((_cfg['cableAnchorYNorm'] as num?)?.toDouble() ?? 0.50),
      );

  Offset get _plugCableAnchorNorm {
    final Object? raw = _cfg['plugCableAnchorNorm'];
    if (raw is List && raw.length >= 2) {
      return Offset(
        (raw[0] as num).toDouble(),
        (raw[1] as num).toDouble(),
      );
    }
    return const Offset(0.105, 0.5);
  }

  Offset get _plugTipAnchorNorm {
    final Object? raw = _cfg['plugTipAnchorNorm'];
    if (raw is List && raw.length >= 2) {
      return Offset(
        (raw[0] as num).toDouble(),
        (raw[1] as num).toDouble(),
      );
    }
    return const Offset(0.895, 0.5);
  }

  String get _sparkRiveAssetId {
    final String? configured = _assetIds['sparkRive']?.toString();
    if (configured != null && configured.isNotEmpty) return configured;
    return 'neon_cable.cable_spark';
  }

  String get _sparkSfxAssetId {
    final String? configured = _assetIds['sparkSfx']?.toString();
    if (configured != null && configured.isNotEmpty) return configured;
    return ChallengeSfx.defaultNeonCableSparkAssetId;
  }

  @override
  void initState() {
    super.initState();
    _glowPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 850),
    )..repeat(reverse: true);
    _sparkAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    );
    _plugCenter = _plugStartNorm;
    unawaited(_loadAssets());
  }

  @override
  void dispose() {
    _glowPulse.dispose();
    _sparkAnim.dispose();
    if (_riveLibraryLoaded) {
      rive_spark.disposeCableSparkController(_sparkController);
      rive_spark.disposeCableSparkFile(_sparkRiveFile);
    }
    super.dispose();
  }

  Future<void> _loadAssets() async {
    final List<String> ids = <String>[
      _assetIds['panel']?.toString() ?? '',
      _assetIds['socketHousing']?.toString() ?? '',
      _assetIds['socketRingCyan']?.toString() ?? '',
      _assetIds['socketRingRed']?.toString() ?? '',
      _assetIds['socketGlowCyan']?.toString() ?? '',
      _assetIds['socketGlowRed']?.toString() ?? '',
      _assetIds['plugBody']?.toString() ?? '',
      _assetIds['plugGlow']?.toString() ?? '',
      _assetIds['plugShadow']?.toString() ?? '',
      _assetIds['snapSparksCyan']?.toString() ?? '',
      _assetIds['snapSparksRed']?.toString() ?? '',
    ].where((String id) => id.isNotEmpty).toList(growable: false);

    for (final String id in ids) {
      final File? file = await ContentAssetCache.instance.localFile(id);
      if (file == null || !await file.exists()) continue;
      final Uint8List bytes = await file.readAsBytes();
      final ui.Codec codec = await ui.instantiateImageCodec(bytes);
      final ui.FrameInfo frame = await codec.getNextFrame();
      _images[id] = frame.image;
    }

    try {
      final File? rivPath =
          await ContentAssetCache.instance.localFile(_sparkRiveAssetId);
      if (rivPath != null && await rivPath.exists()) {
        if (!_riveLibraryLoaded) {
          await rive_spark.loadLibrary();
          _riveLibraryLoaded = true;
        }
        final Uint8List bytes = await rivPath.readAsBytes();
        final Object? decoded =
            await rive_spark.decodeCableSparkRive(bytes);
        if (decoded != null) {
          _sparkRiveFile = decoded;
          _useRiveSparks = true;
        }
      }
    } catch (error, stack) {
      debugPrint('Neon cable Rive spark load failed: $error\n$stack');
      _useRiveSparks = false;
    }

    if (!mounted) return;
    setState(() => _loading = false);
  }

  void _setSparkKind(String? kind) {
    if (_riveLibraryLoaded) {
      rive_spark.disposeCableSparkController(_sparkController);
    }
    _sparkController = null;
    _sparkKind = kind;
    final Object? file = _sparkRiveFile;
    if (kind == null || !_useRiveSparks || file == null || !_riveLibraryLoaded) {
      return;
    }
    try {
      _sparkController = rive_spark.createCableSparkController(
        file,
        kind: kind,
      );
    } catch (error, stack) {
      debugPrint('Neon cable Rive controller failed: $error\n$stack');
      _sparkController = null;
    }
  }

  void _submit({required String? socketId, required bool snapped}) {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    setState(() => _submitted = true);
    widget.challengeContext.onSubmit(<String, dynamic>{
      'socketId': socketId,
      'snapped': snapped,
    });
  }

  void _onPanStart(DragStartDetails details, Size panelSize) {
    if (_submitted ||
        _plugged ||
        widget.challengeContext.isInteractionLocked ||
        _loading) {
      return;
    }
    setState(() => _dragging = true);
  }

  void _onPanUpdate(DragUpdateDetails details, Size panelSize) {
    if (!_dragging || _submitted || _plugged) return;
    final Offset current = _plugCenter ?? _plugStartNorm;
    final Offset delta = Offset(
      details.delta.dx / panelSize.width,
      details.delta.dy / panelSize.height,
    );
    setState(() {
      _plugCenter = Offset(
        (current.dx + delta.dx).clamp(0.05, 0.95),
        (current.dy + delta.dy).clamp(0.08, 0.92),
      );
    });
  }

  Future<void> _onPanEnd(Size panelSize) async {
    if (!_dragging || _submitted || _plugged) return;
    setState(() => _dragging = false);
    final Offset plug = _plugCenter ?? _plugStartNorm;
    final Offset tipNorm = Offset(
      plug.dx + (_plugTipAnchorNorm.dx - 0.5) * 0.42,
      plug.dy + (_plugTipAnchorNorm.dy - 0.5) * 0.22,
    );
    final double radius = _snapRadiusNorm;
    Map<String, dynamic>? hit;
    double best = double.infinity;
    for (final Map<String, dynamic> socket in _sockets) {
      final double x = (socket['xNorm'] as num?)?.toDouble() ?? 0.5;
      final double y = (socket['yNorm'] as num?)?.toDouble() ?? 0.5;
      final double dist = (Offset(x, y) - tipNorm).distance;
      if (dist <= radius && dist < best) {
        best = dist;
        hit = socket;
      }
    }
    if (hit == null) {
      return;
    }
    final String socketId = hit['socketId']?.toString() ?? '';
    final bool correct = socketId == _correctSocketId;
    final String kind = correct ? 'cyan' : 'red';
    _setSparkKind(kind);
    // Lock immediately on any socket snap so the plug cannot be dragged
    // again during the spark hold / submit delay.
    setState(() {
      _plugged = true;
      _plugCenter = Offset(
        (hit!['xNorm'] as num).toDouble(),
        (hit['yNorm'] as num).toDouble(),
      );
    });
    if (!_useRiveSparks || _sparkController == null) {
      unawaited(_sparkAnim.forward(from: 0));
    }
    try {
      await HapticFeedback.mediumImpact();
    } catch (_) {}
    unawaited(ChallengeSfx.instance.play(_sparkSfxAssetId));

    final bool rivePlaying = _useRiveSparks && _sparkController != null;
    final int sparkHoldMs = rivePlaying ? 700 : 220;
    if (correct) {
      await Future<void>.delayed(Duration(milliseconds: sparkHoldMs));
      _submit(socketId: socketId, snapped: true);
      return;
    }

    if (_wrongDropPolicy == 'reset_allow_retry') {
      await Future<void>.delayed(
        Duration(milliseconds: rivePlaying ? 750 : 320),
      );
      if (!mounted || _submitted) return;
      _setSparkKind(null);
      setState(() {
        _plugged = false;
        _plugCenter = _plugStartNorm;
      });
      return;
    }

    await Future<void>.delayed(
      Duration(milliseconds: rivePlaying ? 750 : 320),
    );
    _submit(socketId: socketId, snapped: true);
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (_cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;
    final String footerKey = (_cfg['footerKey'] as String?) ?? '';

    // ChallengePlayView overlays the match header (hearts/energy/round) on a
    // full-bleed engine. Keep the countdown below that chrome, and center the
    // prompt + panel on the full play surface (not only under the ring).
    const double headerClearance = 48;
    const double countdownSize = 120;
    const double promptBlock = 88;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else
            LayoutBuilder(
              builder: (BuildContext context, BoxConstraints c) {
                // When the prompt+panel group is vertically centered, its top
                // edge is at (H - groupH) / 2. Cap groupH so that edge stays
                // below the countdown ring on short screens.
                const double topReserve = headerClearance + countdownSize + 12;
                final double maxGroupH = math.max(
                  120.0 + promptBlock,
                  c.maxHeight - 2 * topReserve,
                );
                final double side = math
                    .min(
                      c.maxWidth,
                      math.min(c.maxHeight - promptBlock, maxGroupH - promptBlock),
                    )
                    .clamp(120.0, c.maxWidth);
                final Size panelSize = Size(side, side);
                final Offset plug = _plugCenter ?? _plugStartNorm;
                final double sparkSize = side * 0.42;
                return Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text(
                        resolver.resolve(promptKey),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      if (footerKey.isNotEmpty) ...<Widget>[
                        const SizedBox(height: 4),
                        Text(
                          resolver.resolve(footerKey),
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: LhColors.textMuted),
                        ),
                      ],
                      const SizedBox(height: 10),
                      SizedBox(
                        width: side,
                        height: side,
                        child: GestureDetector(
                          onPanStart: (DragStartDetails d) =>
                              _onPanStart(d, panelSize),
                          onPanUpdate: (DragUpdateDetails d) =>
                              _onPanUpdate(d, panelSize),
                          onPanEnd: (_) => unawaited(_onPanEnd(panelSize)),
                          child: AnimatedBuilder(
                            animation: Listenable.merge(
                              <Listenable>[_glowPulse, _sparkAnim],
                            ),
                            builder: (BuildContext context, Widget? child) {
                              return Stack(
                                clipBehavior: Clip.none,
                                children: <Widget>[
                                  CustomPaint(
                                    size: panelSize,
                                    painter: _NeonCablePainter(
                                      images: _images,
                                      assetIds: _assetIds,
                                      sockets: _sockets,
                                      plugCenter: plug,
                                      cableAnchor: _cableAnchorNorm,
                                      plugCableAnchorNorm:
                                          _plugCableAnchorNorm,
                                      glowT: _glowPulse.value,
                                      sparkKind: (_useRiveSparks &&
                                              _sparkController != null)
                                          ? null
                                          : _sparkKind,
                                      sparkT: _sparkAnim.value,
                                    ),
                                  ),
                                  if (_useRiveSparks &&
                                      _sparkKind != null &&
                                      _sparkController != null)
                                    Positioned(
                                      left: plug.dx * side - sparkSize / 2,
                                      top: plug.dy * side - sparkSize / 2,
                                      width: sparkSize,
                                      height: sparkSize,
                                      child: IgnorePointer(
                                        child: _ScreenBlend(
                                          child: rive_spark
                                              .buildCableSparkView(
                                            _sparkController!,
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              );
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: const EdgeInsets.only(top: headerClearance),
              child: ChallengeCountdown(
                challenge: widget.challengeContext.challenge,
                estimateServerNowMs:
                    widget.challengeContext.estimateServerNowMs,
                size: countdownSize,
                ringColor: LhColors.success,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Composites [child] with [BlendMode.screen] so near-black artboard fills
/// (common in Rive exports) disappear over the neon panel.
class _ScreenBlend extends SingleChildRenderObjectWidget {
  const _ScreenBlend({required Widget child}) : super(child: child);

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderScreenBlend();
}

class _RenderScreenBlend extends RenderProxyBox {
  @override
  void paint(PaintingContext context, Offset offset) {
    context.canvas.saveLayer(
      offset & size,
      Paint()..blendMode = BlendMode.screen,
    );
    super.paint(context, offset);
    context.canvas.restore();
  }
}

class _NeonCablePainter extends CustomPainter {
  _NeonCablePainter({
    required this.images,
    required this.assetIds,
    required this.sockets,
    required this.plugCenter,
    required this.cableAnchor,
    required this.plugCableAnchorNorm,
    required this.glowT,
    required this.sparkKind,
    required this.sparkT,
  });

  final Map<String, ui.Image> images;
  final Map<String, dynamic> assetIds;
  final List<Map<String, dynamic>> sockets;
  final Offset plugCenter;
  final Offset cableAnchor;
  final Offset plugCableAnchorNorm;
  final double glowT;
  final String? sparkKind;
  final double sparkT;

  ui.Image? _img(String key) {
    final String? id = assetIds[key]?.toString();
    if (id == null) return null;
    return images[id];
  }

  void _paintImage(
    Canvas canvas,
    ui.Image? image,
    Rect dest, {
    double opacity = 1,
  }) {
    if (image == null) return;
    final Paint paint = Paint()
      ..color = Color.fromRGBO(255, 255, 255, opacity.clamp(0, 1));
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      dest,
      paint,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    final Rect panel = Offset.zero & size;
    _paintImage(canvas, _img('panel'), panel);

    final double socketSize = size.shortestSide * 0.28;
    for (final Map<String, dynamic> socket in sockets) {
      final double x = (socket['xNorm'] as num?)?.toDouble() ?? 0.5;
      final double y = (socket['yNorm'] as num?)?.toDouble() ?? 0.5;
      final String color = socket['color']?.toString() ?? 'cyan';
      final Offset center = Offset(x * size.width, y * size.height);
      final Rect dest = Rect.fromCenter(
        center: center,
        width: socketSize,
        height: socketSize,
      );
      _paintImage(canvas, _img('socketHousing'), dest);
      final double glowOpacity = 0.35 + glowT * 0.6;
      final double glowScale = 0.96 + glowT * 0.08;
      final Rect glowDest = Rect.fromCenter(
        center: center,
        width: socketSize * glowScale,
        height: socketSize * glowScale,
      );
      _paintImage(
        canvas,
        color == 'red' ? _img('socketGlowRed') : _img('socketGlowCyan'),
        glowDest,
        opacity: glowOpacity,
      );
      _paintImage(
        canvas,
        color == 'red' ? _img('socketRingRed') : _img('socketRingCyan'),
        dest,
      );
    }

    final Offset cableStart = Offset(
      cableAnchor.dx * size.width,
      cableAnchor.dy * size.height,
    );
    final double plugW = size.shortestSide * 0.42;
    final double plugH = size.shortestSide * 0.28;
    final Offset plugPos = Offset(
      plugCenter.dx * size.width,
      plugCenter.dy * size.height,
    );
    final Rect plugDest = Rect.fromCenter(
      center: plugPos,
      width: plugW,
      height: plugH,
    );
    final Offset cableEnd = Offset(
      plugDest.left + plugW * plugCableAnchorNorm.dx,
      plugDest.top + plugH * plugCableAnchorNorm.dy,
    );

    final Path cable = Path()
      ..moveTo(cableStart.dx, cableStart.dy)
      ..cubicTo(
        cableStart.dx + (cableEnd.dx - cableStart.dx) * 0.35,
        cableStart.dy - size.height * 0.08,
        cableStart.dx + (cableEnd.dx - cableStart.dx) * 0.7,
        cableEnd.dy + size.height * 0.06,
        cableEnd.dx,
        cableEnd.dy,
      );
    canvas.drawPath(
      cable,
      Paint()
        ..color = const Color(0x6622E7F2)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    canvas.drawPath(
      cable,
      Paint()
        ..color = const Color(0xFF22E7F2)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4.5
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawPath(
      cable,
      Paint()
        ..color = const Color(0xCCE8FFFF)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round,
    );

    _paintImage(canvas, _img('plugShadow'), plugDest.shift(const Offset(4, 8)), opacity: 0.85);
    _paintImage(canvas, _img('plugGlow'), plugDest, opacity: 0.55 + glowT * 0.35);
    _paintImage(canvas, _img('plugBody'), plugDest);

    if (sparkKind != null && sparkT > 0) {
      final double sparkSize = size.shortestSide * (0.22 + sparkT * 0.18);
      final Rect sparkDest = Rect.fromCenter(
        center: plugPos,
        width: sparkSize,
        height: sparkSize,
      );
      final double opacity = sparkT < 0.5 ? sparkT * 2 : (1 - sparkT) * 2;
      _paintImage(
        canvas,
        sparkKind == 'red' ? _img('snapSparksRed') : _img('snapSparksCyan'),
        sparkDest,
        opacity: opacity.clamp(0, 1),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _NeonCablePainter oldDelegate) {
    return oldDelegate.plugCenter != plugCenter ||
        oldDelegate.glowT != glowT ||
        oldDelegate.sparkT != sparkT ||
        oldDelegate.sparkKind != sparkKind ||
        oldDelegate.images.length != images.length;
  }
}
