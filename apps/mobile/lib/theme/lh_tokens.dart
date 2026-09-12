import 'package:flutter/material.dart';

/// Design tokens for The Last Heart — آخر قلب.
///
/// Colors, radii, and semantic aliases derived from the brand style guide.
abstract final class LhColors {
  static const Color bg = Color(0xFF030914);
  static const Color surface = Color(0xFF071522);
  static const Color elevated = Color(0xFF0B1D2D);
  static const Color primary = Color(0xFFFF3045);
  static const Color primaryBright = Color(0xFFFF5365);
  static const Color success = Color(0xFF22E7F2);
  static const Color warning = Color(0xFFFFC247);
  static const Color text = Color(0xFFF7FAFC);
  static const Color textMuted = Color(0xFF93A4B5);
  static const Color border = Color(0xFF1D3A50);
  static const Color disabled = Color(0xFF41505D);
}

abstract final class LhRadii {
  static const double sm = 12;
  static const double md = 18;
  static const double lg = 26;
  static const double pill = 9999;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius pillAll = BorderRadius.all(Radius.circular(pill));
}

/// Avatar palette for player circles — indexed by player position.
const List<Color> kPlayerAvatarColors = <Color>[
  Color(0xFF2196F3),
  Color(0xFFFFC247),
  Color(0xFF9C27B0),
  Color(0xFF4CAF50),
  Color(0xFF22E7F2),
  Color(0xFFFF3045),
];

/// Bundled family matching `docs/ui-reference/design-tokens.json`
/// (`Noto Sans Arabic Variable` → static weights for Flutter).
const String lhFontFamily = 'NotoSansArabic';

/// Constructs the app [ThemeData] using LH design tokens.
///
/// Typography follows the Noto Sans Arabic design-tokens scale
/// (display 38, title 26, section 20, body 16, caption 13).
ThemeData buildLhTheme() {
  return ThemeData(
    brightness: Brightness.dark,
    fontFamily: lhFontFamily,
    scaffoldBackgroundColor: LhColors.bg,
    colorScheme: const ColorScheme.dark(
      primary: LhColors.primary,
      secondary: LhColors.success,
      surface: LhColors.surface,
      error: LhColors.primary,
      onPrimary: LhColors.text,
      onSecondary: LhColors.bg,
      onSurface: LhColors.text,
      onError: LhColors.text,
    ),
    cardColor: LhColors.elevated,
    dividerColor: LhColors.border,
    disabledColor: LhColors.disabled,
    textTheme: const TextTheme(
      displayLarge: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.text,
        fontSize: 38,
        fontWeight: FontWeight.w700,
      ),
      headlineLarge: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.text,
        fontSize: 26,
        fontWeight: FontWeight.w700,
      ),
      headlineMedium: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.text,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
      titleLarge: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.text,
        fontSize: 20,
        fontWeight: FontWeight.w600,
      ),
      titleMedium: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.textMuted,
        fontSize: 16,
        fontWeight: FontWeight.w500,
      ),
      bodyLarge: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.text,
        fontSize: 16,
      ),
      bodyMedium: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.text,
        fontSize: 14,
      ),
      bodySmall: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.textMuted,
        fontSize: 13,
      ),
      labelLarge: TextStyle(
        fontFamily: lhFontFamily,
        color: LhColors.text,
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: LhColors.primary,
        foregroundColor: LhColors.text,
        textStyle: const TextStyle(
          fontFamily: lhFontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        shape: const RoundedRectangleBorder(borderRadius: LhRadii.mdAll),
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: LhColors.primary,
        foregroundColor: LhColors.text,
        textStyle: const TextStyle(
          fontFamily: lhFontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        shape: const RoundedRectangleBorder(borderRadius: LhRadii.mdAll),
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
      ),
    ),
  );
}
