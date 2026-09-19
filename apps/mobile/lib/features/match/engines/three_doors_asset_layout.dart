import 'dart:math' as math;
import 'dart:ui' show Offset, Rect, Size;

/// Intrinsic design canvas for [assets/backgrounds/three_doors_room.jpg].
///
/// Coordinates measured from the blank gold-bordered medallions and statement
/// plaques baked into the room art (576×1024).
class ThreeDoorsAssetLayout {
  const ThreeDoorsAssetLayout._();

  static const Size intrinsicSize = Size(576, 1024);

  /// Vertical band that must stay on-screen (medallions → lower door).
  /// Kept tight so we can zoom past letterbox floor dead-space.
  static const double doorBandTop = 330;
  static const double doorBandBottom = 640;

  /// Circular medallions (A / B / C) — dark fill inside the gold ring.
  static const Rect doorAMedallion = Rect.fromLTWH(80, 364, 36, 36);
  static const Rect doorBMedallion = Rect.fromLTWH(270, 365, 36, 36);
  static const Rect doorCMedallion = Rect.fromLTWH(459, 364, 36, 36);

  /// Statement text slots — slightly taller than the baked dark plaque so
  /// two-line Arabic (with descenders) is not clipped by the gold frame.
  static const Rect doorAStatement = Rect.fromLTWH(40, 438, 119, 76);
  static const Rect doorBStatement = Rect.fromLTWH(226, 438, 124, 76);
  static const Rect doorCStatement = Rect.fromLTWH(418, 438, 119, 76);

  /// Full door hit / glow bounds.
  static const Rect doorAVisualBounds = Rect.fromLTWH(38, 340, 124, 300);
  static const Rect doorBVisualBounds = Rect.fromLTWH(226, 340, 124, 300);
  static const Rect doorCVisualBounds = Rect.fromLTWH(415, 340, 124, 300);

  /// Vertical cyan seam center lines (x, topY, bottomY) in design pixels.
  static const List<(double x, double top, double bottom)> doorSeams = <(
    double,
    double,
    double,
  )>[
    (98, 340, 620),
    (288, 340, 620),
    (477, 340, 620),
  ];

  static Rect medallionFor(String doorId) {
    switch (doorId) {
      case 'A':
        return doorAMedallion;
      case 'B':
        return doorBMedallion;
      case 'C':
        return doorCMedallion;
      default:
        return doorBMedallion;
    }
  }

  static Rect statementFor(String doorId) {
    switch (doorId) {
      case 'A':
        return doorAStatement;
      case 'B':
        return doorBStatement;
      case 'C':
        return doorCStatement;
      default:
        return doorBStatement;
    }
  }

  static Rect doorBoundsFor(String doorId) {
    switch (doorId) {
      case 'A':
        return doorAVisualBounds;
      case 'B':
        return doorBVisualBounds;
      case 'C':
        return doorCVisualBounds;
      default:
        return doorBVisualBounds;
    }
  }

  /// Maps a design-canvas rect into the displayed asset rectangle.
  static Rect mapRect({
    required Rect design,
    required Size displayedSize,
    required Offset displayedOrigin,
  }) {
    final double sx = displayedSize.width / intrinsicSize.width;
    final double sy = displayedSize.height / intrinsicSize.height;
    return Rect.fromLTWH(
      displayedOrigin.dx + design.left * sx,
      displayedOrigin.dy + design.top * sy,
      design.width * sx,
      design.height * sy,
    );
  }

  /// Fill [viewport] width (with a light zoom) and pin the door band into view.
  ///
  /// May crop a little floor/ceiling and a thin left/right margin so plaques
  /// render larger; the door band itself stays fully on-screen.
  static ({Size size, Offset origin}) doorFocusFit({
    required Size viewport,
    double topGuard = 0,
    double bottomGuard = 0,
    double zoom = 1.12,
  }) {
    const Size intrinsic = intrinsicSize;
    if (viewport.width <= 0 || viewport.height <= 0) {
      return (size: Size.zero, origin: Offset.zero);
    }

    final double usableTop = topGuard.clamp(0.0, viewport.height);
    final double usableBottom = (viewport.height - bottomGuard).clamp(
      usableTop,
      viewport.height,
    );
    final double usableHeight = math.max(1.0, usableBottom - usableTop);

    final double widthScale =
        (viewport.width / intrinsic.width) * zoom.clamp(1.0, 1.25);
    final double doorBandHeight = (doorBandBottom - doorBandTop) * widthScale;
    final double scale = doorBandHeight <= usableHeight
        ? widthScale
        : usableHeight / (doorBandBottom - doorBandTop);

    final Size size = Size(intrinsic.width * scale, intrinsic.height * scale);
    final double doorBandCenterY =
        ((doorBandTop + doorBandBottom) / 2) * scale;
    final double targetCenterY = usableTop + usableHeight / 2;
    double originY = targetCenterY - doorBandCenterY;

    final double bandTop = originY + doorBandTop * scale;
    final double bandBottom = originY + doorBandBottom * scale;
    if (bandTop < usableTop) {
      originY += usableTop - bandTop;
    } else if (bandBottom > usableBottom) {
      originY -= bandBottom - usableBottom;
    }

    final double originX = (viewport.width - size.width) / 2;
    return (size: size, origin: Offset(originX, originY));
  }
}
