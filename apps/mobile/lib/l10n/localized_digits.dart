/// Locale-aware digit rendering for interpolated counts.
String formatLocalizedCount(int count, String localeCode) {
  final String western = count.toString();
  if (localeCode != 'ar') {
    return western;
  }
  const List<String> digits = <String>[
    '٠',
    '١',
    '٢',
    '٣',
    '٤',
    '٥',
    '٦',
    '٧',
    '٨',
    '٩',
  ];
  return western.split('').map((String c) {
    final int? d = int.tryParse(c);
    return d != null && d < 10 ? digits[d] : c;
  }).join();
}
