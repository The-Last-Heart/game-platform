import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../content/content_asset_cache.dart';
import '../ui/widgets/challenge_countdown.dart';
import '../ui/widgets/challenge_sfx.dart';
import 'challenge_engine.dart';

/// Fog-wipe glass panel: swipe to clear condensation over reveal content.
class GestureFogWipeEngine implements ChallengeEngine {
  @override
  String get engineId => 'gesture.fog_wipe';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _FogWipeWidget(challengeContext: challengeContext);
  }
}

class _FogWipeWidget extends StatefulWidget {
  const _FogWipeWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_FogWipeWidget> createState() => _FogWipeWidgetState();
}

class _FogWipeWidgetState extends State<_FogWipeWidget> {
  static const int _grid = 48;
  /// Panel is phone-sized; decoding full 1254² layers on the UI isolate stalls
  /// the whole round. Keep authored art, decode at display resolution.
  static const int _decodeTargetPx = 720;
  static const String _defaultSwipeSfxId = 'fog_wipe.swipe';
  static const int _swipeSfxMinIntervalMs = 90;
  static const List<String> _layerKeys = <String>[
    'revealContent',
    'fogDensity',
    'dropletHeight',
    'frostedEdges',
    'scratchMask',
    'wetSmudgeMask',
    'glassReflections',
  ];

  bool _submitted = false;
  bool _loading = true;
  int _loadAttempts = 0;
  int _lastSwipeSfxMs = 0;
  String _swipeSfxAssetId = _defaultSwipeSfxId;
  final Map<String, ui.Image> _images = <String, ui.Image>{};
  final List<Offset> _wipePoints = <Offset>[];
  Float32List? _fogWeights;
  late final List<bool> _cleared = List<bool>.filled(_grid * _grid, false);
  double _clearanceRatio = 0;
  double _fogWeightTotal = 0;

  Map<String, dynamic> get _cfg =>
      widget.challengeContext.challenge.clientConfig;

  Map<String, dynamic> get _assetIds {
    final Object? raw = _cfg['assetIds'];
    if (raw is Map) {
      return raw.map((Object? k, Object? v) => MapEntry(k.toString(), v));
    }
    return <String, dynamic>{};
  }

  double get _brushDiameterNorm =>
      ((_cfg['brushDiameterNorm'] as num?)?.toDouble() ?? 0.12);

  double get _brushFeatherNorm =>
      ((_cfg['brushFeatherNorm'] as num?)?.toDouble() ?? 0.28);

  double get _clearanceRatioMin =>
      ((_cfg['clearanceRatioMin'] as num?)?.toDouble() ?? 0.55);

  @override
  void initState() {
    super.initState();
    unawaited(_loadAssets());
  }

  @override
  void dispose() {
    for (final ui.Image image in _images.values) {
      image.dispose();
    }
    _images.clear();
    super.dispose();
  }

  Future<void> _loadAssets() async {
    try {
      final Map<String, String> requiredIds = <String, String>{};
      for (final String key in _layerKeys) {
        final String? id = _assetIds[key]?.toString();
        if (id == null || id.isEmpty) {
          throw StateError('fog wipe missing assetId for $key');
        }
        requiredIds[key] = id;
      }
      final String swipeId =
          _assetIds['swipeSfx']?.toString() ?? _defaultSwipeSfxId;
      _swipeSfxAssetId = swipeId.isEmpty ? _defaultSwipeSfxId : swipeId;

      // Resolve files first (may re-fetch), then decode one layer at a time so
      // the round countdown / spinner can keep painting on slower devices.
      final Map<String, File> files = <String, File>{};
      for (final MapEntry<String, String> entry in requiredIds.entries) {
        final File? file =
            await ContentAssetCache.instance.ensureAsset(entry.value);
        if (file == null || !await file.exists()) {
          throw StateError('fog wipe asset not cached: ${entry.value}');
        }
        files[entry.key] = file;
        await Future<void>.delayed(Duration.zero);
        if (!mounted) return;
      }
      // Swipe SFX is optional for painting but should be warm in cache.
      await ContentAssetCache.instance.ensureAsset(_swipeSfxAssetId);
      await Future<void>.delayed(Duration.zero);
      if (!mounted) return;

      final Map<String, ui.Image> decoded = <String, ui.Image>{};
      try {
        for (final MapEntry<String, File> entry in files.entries) {
          decoded[entry.key] = await _decodeImageFile(entry.value);
          await Future<void>.delayed(Duration.zero);
          if (!mounted) {
            for (final ui.Image image in decoded.values) {
              image.dispose();
            }
            return;
          }
        }
      } catch (_) {
        for (final ui.Image image in decoded.values) {
          image.dispose();
        }
        rethrow;
      }

      for (final ui.Image old in _images.values) {
        old.dispose();
      }
      _images
        ..clear()
        ..addAll(decoded);

      final ui.Image? fog = _images['fogDensity'];
      if (fog == null) {
        throw StateError('fog wipe fogDensity failed to decode');
      }
      await _sampleFogWeights(fog);
      if (_fogWeights == null) {
        throw StateError('fog wipe weight sampling failed');
      }

      if (!mounted) return;
      setState(() => _loading = false);
    } catch (error, stack) {
      debugPrint('gesture.fog_wipe load failed: $error\n$stack');
      if (!mounted) return;
      _loadAttempts += 1;
      if (_loadAttempts >= 4) {
        // Keep loader visible; do not open a hollow panel.
        return;
      }
      await Future<void>.delayed(Duration(milliseconds: 200 * _loadAttempts));
      if (!mounted || !_loading) return;
      unawaited(_loadAssets());
    }
  }

