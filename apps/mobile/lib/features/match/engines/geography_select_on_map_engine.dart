import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../features/content/content_asset_cache.dart';
import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class GeographySelectOnMapEngine implements ChallengeEngine {
  @override
  String get engineId => 'geography.select_on_map';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _GeographyMapWidget(challengeContext: challengeContext);
  }
}

class _MapRegion {
  const _MapRegion({
    required this.regionId,
    required this.labelKey,
    required this.polygon,
  });

  final String regionId;
  final String labelKey;
  final List<Offset> polygon;
}

class _ImageLayout {
  const _ImageLayout({
    required this.offsetX,
    required this.offsetY,
    required this.scale,
    required this.displayWidth,
    required this.displayHeight,
  });

  final double offsetX;
  final double offsetY;
  final double scale;
  final double displayWidth;
  final double displayHeight;
}

class _GeographyMapWidget extends StatefulWidget {
  const _GeographyMapWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_GeographyMapWidget> createState() => _GeographyMapWidgetState();
}

class _GeographyMapWidgetState extends State<_GeographyMapWidget> {
  bool _submitted = false;
  File? _mapFile;
  String? _highlightRegionId;

  double get _imageWidth {
    final num? v =
        widget.challengeContext.challenge.clientConfig['imageWidth'] as num?;
    return v?.toDouble() ?? 1;
  }

  double get _imageHeight {
    final num? v =
        widget.challengeContext.challenge.clientConfig['imageHeight'] as num?;
    return v?.toDouble() ?? 1;
  }

  String get _assetId {
    return (widget.challengeContext.challenge.clientConfig['assetId']
            as String?) ??
        '';
  }

  String get _targetLabelKey {
    return (widget.challengeContext.challenge.clientConfig['targetLabelKey']
            as String?) ??
        '';
  }

  List<_MapRegion> get _regions {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['regions'];
    if (raw is! List) return const <_MapRegion>[];
    final List<_MapRegion> out = <_MapRegion>[];
    for (final Object? entry in raw) {
      if (entry is! Map) continue;
      final String? regionId = entry['regionId'] as String?;
      final String? labelKey = entry['labelKey'] as String?;
      final Object? polyRaw = entry['polygon'];
      if (regionId == null || labelKey == null || polyRaw is! List) continue;
      final List<Offset> polygon = <Offset>[];
      for (final Object? pt in polyRaw) {
        if (pt is Map) {
          final num? x = pt['x'] as num?;
          final num? y = pt['y'] as num?;
          if (x != null && y != null) {
            polygon.add(Offset(x.toDouble(), y.toDouble()));
          }
        }
      }
      if (polygon.length >= 3) {
        out.add(
          _MapRegion(
            regionId: regionId,
            labelKey: labelKey,
            polygon: polygon,
          ),
        );
      }
    }
    return out;
  }

  @override
  void initState() {
    super.initState();
    _loadMap();
  }

  Future<void> _loadMap() async {
    if (_assetId.isEmpty) return;
    final File? file = await ContentAssetCache.instance.localFile(_assetId);
    if (!mounted) return;
    setState(() => _mapFile = file);
  }

  _ImageLayout _layoutFor(Size widgetSize) {
    final double scale = math.min(
      widgetSize.width / _imageWidth,
      widgetSize.height / _imageHeight,
    );
    final double displayWidth = _imageWidth * scale;
    final double displayHeight = _imageHeight * scale;
    return _ImageLayout(
      offsetX: (widgetSize.width - displayWidth) / 2,
      offsetY: (widgetSize.height - displayHeight) / 2,
      scale: scale,
      displayWidth: displayWidth,
      displayHeight: displayHeight,
    );
  }

  Offset _toImageCoords(Offset local, _ImageLayout layout) {
    return Offset(
      (local.dx - layout.offsetX) / layout.scale,
      (local.dy - layout.offsetY) / layout.scale,
    );
  }

