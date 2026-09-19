import { describe, expect, it } from 'vitest';
import {
  createSymbolCipherQuestion,
  defaultSymbolCipherBank,
  parseSymbolCipherBank,
  regenerateSymbolCipherQuestion,
  serializeSymbolCipherBank,
  symbolCipherBankIssues,
  symbolCipherClientPreview,
} from './symbol-cipher-question';

describe('symbol-cipher-question studio bank', () => {
  it('defaults to a valid reference bank', () => {
    const bank = defaultSymbolCipherBank();
    expect(symbolCipherBankIssues(bank)).toEqual([]);
    const serialized = serializeSymbolCipherBank(bank);
    const parsed = parseSymbolCipherBank(serialized);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0]!.answerDisplayText).toBe('مفتاح');
  });

  it('supports multiple independent questions', () => {
    const bank = defaultSymbolCipherBank();
    const next = {
      ...bank,
      questions: [...bank.questions, createSymbolCipherQuestion(bank.questions)],
    };
    expect(next.questions).toHaveLength(2);
    expect(next.questions[1]!.questionId).not.toBe(next.questions[0]!.questionId);
  });

  it('regenerates encoding when the answer changes', () => {
    const q0 = defaultSymbolCipherBank().questions[0]!;
    const changed = regenerateSymbolCipherQuestion({
      ...q0,
      answerDisplayText: 'كتابك',
      mappings: [],
      options: q0.options.map((o, i) =>
        i === 0 ? { ...o, ar: 'كتابك' } : o,
      ),
    });
    expect(changed.mappings).toHaveLength(5);
    const serialized = serializeSymbolCipherBank({
      ...defaultSymbolCipherBank(),
      questions: [changed],
    });
    const question = (serialized.questions as Array<Record<string, unknown>>)[0]!;
    expect(question.normalizedAnswer).toBe('كتابك');
    expect(question.encodedSymbols).toEqual(
      expect.arrayContaining([expect.any(String)]),
    );
    expect((question.encodedSymbols as string[]).length).toBe(5);
  });

  it('preview includes background and hides decoy flags', () => {
    const preview = symbolCipherClientPreview(defaultSymbolCipherBank());
    expect(preview.backgroundAssetId).toBe('symbol_cipher_word.background');
    expect(preview._studioCorrectOptionKey).toBeTruthy();
    for (const m of preview.keyMappings as Array<Record<string, unknown>>) {
      expect(m.isDecoy).toBeUndefined();
    }
  });

  it('flags invalid five-grapheme answers', () => {
    const bank = defaultSymbolCipherBank();
    bank.questions[0]!.answerDisplayText = 'باب';
    expect(symbolCipherBankIssues(bank).some((i) => i.includes('5'))).toBe(
      true,
    );
  });
});