  Future<ui.Image> _decodeImageFile(File file) async {
    final Uint8List bytes = await file.readAsBytes();
    // Yield after IO so the first frame can paint before codec work.
    await Future<void>.delayed(Duration.zero);
    final ui.Codec codec = await ui.instantiateImageCodec(
      bytes,
      targetWidth: _decodeTargetPx,
      targetHeight: _decodeTargetPx,
    );
    try {
      final ui.FrameInfo frame = await codec.getNextFrame();
      return frame.image;
    } finally {
      codec.dispose();
    }
  }

  Future<void> _sampleFogWeights(ui.Image fog) async {
    final ByteData? data = await fog.toByteData(
      format: ui.ImageByteFormat.rawRgba,
    );
    if (data == null) return;
    final Float32List weights = Float32List(_grid * _grid);
    double total = 0;
    final int w = fog.width;
    final int h = fog.height;
    for (int gy = 0; gy < _grid; gy++) {
      for (int gx = 0; gx < _grid; gx++) {
        final int px = ((gx + 0.5) / _grid * w).floor().clamp(0, w - 1);
        final int py = ((gy + 0.5) / _grid * h).floor().clamp(0, h - 1);
        final int i = (py * w + px) * 4;
        // Grayscale density: white = dense fog.
        final double density = data.getUint8(i) / 255.0;
        final double weight = density * density;
        weights[gy * _grid + gx] = weight;
        total += weight;
      }
    }
    _fogWeights = weights;
    _fogWeightTotal = total <= 0 ? 1 : total;
  }

  void _submitIfReady() {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    if (_clearanceRatio + 1e-6 < _clearanceRatioMin) return;
    setState(() => _submitted = true);
    widget.challengeContext.onSubmit(<String, dynamic>{
      'clearanceRatio': double.parse(_clearanceRatio.toStringAsFixed(4)),
    });
  }

  void _playSwipeSfx() {
    final int now = DateTime.now().millisecondsSinceEpoch;
    if (now - _lastSwipeSfxMs < _swipeSfxMinIntervalMs) return;
    _lastSwipeSfxMs = now;
    unawaited(ChallengeSfx.instance.play(_swipeSfxAssetId));
  }

  void _stampWipe(Offset local, Size panelSize) {
    if (_submitted ||
        widget.challengeContext.isInteractionLocked ||
        _loading) {
      return;
    }
    final Offset norm = Offset(
      (local.dx / panelSize.width).clamp(0.0, 1.0),
      (local.dy / panelSize.height).clamp(0.0, 1.0),
    );
    if (_wipePoints.isNotEmpty) {
      final Offset last = _wipePoints.last;
      final double dist = (norm - last).distance;
      final double step = (_brushDiameterNorm * 0.22).clamp(0.02, 0.08);
      if (dist > step) {
        final int n = (dist / step).ceil();
        for (int i = 1; i <= n; i++) {
          final double t = i / n;
          _wipePoints.add(Offset.lerp(last, norm, t)!);
          _markCleared(Offset.lerp(last, norm, t)!);
        }
      } else {
        _wipePoints.add(norm);
        _markCleared(norm);
      }
    } else {
      _wipePoints.add(norm);
      _markCleared(norm);
    }
    _playSwipeSfx();
    setState(() {});
    _submitIfReady();
  }

