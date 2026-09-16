/// Display-name profanity / prohibited-content filter (EN + AR).
///
/// Keep in sync with:
/// packages/contracts/src/identity/v1/display-name-moderation.ts
library;

const Map<String, String> _latinHomoglyphs = <String, String>{
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  r'$': 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
  '€': 'e',
  '£': 'e',
  '¥': 'y',
  '§': 's',
  'µ': 'u',
};

const List<String> _denylist = <String>[
  'anal',
  'anus',
  'asshole',
  'bastard',
  'bitch',
  'blowjob',
  'boob',
  'boobs',
  'cocaine',
  'cock',
  'cocks',
  'cunt',
  'dick',
  'dildo',
  'dyke',
  'fag',
  'faggot',
  'fck',
  'fuck',
  'fucker',
  'fucking',
  'horny',
  'jerkoff',
  'kill',
  'killer',
  'masturbat',
  'motherfuck',
  'murder',
  'nazi',
  'nigga',
  'nigger',
  'nude',
  'orgasm',
  'penis',
  'piss',
  'porn',
  'pussy',
  'rape',
  'rapist',
  'retard',
  'sex',
  'sexual',
  'shit',
  'slut',
  'sucker',
  'terrorist',
  'tit',
  'tits',
  'vagina',
  'whore',
  'ass',
  'cum',
  'gaysex',
  'كس',
  'كسم',
  'كسمك',
  'كسمكم',
  'كسمامك',
  'كسامك',
  'كسختك',
  'كساختك',
  'طيز',
  'طيزك',
  'طيزي',
  'خرة',
  'خره',
  'خرا',
  'خراي',
  'شرموط',
  'شرموطة',
  'شراميط',
  'قحبة',
  'قحبه',
  'قواد',
  'منيك',
  'منيوك',
  'متناك',
  'متناكة',
  'نيك',
  'نييك',
  'ينيك',
  'زب',
  'زبي',
  'زبك',
  'عير',
  'عيور',
  'لبوة',
  'لبوه',
  'فرخ',
  'مخنث',
  'خول',
  'عرص',
  'معرص',
  'ابنالكلب',
  'ابنكلب',
  'ياكلب',
  'كلب',
  'حمار',
];

const List<String> _allowlist = <String>[
  'analysis',
  'analyst',
  'canal',
  'class',
  'classic',
  'classical',
  'classify',
  'compass',
  'sussex',
  'essex',
  'passion',
  'bass',
  'pass',
  'glass',
  'grass',
  'assassin',
  'cassette',
  'scrape',
  'scrap',
  'title',
  'titles',
  'skill',
  'killian',
  'عكس',
  'كسر',
  'كسور',
  'كسوف',
  'مكسرات',
  'انكسار',
  'كسب',
  'كسبة',
  'كسبت',
  'مكاسب',
];

final RegExp _arabicDiacritic = RegExp(
  r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]',
  unicode: true,
);
final RegExp _zeroWidth = RegExp(r'[\u200B-\u200D\uFEFF\u00AD]', unicode: true);
final RegExp _separators = RegExp(
  r'''[\s._\-'"`,;:!?/\\|()[\]{}<>]+''',
  unicode: true,
);
final RegExp _arabicVowels = RegExp(r'[اأإآوىيئؤة]', unicode: true);
final RegExp _repeatCollapse = RegExp(r'(.)\1{2,}', unicode: true);

String _mapLatinChar(String ch) {
  final String lower = ch.toLowerCase();
  return _latinHomoglyphs[lower] ?? lower;
}

String normalizeDisplayNameForModeration(String raw) {
  final StringBuffer out = StringBuffer();
  final String trimmed = raw;
  for (final int unit in trimmed.runes) {
    final String ch = String.fromCharCode(unit);
    if (_arabicDiacritic.hasMatch(ch) || _zeroWidth.hasMatch(ch)) {
      continue;
    }
    String c = ch;
    if (c == 'أ' || c == 'إ' || c == 'آ' || c == 'ٱ') {
      c = 'ا';
    } else if (c == 'ة') {
      c = 'ه';
    } else if (c == 'ى') {
      c = 'ي';
    } else if (c == 'ؤ') {
      c = 'و';
    } else if (c == 'ئ') {
      c = 'ي';
    } else {
      c = _mapLatinChar(c);
    }
    out.write(c);
  }
  return out
      .toString()
      .replaceAll(_separators, ' ')
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ');
}

String collapseDisplayNameForModeration(String normalized) {
  final String compact = normalized
      .replaceAll(_separators, '')
      .replaceAll(RegExp(r'\s+'), '');
  return compact.replaceAllMapped(_repeatCollapse, (Match m) {
    final String ch = m.group(1)!;
    return '$ch$ch';
  });
}

String _fullyCollapseRepeats(String collapsed) {
  return collapsed.replaceAllMapped(RegExp(r'(.)\1+', unicode: true), (
    Match m,
  ) {
    return m.group(1)!;
  });
}

String arabicConsonantSkeleton(String collapsed) {
  return collapsed.replaceAll(_arabicVowels, '');
}

bool _isAllowlisted(String collapsed) {
  for (final String allowed in _allowlist) {
    if (collapsed == allowed || collapsed.contains(allowed)) {
      return true;
    }
  }
  return false;
}

bool _termMatchesHaystack(String haystack, String term) {
  if (haystack.isEmpty || term.isEmpty) return false;
  if (term.runes.length <= 2) {
    return haystack == term;
  }
  return haystack.contains(term);
}

bool _haystackHitsDenylist(String haystack) {
  if (haystack.isEmpty) return false;
  for (final String term in _denylist) {
    if (_termMatchesHaystack(haystack, term)) {
      return true;
    }
  }
  return false;
}

/// Returns true when the display name should be rejected.
bool isProhibitedDisplayName(String raw) {
  final String normalized = normalizeDisplayNameForModeration(raw);
  if (normalized.isEmpty) return false;

  final String collapsed = collapseDisplayNameForModeration(normalized);
  if (collapsed.isEmpty) return false;

  final String fullCollapse = _fullyCollapseRepeats(collapsed);
  if (_isAllowlisted(collapsed) || _isAllowlisted(fullCollapse)) {
    return false;
  }

  final String skeleton = arabicConsonantSkeleton(collapsed);
  final String skeletonFull = arabicConsonantSkeleton(fullCollapse);
  final String spacedCollapsed = normalized.replaceAll(RegExp(r'\s+'), '');

  if (_haystackHitsDenylist(collapsed) ||
      _haystackHitsDenylist(fullCollapse) ||
      _haystackHitsDenylist(spacedCollapsed) ||
      (skeleton.isNotEmpty && _haystackHitsDenylist(skeleton)) ||
      (skeletonFull.isNotEmpty && _haystackHitsDenylist(skeletonFull))) {
    return true;
  }

  return false;
}

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
