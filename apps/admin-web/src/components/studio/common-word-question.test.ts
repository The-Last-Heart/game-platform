import { describe, expect, it } from 'vitest';
import {
  addCommonWordOption,
  commonWordBankIssues,
  commonWordClientPreview,
  createCommonWordQuestion,
  defaultCommonWordBank,
  parseCommonWordBank,
  removeCommonWordOption,
  serializeCommonWordBank,
} from './common-word-question';

describe('common word question bank', () => {
  it('defaults to one challenge with an editable question bank', () => {
    const bank = defaultCommonWordBank();
    expect(bank.questions).toHaveLength(1);
    expect(bank.titleAr).toBe('الكلمة المشتركة');
  });

  it('round-trips a multi-question bank including private relationships', () => {
    const bank = {
      ...defaultCommonWordBank(),
      questions: [
        {
          questionKey: 'common_word.q.eye',
          clues: [
            {
              clueId: 'clue.needle',
              textAr: 'الإبرة',
              textEn: 'Needle',
              relationshipAr: 'عين الإبرة',
              relationshipEn: 'Eye of the needle',
              visualHint: 'needle' as const,
            },
            {
              clueId: 'clue.storm',
              textAr: 'العاصفة',
              textEn: 'Storm',
              relationshipAr: 'عين العاصفة',
              relationshipEn: 'Eye of the storm',
              visualHint: 'storm' as const,
            },
            {
              clueId: 'clue.water',
              textAr: 'الماء',
              textEn: 'Water',
              relationshipAr: 'عين الماء',
              relationshipEn: 'Eye of the spring',
              visualHint: 'water' as const,
            },
          ] as const,
          options: [
            { key: 'opt.eye', ar: 'عين', en: 'Eye' },
            { key: 'opt.heart', ar: 'قلب', en: 'Heart' },
            { key: 'opt.head', ar: 'رأس', en: 'Head' },
            { key: 'opt.door', ar: 'باب', en: 'Door' },
          ],
          correctOptionKey: 'opt.eye',
        },
        {
          ...createCommonWordQuestion([]),
          clues: [
            {
              clueId: 'a',
              textAr: 'السنة',
              textEn: '',
              relationshipAr: 'رأس السنة',
              relationshipEn: '',
              visualHint: '' as const,
            },
            {
              clueId: 'b',
              textAr: 'المال',
              textEn: '',
              relationshipAr: 'رأس المال',
              relationshipEn: '',
              visualHint: '' as const,
            },
            {
              clueId: 'c',
              textAr: 'الصفحة',
              textEn: '',
              relationshipAr: 'رأس الصفحة',
              relationshipEn: '',
              visualHint: '' as const,
            },
          ] as const,
          options: [
            { key: 'h', ar: 'رأس', en: '' },
            { key: 'e', ar: 'عين', en: '' },
          ],
          correctOptionKey: 'h',
          questionKey: 'common_word.q.head',
        },
      ],
    };
    const serialized = serializeCommonWordBank(bank);
    const parsed = parseCommonWordBank(serialized);
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0]?.clues[0]?.relationshipAr).toBe('عين الإبرة');
    expect(commonWordBankIssues(parsed)).toEqual([]);
  });

  it('adds and removes questions inside one challenge', () => {
    const bank = defaultCommonWordBank();
    const next = {
      ...bank,
      questions: [...bank.questions, createCommonWordQuestion(bank.questions)],
    };
    expect(next.questions).toHaveLength(2);
    expect(next.questions[1]?.options).toHaveLength(4);
  });

  it('reuses MC option add/remove helpers', () => {
    const q = defaultCommonWordBank().questions[0]!;
    const withFive = addCommonWordOption(q);
    expect(withFive.options.length).toBe(5);
    expect(
      removeCommonWordOption(withFive, withFive.options[4]!.key).options,
    ).toHaveLength(4);
  });

  it('builds a player preview without relationship explanations', () => {
    const bank = {
      ...defaultCommonWordBank(),
      questions: [
        {
          questionKey: 'q1',
          clues: [
            {
              clueId: 'a',
              textAr: 'أ',
              textEn: '',
              relationshipAr: 'سر',
              relationshipEn: '',
              visualHint: '' as const,
            },
            {
              clueId: 'b',
              textAr: 'ب',
              textEn: '',
              relationshipAr: 'سر',
              relationshipEn: '',
              visualHint: '' as const,
            },
            {
              clueId: 'c',
              textAr: 'ج',
              textEn: '',
              relationshipAr: 'سر',
              relationshipEn: '',
              visualHint: '' as const,
            },
          ] as const,
          options: [
            { key: 'x', ar: 'عين', en: '' },
            { key: 'y', ar: 'قلب', en: '' },
          ],
          correctOptionKey: 'x',
        },
      ],
    };
    const preview = commonWordClientPreview(bank, {});
    const blob = JSON.stringify(preview);
    expect(blob).not.toContain('سر');
    expect(blob).not.toContain('correctOptionKey');
  });

  it('hydrates legacy single-question serverConfig into a bank', () => {
    const parsed = parseCommonWordBank({
      questionKey: 'legacy.q',
      titleCopy: { ar: 'الكلمة المشتركة' },
      instructionCopy: { ar: 'اختر كلمة ترتبط بالعبارات الثلاث' },
      clues: [
        {
          clueId: '1',
          textCopy: { ar: 'أ' },
          relationshipCopy: { ar: 'ع أ' },
        },
        {
          clueId: '2',
          textCopy: { ar: 'ب' },
          relationshipCopy: { ar: 'ع ب' },
        },
        {
          clueId: '3',
          textCopy: { ar: 'ج' },
          relationshipCopy: { ar: 'ع ج' },
        },
      ],
      optionKeys: ['a', 'b'],
      correctOptionKey: 'a',
      optionCopy: { a: { ar: 'عين' }, b: { ar: 'قلب' } },
    });
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0]?.questionKey).toBe('legacy.q');
  });
});