  void _markCleared(Offset norm) {
    final Float32List? weights = _fogWeights;
    if (weights == null) return;
    final double radius = (_brushDiameterNorm * 0.5).clamp(0.03, 0.2);
    final int rCells = (radius * _grid).ceil() + 1;
    final int cx = (norm.dx * _grid).floor().clamp(0, _grid - 1);
    final int cy = (norm.dy * _grid).floor().clamp(0, _grid - 1);
    double cleared = 0;
    for (int gy = math.max(0, cy - rCells); gy <= math.min(_grid - 1, cy + rCells); gy++) {
      for (int gx = math.max(0, cx - rCells); gx <= math.min(_grid - 1, cx + rCells); gx++) {
        final double dx = (gx + 0.5) / _grid - norm.dx;
        final double dy = (gy + 0.5) / _grid - norm.dy;
        if (dx * dx + dy * dy <= radius * radius) {
          final int idx = gy * _grid + gx;
          if (!_cleared[idx]) {
            _cleared[idx] = true;
          }
        }
      }
    }
    for (int i = 0; i < _cleared.length; i++) {
      if (_cleared[i]) cleared += weights[i];
    }
    _clearanceRatio = (cleared / _fogWeightTotal).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (_cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;
    final String footerKey = (_cfg['footerKey'] as String?) ?? '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.success,
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : LayoutBuilder(
                    builder: (BuildContext context, BoxConstraints c) {
                      const double promptBlock = 88;
                      final double side = math
                          .min(c.maxWidth, c.maxHeight - promptBlock)
                          .clamp(120.0, c.maxWidth);
                      final Size panelSize = Size(side, side);
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
                                onPanStart: (DragStartDetails d) {
                                  try {
                                    HapticFeedback.selectionClick();
                                  } catch (_) {}
                                  _stampWipe(d.localPosition, panelSize);
                                },
                                onPanUpdate: (DragUpdateDetails d) {
                                  _stampWipe(d.localPosition, panelSize);
                                },
                                child: CustomPaint(
                                  size: panelSize,
                                  painter: _FogWipePainter(
                                    images: _images,
                                    wipePoints: List<Offset>.from(_wipePoints),
                                    brushDiameterNorm: _brushDiameterNorm,
                                    brushFeatherNorm: _brushFeatherNorm,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _FogWipePainter extends CustomPainter {
  _FogWipePainter({
    required this.images,
    required this.wipePoints,
    required this.brushDiameterNorm,
    required this.brushFeatherNorm,
  });

  final Map<String, ui.Image> images;
  final List<Offset> wipePoints;
  final double brushDiameterNorm;
  final double brushFeatherNorm;

  void _drawImage(Canvas canvas, ui.Image? image, Rect dest, {double opacity = 1}) {
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
    final ui.Image? reveal = images['revealContent'];
    final ui.Image? fog = images['fogDensity'];
    final ui.Image? droplets = images['dropletHeight'];
    final ui.Image? scratches = images['scratchMask'];
    final ui.Image? wet = images['wetSmudgeMask'];
    final ui.Image? frost = images['frostedEdges'];
    final ui.Image? reflections = images['glassReflections'];

    canvas.save();
    canvas.clipRect(panel);

    // 1. Reveal under glass
    _drawImage(canvas, reveal, panel);

    // 2–4. Fog layer cleared by persistent wipe mask (dstOut stamps)
    canvas.saveLayer(panel, Paint());
    if (fog != null) {
      _drawImage(canvas, fog, panel, opacity: 0.92);
      // Soft cool fog tint so sparse density still reads as condensation.
      canvas.drawRect(
        panel,
        Paint()
          ..color = const Color(0x55A8C8E8)
          ..blendMode = BlendMode.srcATop,
      );
    } else {
      canvas.drawRect(panel, Paint()..color = const Color(0xCCB8D0E8));
    }

    final double brushPx = size.width * brushDiameterNorm;
    final double feather = (brushFeatherNorm).clamp(0.15, 0.55);
    for (final Offset p in wipePoints) {
      final Offset c = Offset(p.dx * size.width, p.dy * size.height);
      final Rect stamp = Rect.fromCircle(center: c, radius: brushPx * 0.5);
      // Slight elliptical + noisy edge via two overlapping soft stamps.
      final double wobble = 0.92 + ((p.dx * 17 + p.dy * 13) % 1.0) * 0.14;
      canvas.drawOval(
        Rect.fromCenter(
          center: c,
          width: stamp.width * wobble,
          height: stamp.height / wobble,
        ),
        Paint()
          ..blendMode = BlendMode.dstOut
          ..shader = ui.Gradient.radial(
            c,
            brushPx * 0.5,
            <Color>[
              const Color(0xFFFFFFFF),
              Color.fromRGBO(255, 255, 255, 1.0 - feather * 0.35),
              const Color(0x00FFFFFF),
            ],
            <double>[0.0, (1.0 - feather).clamp(0.35, 0.85), 1.0],
          ),
      );
    }
    canvas.restore();

    // 5. Droplet highlights from height map (screen blend, restrained)
    if (droplets != null) {
      _drawImage(canvas, droplets, panel, opacity: 0.22);
      canvas.drawRect(
        panel,
        Paint()
          ..color = const Color(0x33FFFFFF)
          ..blendMode = BlendMode.screen,
      );
    }

    // 6. Scratches
    if (scratches != null) {
      canvas.saveLayer(panel, Paint()..color = const Color(0x14FFFFFF));
      _drawImage(canvas, scratches, panel);
      canvas.restore();
    }

    // Wet smudge residue faintly where wiped
    if (wet != null && wipePoints.isNotEmpty) {
      _drawImage(canvas, wet, panel, opacity: 0.12);
    }

    // 7–8. Frame frost + reflections
    _drawImage(canvas, frost, panel, opacity: 0.95);
    _drawImage(canvas, reflections, panel, opacity: 0.14);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _FogWipePainter oldDelegate) {
    return oldDelegate.wipePoints.length != wipePoints.length ||
        oldDelegate.images.length != images.length;
  }
}
