import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SYMBOL_CIPHER_WORD_REFERENCE_QUESTION,
  arabicGraphemes,
  buildSymbolCipherQuestion,
  completeCipherKeyMappings,
  decodeSymbolCipherSequence,
  encodeSymbolCipherAnswer,
  logicalIndexToVisualLtrIndex,
  normalizeArabicCipherText,
  symbolCipherWordQuestionSchema,
  validateEngineConfigs,
  visualLtrIndexToLogicalIndex,
  type ChallengeDefinition,
  type CipherKeyMapping,
} from '@thelastheart/contracts';
import {
  SymbolCipherWordEvaluator,
  materializePack31Round,
} from './pack-31-evaluators';

function loadFixture(): ChallengeDefinition {
  const path = resolve(
    __dirname,
    '../../challenges/fixtures/trivia.symbol_cipher_word.v1.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as ChallengeDefinition;
}

describe('symbol-cipher-logic', () => {
  it('normalizes diacritics, tatweel, and whitespace without unifying letters', () => {
    expect(normalizeArabicCipherText('  مِفْتَاحٌ  ')).toBe('مفتاح');
    expect(normalizeArabicCipherText('مـفـتـاح')).toBe('مفتاح');
    expect(normalizeArabicCipherText('أبابا')).toBe('أبابا');
    expect(normalizeArabicCipherText('ابابا')).toBe('ابابا');
  });

  it('counts Arabic graphemes and places index 0 rightmost visually', () => {
    expect(arabicGraphemes('مفتاح')).toEqual(['م', 'ف', 'ت', 'ا', 'ح']);
    expect(logicalIndexToVisualLtrIndex(0, 5)).toBe(4);
    expect(visualLtrIndexToLogicalIndex(0, 5)).toBe(4);
  });

  it('encodes/decodes the reference مفتاح question', () => {
    const q = SYMBOL_CIPHER_WORD_REFERENCE_QUESTION;
    const encoded = encodeSymbolCipherAnswer(
      q.normalizedAnswer,
      q.keyMappings,
    );
    expect(encoded).toEqual([
      'hexagon',
      'circle',
      'triangle',
      'diamond',
      'square',
    ]);
    expect(decodeSymbolCipherSequence(encoded, q.keyMappings)).toBe('مفتاح');
    expect(symbolCipherWordQuestionSchema.safeParse(q).success).toBe(true);
  });

  it('reuses symbols for repeated letters and fills decoys', () => {
    const mappings: CipherKeyMapping[] = [
      { symbolId: 'circle', letter: 'ب', isDecoy: false },
      { symbolId: 'square', letter: 'ا', isDecoy: false },
      { symbolId: 'triangle', letter: 'ن', isDecoy: true },
      { symbolId: 'diamond', letter: 'ر', isDecoy: true },
      { symbolId: 'hexagon', letter: 'س', isDecoy: true },
    ];
    expect(encodeSymbolCipherAnswer('باباب', mappings)).toEqual([
      'circle',
      'square',
      'circle',
      'square',
      'circle',
    ]);
    const completed = completeCipherKeyMappings({
      normalizedAnswer: 'باباب',
      mappings: [
        { symbolId: 'circle', letter: 'ب', isDecoy: false },
        { symbolId: 'square', letter: 'ا', isDecoy: false },
      ],
    });
    expect(completed).toHaveLength(5);
    expect(new Set(completed.map((m) => m.symbolId)).size).toBe(5);
  });

  it('buildSymbolCipherQuestion regenerates encoding', () => {
    const q = buildSymbolCipherQuestion({
      questionId: 'symbol_cipher.q.test',
      answerDisplayText: 'مفتاح',
      keyMappings: [
        { symbolId: 'star', letter: 'م', isDecoy: false },
        { symbolId: 'crescent', letter: 'ف', isDecoy: false },
        { symbolId: 'octagon', letter: 'ت', isDecoy: false },
        { symbolId: 'circle', letter: 'ا', isDecoy: false },
        { symbolId: 'square', letter: 'ح', isDecoy: false },
      ],
      optionKeys: ['a', 'b', 'c', 'd'],
      correctOptionKey: 'a',
      optionCopy: {
        a: { ar: 'مفتاح' },
        b: { ar: 'مصباح' },
        c: { ar: 'تفاحة' },
        d: { ar: 'منشار' },
      },
    });
    expect(q.encodedSymbols).toEqual([
      'star',
      'crescent',
      'octagon',
      'circle',
      'square',
    ]);
  });
});

describe('symbol cipher word runtime', () => {
  it('validates the fixture bank', () => {
    const def = loadFixture();
    const questions = def.serverConfig['questions'] as unknown[];
    expect(questions.length).toBeGreaterThanOrEqual(2);
    for (const q of questions) {
      expect(symbolCipherWordQuestionSchema.safeParse(q).success).toBe(true);
    }
  });

  it('materializes public payload without leaking private fields', () => {
    const definition = loadFixture();
    materializePack31Round(definition);
    const client = definition.clientConfig;
    const server = definition.serverConfig;

    expect(client['correctOptionKey']).toBeUndefined();
    expect(client['normalizedAnswer']).toBeUndefined();
    expect(client['answerDisplayText']).toBeUndefined();
    expect(client['questions']).toBeUndefined();
    expect(client['selectionWeight']).toBeUndefined();

    expect(typeof server['correctOptionKey']).toBe('string');
    expect(typeof server['normalizedAnswer']).toBe('string');
    expect((client['keyMappings'] as unknown[]).length).toBe(5);
    expect((client['encodedSymbols'] as unknown[]).length).toBe(5);
    expect(client['backgroundAssetId']).toBe('symbol_cipher_word.background');

    for (const m of client['keyMappings'] as Array<Record<string, unknown>>) {
      expect(m['isDecoy']).toBeUndefined();
    }

    const encoded = client['encodedSymbols'] as Parameters<
      typeof decodeSymbolCipherSequence
    >[0];
    const mappings = server['keyMappings'] as CipherKeyMapping[];
    expect(decodeSymbolCipherSequence(encoded, mappings)).toBe(
      server['normalizedAnswer'],
    );
  });

  it('shuffles keyMappings order per round while preserving pairs', () => {
    const fixture = loadFixture();
    const bank = (
      fixture.serverConfig['questions'] as Array<Record<string, unknown>>
    ).find((q) => q['questionId'] === 'symbol_cipher.q.kitabuk');
    expect(bank).toBeDefined();
    const bankPairs = new Set(
      (bank!['keyMappings'] as CipherKeyMapping[]).map(
        (m) => `${m.symbolId}:${m.letter}`,
      ),
    );

    const orders = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const definition = structuredClone(fixture);
      // Force the kitabuk question so order variance is not from question pick.
      definition.serverConfig['questions'] = [bank!];
      materializePack31Round(definition);
      const mappings = definition.clientConfig['keyMappings'] as Array<{
        symbolId: string;
        letter: string;
      }>;
      expect(mappings).toHaveLength(5);
      const pairs = new Set(mappings.map((m) => `${m.symbolId}:${m.letter}`));
      expect(pairs).toEqual(bankPairs);
      orders.add(mappings.map((m) => m.letter).join(''));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('accepts catalog chrome clientConfig without pinned round fields', () => {
    const definition = loadFixture();
    // Match migration / Studio draft shape: bank on server, chrome-only client.
    definition.clientConfig = {
      categoryKey: 'challenge.category.trivia',
      promptKey: 'challenge.symbol_cipher.prompt',
      titleKey: 'challenge.symbol_cipher.title',
      titleText: 'فكّ الشفرة',
      instructionText: 'استخدم المفتاح لاكتشاف الكلمة',
      backgroundAssetId: 'symbol_cipher_word.background',
    };
    expect(() =>
      validateEngineConfigs(
        'trivia.symbol_cipher_word',
        definition.clientConfig,
        definition.serverConfig,
      ),
    ).not.toThrow();
  });

  it('evaluates chosenOptionKey authoritatively', () => {
    const definition = loadFixture();
    materializePack31Round(definition);
    const evaluator = new SymbolCipherWordEvaluator();
    const correct = definition.serverConfig['correctOptionKey'] as string;
    const options = definition.serverConfig['optionKeys'] as string[];
    const wrong = options.find((k) => k !== correct)!;

    expect(
      evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: correct },
        receivedMonoMs: 100,
        deadlineMonoMs: 10_000,
      }).success,
    ).toBe(true);

    expect(
      evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: wrong },
        receivedMonoMs: 100,
        deadlineMonoMs: 10_000,
      }).success,
    ).toBe(false);

    expect(
      evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: correct },
        receivedMonoMs: 20_000,
        deadlineMonoMs: 10_000,
      }).reasonKey,
    ).toBe('result.timeout');
  });
});
