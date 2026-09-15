import 'dart:ui' show Offset;

/// One selectable country on a geography map.
class GeographyMapRegion {
  const GeographyMapRegion({
    required this.regionId,
    required this.labelKey,
    required this.polygon,
  });

  final String regionId;
  final String labelKey;
  final List<Offset> polygon;
}

/// Hit-testing for [geography.select_on_map] polygons in image-pixel space.
///
/// Authored polygons trace the inner country fill. The map art has a thick
/// cyan glow outside that fill; taps on the glow must still count as the
/// country, otherwise a correct visual pick is submitted as a miss.
class GeographyMapHit {
  GeographyMapHit._();

  /// Image-pixel slop covering the authored glow around country fills.
  static const double glowSlopPx = 64;

  static List<GeographyMapRegion> parseRegions(Object? raw) {
    if (raw is! List) return const <GeographyMapRegion>[];
    final List<GeographyMapRegion> out = <GeographyMapRegion>[];
    for (final Object? entry in raw) {
      if (entry is! Map) continue;
      final String? regionId = entry['regionId'] as String?;
      final String? labelKey = entry['labelKey'] as String?;
      final Object? polyRaw = entry['polygon'];
      if (regionId == null ||
          regionId.isEmpty ||
          labelKey == null ||
          polyRaw is! List) {
        continue;
      }
      final List<Offset> polygon = <Offset>[];
      for (final Object? pt in polyRaw) {
        final Offset? parsed = _parsePoint(pt);
        if (parsed != null) polygon.add(parsed);
      }
      if (polygon.length >= 3) {
        out.add(
          GeographyMapRegion(
            regionId: regionId,
            labelKey: labelKey,
            polygon: polygon,
          ),
        );
      }
    }
    return out;
  }

  /// Region containing [imagePoint], or the nearest country within [slopPx].
  ///
  /// Overlapping polygons prefer the smallest area so enclaves (e.g. Qatar
  /// vs Saudi Arabia) resolve to the inner country.
  static String? regionAt(
    Offset imagePoint,
    List<GeographyMapRegion> regions, {
    double slopPx = glowSlopPx,
  }) {
    String? bestInsideId;
    double? bestInsideArea;
    String? bestNearId;
    double bestNearDist = double.infinity;

    for (final GeographyMapRegion region in regions) {
      if (region.polygon.length < 3) continue;
      if (_pointInPolygon(imagePoint, region.polygon)) {
        final double area = _polygonArea(region.polygon);
        if (bestInsideArea == null || area < bestInsideArea) {
          bestInsideArea = area;
          bestInsideId = region.regionId;
        }
        continue;
      }
      if (slopPx <= 0) continue;
      final double dist = _distanceToPolygon(imagePoint, region.polygon);
      if (dist <= slopPx && dist < bestNearDist) {
        bestNearDist = dist;
        bestNearId = region.regionId;
      }
    }
    return bestInsideId ?? bestNearId;
  }

  static Offset? _parsePoint(Object? pt) {
    if (pt is Map) {
      final double? x = _readNum(pt['x']);
      final double? y = _readNum(pt['y']);
      if (x == null || y == null) return null;
      return Offset(x, y);
    }
    if (pt is List && pt.length >= 2) {
      final double? x = _readNum(pt[0]);
      final double? y = _readNum(pt[1]);
      if (x == null || y == null) return null;
      return Offset(x, y);
    }
    return null;
  }

  static double? _readNum(Object? value) {
    if (value is num && value.isFinite) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  static bool _pointInPolygon(Offset p, List<Offset> polygon) {
    bool inside = false;
    for (int i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      final Offset a = polygon[i];
      final Offset b = polygon[j];
      final double dy = b.dy - a.dy;
      final bool intersect =
          ((a.dy > p.dy) != (b.dy > p.dy)) &&
          (p.dx <
              (b.dx - a.dx) * (p.dy - a.dy) / (dy == 0 ? 1e-12 : dy) + a.dx);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  static double _polygonArea(List<Offset> polygon) {
    double area = 0;
    for (int i = 0; i < polygon.length; i++) {
      final Offset a = polygon[i];
      final Offset b = polygon[(i + 1) % polygon.length];
      area += a.dx * b.dy - b.dx * a.dy;
    }
    return area.abs() / 2;
  }

  static double _distanceToPolygon(Offset p, List<Offset> polygon) {
    double best = double.infinity;
    for (int i = 0; i < polygon.length; i++) {
      final Offset a = polygon[i];
      final Offset b = polygon[(i + 1) % polygon.length];
      final double d = _distanceToSegment(p, a, b);
      if (d < best) best = d;
    }
    return best;
  }

  static double _distanceToSegment(Offset p, Offset a, Offset b) {
    final double abx = b.dx - a.dx;
    final double aby = b.dy - a.dy;
    final double len2 = abx * abx + aby * aby;
    if (len2 == 0) return (p - a).distance;
    double t = ((p.dx - a.dx) * abx + (p.dy - a.dy) * aby) / len2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    final Offset proj = Offset(a.dx + t * abx, a.dy + t * aby);
    return (p - proj).distance;
  }
}
