import 'dart:ui' show Offset, Rect, Size;

/// Intrinsic design canvas for [assets/backgrounds/three_doors_room.jpg].
class ThreeDoorsAssetLayout {
  const ThreeDoorsAssetLayout._();

  static const Size intrinsicSize = Size(576, 1024);

  /// Circular medallions (A / B / C) in design pixels.
  static const Rect doorAMedallion = Rect.fromLTWH(118, 392, 52, 52);
  static const Rect doorBMedallion = Rect.fromLTWH(262, 392, 52, 52);
  static const Rect doorCMedallion = Rect.fromLTWH(406, 392, 52, 52);

  /// Statement plaques in design pixels.
  static const Rect doorAStatement = Rect.fromLTWH(88, 470, 112, 78);
  static const Rect doorBStatement = Rect.fromLTWH(232, 470, 112, 78);
  static const Rect doorCStatement = Rect.fromLTWH(376, 470, 112, 78);

  /// Full door hit / glow bounds.
  static const Rect doorAVisualBounds = Rect.fromLTWH(78, 320, 132, 310);
  static const Rect doorBVisualBounds = Rect.fromLTWH(222, 320, 132, 310);
  static const Rect doorCVisualBounds = Rect.fromLTWH(366, 320, 132, 310);

  /// Vertical cyan seam center lines (x, topY, bottomY) in design pixels.
  static const List<(double x, double top, double bottom)> doorSeams = <(
    double,
    double,
    double,
  )>[
    (144, 340, 610),
    (288, 340, 610),
    (432, 340, 610),
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
}
