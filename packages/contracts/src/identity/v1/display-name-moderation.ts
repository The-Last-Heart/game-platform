/**
 * Display-name profanity / prohibited-content filter (EN + AR).
 *
 * Authoritative for server joins; keep Dart port in sync:
 * apps/mobile/lib/features/identity/data/display_name_moderation.dart
 *
 * Matching is intentional over-blocking for short casual names. Maintain
 * DISPLAY_NAME_ALLOWLIST for known false positives.
 */

/** Latin lookalikes / leetspeak → ASCII letter. */
const LATIN_HOMOGLYPHS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
  '€': 'e',
  '£': 'e',
  '¥': 'y',
  '§': 's',
  'µ': 'u',
};

/**
 * Forbidden stems (already conceptually normalized / collapsed).
 * Short Arabic (≤2) match whole-name only; longer terms substring-match.
 */
const DISPLAY_NAME_DENYLIST: readonly string[] = [
  // English sexual / profane / violent
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
  // Arabic sexual / insults (dialect + common forms)
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

/** Legitimate names / words that contain deny stems as substrings. */
const DISPLAY_NAME_ALLOWLIST: readonly string[] = [
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
  // Arabic false positives containing كس
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

const ARABIC_DIACRITIC_RE =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/u;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD]/u;
const SEPARATORS_RE = /[\s._\-'"`,;:!?/\\|()[\]{}<>]+/gu;
const ARABIC_VOWELS_RE = /[اأإآوىيئؤة]/gu;

function mapLatinChar(ch: string): string {
  const lower = ch.toLowerCase();
  return LATIN_HOMOGLYPHS[lower] ?? lower;
}

/**
 * Normalize a display name for moderation (not for uniqueness).
 * Strips diacritics/tatweel/zero-width, maps leetspeak, unifies Arabic letters.
 */
export function normalizeDisplayNameForModeration(raw: string): string {
  let out = '';
  const trimmed = raw.normalize('NFKC');
  for (const ch of trimmed) {
    if (ARABIC_DIACRITIC_RE.test(ch) || ZERO_WIDTH_RE.test(ch)) {
      continue;
    }

    let c = ch;
    if (c === 'أ' || c === 'إ' || c === 'آ' || c === 'ٱ') c = 'ا';
    else if (c === 'ة') c = 'ه';
    else if (c === 'ى') c = 'ي';
    else if (c === 'ؤ') c = 'و';
    else if (c === 'ئ') c = 'ي';
    else c = mapLatinChar(c);

    out += c;
  }
  return out.replace(SEPARATORS_RE, ' ').trim().replace(/\s+/g, ' ');
}

/** Remove spaces/separators and collapse long repeated letters (shiiit → shiit). */
export function collapseDisplayNameForModeration(normalized: string): string {
  const compact = normalized.replace(SEPARATORS_RE, '').replace(/\s+/g, '');
  return compact.replace(/(.)\1{2,}/gu, '$1$1');
}

/** Fully collapse repeats (shiiit → shit) for matching only. */
function fullyCollapseRepeats(collapsed: string): string {
  return collapsed.replace(/(.)\1+/gu, '$1');
}

/** Arabic consonant skeleton — strips long vowels so كوسوماك → كسمك. */
export function arabicConsonantSkeleton(collapsed: string): string {
  return collapsed.replace(ARABIC_VOWELS_RE, '');
}

function isAllowlisted(collapsed: string): boolean {
  for (const allowed of DISPLAY_NAME_ALLOWLIST) {
    if (collapsed === allowed || collapsed.includes(allowed)) {
      return true;
    }
  }
  return false;
}

function termMatchesHaystack(haystack: string, term: string): boolean {
  if (!haystack || !term) return false;
  if (term.length <= 2) {
    return haystack === term;
  }
  return haystack.includes(term);
}

function haystackHitsDenylist(haystack: string): boolean {
  if (!haystack) return false;
  for (const term of DISPLAY_NAME_DENYLIST) {
    if (termMatchesHaystack(haystack, term)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when the display name should be rejected.
 * Does not throw — callers map to protocol / UI errors.
 */
export function isProhibitedDisplayName(raw: string): boolean {
  const normalized = normalizeDisplayNameForModeration(raw);
  if (!normalized) return false;

  const collapsed = collapseDisplayNameForModeration(normalized);
  if (!collapsed) return false;

  const fullCollapse = fullyCollapseRepeats(collapsed);
  if (isAllowlisted(collapsed) || isAllowlisted(fullCollapse)) {
    return false;
  }

  const skeleton = arabicConsonantSkeleton(collapsed);
  const skeletonFull = arabicConsonantSkeleton(fullCollapse);
  const spacedCollapsed = normalized.replace(/\s+/g, '');

  if (
    haystackHitsDenylist(collapsed) ||
    haystackHitsDenylist(fullCollapse) ||
    haystackHitsDenylist(spacedCollapsed) ||
    (skeleton.length > 0 && haystackHitsDenylist(skeleton)) ||
    (skeletonFull.length > 0 && haystackHitsDenylist(skeletonFull))
  ) {
    return true;
  }

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const joined = tokens.join('');
    const joinedFull = fullyCollapseRepeats(joined);
    if (
      haystackHitsDenylist(joined) ||
      haystackHitsDenylist(joinedFull) ||
      haystackHitsDenylist(arabicConsonantSkeleton(joined)) ||
      haystackHitsDenylist(arabicConsonantSkeleton(joinedFull))
    ) {
      return true;
    }
  }

  return false;
}

/** Trim and collapse internal whitespace to single spaces. */
export function normalizeDisplayNameFormat(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Player display names: letters only (any script), spaces allowed,
 * at most two parts ("Ahmad" / "Ahmad Khaled"). No digits or punctuation.
 */
const DISPLAY_NAME_FORMAT_RE = /^[\p{L}]+(?: [\p{L}]+)?$/u;

export function isValidDisplayNameFormat(raw: string): boolean {
  const name = normalizeDisplayNameFormat(raw);
  if (name.length < 2 || name.length > 24) {
    return false;
  }
  return DISPLAY_NAME_FORMAT_RE.test(name);
}