  bool _pointInPolygon(Offset p, List<Offset> polygon) {
    bool inside = false;
    for (int i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final Offset a = polygon[i];
      final Offset b = polygon[j];
      final bool intersect = ((a.dy > p.dy) != (b.dy > p.dy)) &&
          (p.dx <
              (b.dx - a.dx) * (p.dy - a.dy) / (b.dy - a.dy + 0.00001) + a.dx);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  double _polygonArea(List<Offset> polygon) {
    double area = 0;
    for (int i = 0; i < polygon.length; i++) {
      final Offset a = polygon[i];
      final Offset b = polygon[(i + 1) % polygon.length];
      area += a.dx * b.dy - b.dx * a.dy;
    }
    return area.abs() / 2;
  }

  String? _regionAt(Offset imagePoint) {
    String? bestId;
    double? bestArea;
    for (final _MapRegion region in _regions) {
      if (!_pointInPolygon(imagePoint, region.polygon)) continue;
      final double area = _polygonArea(region.polygon);
      if (bestArea == null || area < bestArea) {
        bestArea = area;
        bestId = region.regionId;
      }
    }
    return bestId;
  }

  void _onTapUp(TapUpDetails details, Size widgetSize) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    final _ImageLayout layout = _layoutFor(widgetSize);
    final Offset local = details.localPosition;
    if (local.dx < layout.offsetX ||
        local.dy < layout.offsetY ||
        local.dx > layout.offsetX + layout.displayWidth ||
        local.dy > layout.offsetY + layout.displayHeight) {
      _finalizeTap(null);
      return;
    }
    final Offset imagePoint = _toImageCoords(local, layout);
    _finalizeTap(_regionAt(imagePoint));
  }

  void _finalizeTap(String? regionId) {
    if (_submitted) return;
    setState(() {
      _submitted = true;
      _highlightRegionId = regionId;
    });
    Future<void>.delayed(const Duration(milliseconds: 320), () {
      if (!mounted) return;
      widget.challengeContext.onSubmit(<String, dynamic>{
        'regionId': regionId,
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;
    final String footerKey = (cfg['footerKey'] as String?) ?? '';
    final String countryName = _targetLabelKey.isNotEmpty
        ? resolver.resolve(_targetLabelKey)
        : '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.success,
          ),
          const SizedBox(height: 18),
          TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: 1),
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            builder: (BuildContext context, double t, Widget? child) {
              return Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, (1 - t) * 8),
                  child: child,
                ),
              );
            },
            child: Text(
              resolver.resolve(
                promptKey,
                params: <String, String>{'country': countryName},
              ),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: 1),
              duration: const Duration(milliseconds: 380),
              curve: Curves.easeOutBack,
              builder: (BuildContext context, double t, Widget? child) {
                return Transform.scale(scale: t, child: child);
              },
              child: LayoutBuilder(
                builder: (BuildContext context, BoxConstraints constraints) {
                  final Size mapSize = Size(
                    constraints.maxWidth,
                    constraints.maxHeight,
                  );
                  final _ImageLayout layout = _layoutFor(mapSize);
                  return GestureDetector(
                    onTapUp: (TapUpDetails d) => _onTapUp(d, mapSize),
                    child: Stack(
                      fit: StackFit.expand,
                      children: <Widget>[
                        if (_mapFile != null)
                          Center(
                            child: SizedBox(
                              width: layout.displayWidth,
                              height: layout.displayHeight,
                              child: Image.file(
                                _mapFile!,
                                fit: BoxFit.fill,
                              ),
                            ),
                          )
                        else
                          Center(
                            child: SizedBox(
                              width: layout.displayWidth,
                              height: layout.displayHeight,
                              child: ColoredBox(
                                color: LhColors.elevated,
                                child: Center(
                                  child: Text(
                                    resolver.resolve('challenge.map.prompt'),
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(color: LhColors.textMuted),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        CustomPaint(
                          painter: _RegionOverlayPainter(
                            layout: layout,
                            regions: _regions,
                            highlightRegionId: _highlightRegionId,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
          if (footerKey.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Text(
              resolver.resolve(footerKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: LhColors.textMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RegionOverlayPainter extends CustomPainter {
  _RegionOverlayPainter({
    required this.layout,
    required this.regions,
    required this.highlightRegionId,
  });

  final _ImageLayout layout;
  final List<_MapRegion> regions;
  final String? highlightRegionId;

  @override
  void paint(Canvas canvas, Size size) {
    if (highlightRegionId == null) return;
    for (final _MapRegion region in regions) {
      if (region.regionId != highlightRegionId) continue;
      final Path path = Path();
      for (int i = 0; i < region.polygon.length; i++) {
        final Offset p = region.polygon[i];
        final Offset w = Offset(
          layout.offsetX + p.dx * layout.scale,
          layout.offsetY + p.dy * layout.scale,
        );
        if (i == 0) {
          path.moveTo(w.dx, w.dy);
        } else {
          path.lineTo(w.dx, w.dy);
        }
      }
      path.close();
      canvas.drawPath(
        path,
        Paint()..color = LhColors.success.withValues(alpha: 0.42),
      );
      canvas.drawPath(
        path,
        Paint()
          ..color = LhColors.success
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.4,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RegionOverlayPainter oldDelegate) {
    return oldDelegate.highlightRegionId != highlightRegionId ||
        oldDelegate.regions != regions;
  }
}
