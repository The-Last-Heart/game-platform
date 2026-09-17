import {
  isProhibitedDisplayName,
  isValidDisplayNameFormat,
  normalizeDisplayNameFormat,
} from '@thelastheart/contracts';

describe('isProhibitedDisplayName', () => {
  it('allows clean Arabic and English names', () => {
    expect(isProhibitedDisplayName('وجدي')).toBe(false);
    expect(isProhibitedDisplayName('Wajdi')).toBe(false);
    expect(isProhibitedDisplayName('Player One')).toBe(false);
    expect(isProhibitedDisplayName('عكس')).toBe(false);
    expect(isProhibitedDisplayName('Skill')).toBe(false);
  });

  it('blocks English sexual terms and common obfuscation', () => {
    expect(isProhibitedDisplayName('shit')).toBe(true);
    expect(isProhibitedDisplayName('$hit')).toBe(true);
    expect(isProhibitedDisplayName('shiiit')).toBe(true);
    expect(isProhibitedDisplayName('anal')).toBe(true);
    expect(isProhibitedDisplayName('@nal')).toBe(true);
    expect(isProhibitedDisplayName('an4l')).toBe(true);
    expect(isProhibitedDisplayName('blow job')).toBe(true);
    expect(isProhibitedDisplayName('sex')).toBe(true);
  });

  it('blocks Arabic sexual terms and vowel/spacing obfuscation', () => {
    expect(isProhibitedDisplayName('كس')).toBe(true);
    expect(isProhibitedDisplayName('طيز')).toBe(true);
    expect(isProhibitedDisplayName('كسمك')).toBe(true);
    expect(isProhibitedDisplayName('كوس اوماك')).toBe(true);
    expect(isProhibitedDisplayName('خرة')).toBe(true);
    expect(isProhibitedDisplayName('شرموط')).toBe(true);
    expect(isProhibitedDisplayName('شرمطة')).toBe(true);
    expect(isProhibitedDisplayName('شرمطه')).toBe(true);
    expect(isProhibitedDisplayName('شراميط')).toBe(true);
    expect(isProhibitedDisplayName('منيك')).toBe(true);
  });
});

describe('isValidDisplayNameFormat', () => {
  it('allows one or two letter-only parts', () => {
    expect(isValidDisplayNameFormat('Ahmad')).toBe(true);
    expect(isValidDisplayNameFormat('Ahmad Khaled')).toBe(true);
    expect(isValidDisplayNameFormat('  أحمد خالد  ')).toBe(true);
    expect(normalizeDisplayNameFormat('  Ahmad   Khaled ')).toBe(
      'Ahmad Khaled',
    );
  });

  it('rejects special characters, digits, and three+ parts', () => {
    expect(isValidDisplayNameFormat('Ahmad Khaled XF')).toBe(false);
    expect(isValidDisplayNameFormat('Ahmad-Khaled')).toBe(false);
    expect(isValidDisplayNameFormat('Ahmad2')).toBe(false);
    expect(isValidDisplayNameFormat('Ahmad_K')).toBe(false);
    expect(isValidDisplayNameFormat('A.')).toBe(false);
    expect(isValidDisplayNameFormat('Bot 1')).toBe(false);
  });
});
