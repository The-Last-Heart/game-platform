import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../features/content/content_asset_cache.dart';
import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';
import 'geography_map_hit.dart';

class GeographySelectOnMapEngine implements ChallengeEngine {
  @override
  String get engineId => 'geography.select_on_map';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _GeographyMapWidget(challengeContext: challengeContext);
  }
}

class _ImageLayout {
  const _ImageLayout({
    required this.scale,
    required this.displayWidth,
    required this.displayHeight,
  });

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

  List<GeographyMapRegion> get _regions {
    return GeographyMapHit.parseRegions(
      widget.challengeContext.challenge.clientConfig['regions'],
    );
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
      scale: scale,
      displayWidth: displayWidth,
      displayHeight: displayHeight,
    );
  }

  void _onTapUpOnImage(Offset local, _ImageLayout layout) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    if (layout.scale <= 0) return;
    final Offset imagePoint = Offset(
      local.dx / layout.scale,
      local.dy / layout.scale,
    );
    final String? regionId = GeographyMapHit.regionAt(imagePoint, _regions);
    // Empty ocean / padding is not a country choice — let the player retry.
    if (regionId == null) return;
    _finalizeTap(regionId);
  }

  void _finalizeTap(String regionId) {
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
            child: Column(
              children: <Widget>[
                Text(
                  resolver.resolve(
                    promptKey,
                    params: <String, String>{'country': countryName},
                  ),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (footerKey.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 4),
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
                  return Center(
                    child: SizedBox(
                      width: layout.displayWidth,
                      height: layout.displayHeight,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapUp: (TapUpDetails d) =>
                            _onTapUpOnImage(d.localPosition, layout),
                        child: Stack(
                          fit: StackFit.expand,
                          children: <Widget>[
                            if (_mapFile != null)
                              Image.file(
                                _mapFile!,
                                fit: BoxFit.fill,
                                filterQuality: FilterQuality.medium,
                              )
                            else
                              const ColoredBox(color: LhColors.elevated),
                            CustomPaint(
                              painter: _RegionOverlayPainter(
                                scale: layout.scale,
                                regions: _regions,
                                highlightRegionId: _highlightRegionId,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RegionOverlayPainter extends CustomPainter {
  _RegionOverlayPainter({
    required this.scale,
    required this.regions,
    required this.highlightRegionId,
  });

  final double scale;
  final List<GeographyMapRegion> regions;
  final String? highlightRegionId;

  @override
  void paint(Canvas canvas, Size size) {
    if (highlightRegionId == null) return;
    for (final GeographyMapRegion region in regions) {
      if (region.regionId != highlightRegionId) continue;
      final Path path = Path();
      for (int i = 0; i < region.polygon.length; i++) {
        final Offset p = region.polygon[i];
        final Offset w = Offset(p.dx * scale, p.dy * scale);
        if (i == 0) {
          path.moveTo(w.dx, w.dy);
        } else {
          path.lineTo(w.dx, w.dy);
        }
      }
      path.close();
      canvas.drawPath(
        path,
        Paint()..color = LhColors.primary.withValues(alpha: 0.38),
      );
      canvas.drawPath(
        path,
        Paint()
          ..color = LhColors.primary
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.4,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RegionOverlayPainter oldDelegate) {
    return oldDelegate.highlightRegionId != highlightRegionId ||
        oldDelegate.regions != regions ||
        oldDelegate.scale != scale;
  }
}
