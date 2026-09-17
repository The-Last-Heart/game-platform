/// Display-name format helpers for the identity screen.
///
/// Prohibited-word enforcement is server-only
/// (`packages/contracts` → `isProhibitedDisplayName`). Keep format rules in
/// sync with `isValidDisplayNameFormat` / `normalizeDisplayNameFormat` there.
library;

/// Trim and collapse internal whitespace to single spaces.
String normalizeDisplayNameFormat(String raw) {
  return raw.trim().replaceAll(RegExp(r'\s+'), ' ');
}

final RegExp _displayNameFormatRe = RegExp(
  r'^[\p{L}]+(?: [\p{L}]+)?$',
  unicode: true,
);

/// Letters only (any script), spaces allowed, at most two parts.
bool isValidDisplayNameFormat(String raw) {
  final String name = normalizeDisplayNameFormat(raw);
  if (name.length < 2 || name.length > 24) {
    return false;
  }
  return _displayNameFormatRe.hasMatch(name);
}
