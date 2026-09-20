import {
  CIPHER_SYMBOL_IDS,
  SYMBOL_CIPHER_WORD_INSTRUCTION_COPY,
  SYMBOL_CIPHER_WORD_REFERENCE_QUESTION,
  SYMBOL_CIPHER_WORD_TITLE_COPY,
  arabicGraphemes,
  buildSymbolCipherQuestion,
  completeCipherKeyMappings,
  decodeSymbolCipherSequence,
  encodeSymbolCipherAnswer,
  normalizeArabicCipherText,
  type CipherKeyMapping,
  type CipherSymbolId,
} from '@thelastheart/contracts';
import type { TriviaStudioOption } from './trivia-question-bank';

export type SymbolCipherStudioMapping = {
  symbolId: CipherSymbolId | '';
  letter: string;
  isDecoy: boolean;
};

export type SymbolCipherStudioQuestion = {
  questionId: string;
  internalName: string;
  answerDisplayText: string;
  mappings: SymbolCipherStudioMapping[];
  options: TriviaStudioOption[];
  correctOptionKey: string;
  enabled: boolean;
  selectionWeight: number;
};

export type SymbolCipherStudioBank = {
  titleAr: string;
  titleEn: string;
  instructionAr: string;
  instructionEn: string;
  questions: SymbolCipherStudioQuestion[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function localeCopy(raw: unknown): { ar: string; en: string } {
  const rec = asRecord(raw);
  return {
    ar: typeof rec?.ar === 'string' ? rec.ar : '',
    en: typeof rec?.en === 'string' ? rec.en : '',
  };
}

function emptyMappings(): SymbolCipherStudioMapping[] {
  return Array.from({ length: 5 }, () => ({
    symbolId: '' as const,
    letter: '',
    isDecoy: true,
  }));
}

export function createSymbolCipherQuestion(
  existing: SymbolCipherStudioQuestion[],
): SymbolCipherStudioQuestion {
  const slug = `custom_${existing.length + 1}_${Date.now().toString(36).slice(-4)}`;
  const optionKeys = ['a', 'b', 'c', 'd'].map(
    (s) => `symbol_cipher.opt.${slug}_${s}`,
  );
  return {
    questionId: `symbol_cipher.q.${slug}`,
    internalName: '',
    answerDisplayText: '',
    mappings: emptyMappings(),
    options: optionKeys.map((key) => ({ key, ar: '', en: '' })),
    correctOptionKey: optionKeys[0]!,
    enabled: true,
    selectionWeight: 100,
  };
}

export function defaultSymbolCipherBank(): SymbolCipherStudioBank {
  const ref = SYMBOL_CIPHER_WORD_REFERENCE_QUESTION;
  return {
    titleAr: SYMBOL_CIPHER_WORD_TITLE_COPY.ar,
    titleEn: SYMBOL_CIPHER_WORD_TITLE_COPY.en,
    instructionAr: SYMBOL_CIPHER_WORD_INSTRUCTION_COPY.ar,
    instructionEn: SYMBOL_CIPHER_WORD_INSTRUCTION_COPY.en,
    questions: [
      {
        questionId: ref.questionId,
        internalName: ref.internalName ?? 'مفتاح',
        answerDisplayText: ref.answerDisplayText,
        mappings: ref.keyMappings.map((m) => ({
          symbolId: m.symbolId,
          letter: m.letter,
          isDecoy: m.isDecoy,
        })),
        options: ref.optionKeys.map((key) => ({
          key,
          ar: ref.optionCopy?.[key]?.ar ?? '',
          en: ref.optionCopy?.[key]?.en ?? '',
        })),
        correctOptionKey: ref.correctOptionKey,
        enabled: true,
        selectionWeight: 100,
      },
    ],
  };
}

function parseMapping(raw: unknown): SymbolCipherStudioMapping {
  const rec = asRecord(raw);
  const symbolRaw = typeof rec?.symbolId === 'string' ? rec.symbolId : '';
  const symbolId = (CIPHER_SYMBOL_IDS as readonly string[]).includes(symbolRaw)
    ? (symbolRaw as CipherSymbolId)
    : '';
  return {
    symbolId,
    letter: typeof rec?.letter === 'string' ? rec.letter : '',
    isDecoy: rec?.isDecoy === true,
  };
}

function parseOneQuestion(raw: unknown): SymbolCipherStudioQuestion | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const questionId =
    typeof rec.questionId === 'string' ? rec.questionId.trim() : '';
  const optionKeys = Array.isArray(rec.optionKeys)
    ? rec.optionKeys.filter(
        (k): k is string => typeof k === 'string' && k.trim().length > 0,
      )
    : [];
  if (!questionId || optionKeys.length !== 4) return null;
  const optionCopy = asRecord(rec.optionCopy) ?? {};
  const rawMappings = Array.isArray(rec.keyMappings) ? rec.keyMappings : [];
  const mappings = emptyMappings().map((fallback, i) =>
    rawMappings[i] != null ? parseMapping(rawMappings[i]) : fallback,
  );
  const correct =
    typeof rec.correctOptionKey === 'string' &&
    optionKeys.includes(rec.correctOptionKey)
      ? rec.correctOptionKey
      : optionKeys[0]!;
  return {
    questionId,
    internalName:
      typeof rec.internalName === 'string' ? rec.internalName : '',
    answerDisplayText:
      typeof rec.answerDisplayText === 'string'
        ? rec.answerDisplayText
        : typeof rec.normalizedAnswer === 'string'
          ? rec.normalizedAnswer
          : '',
    mappings,
    options: optionKeys.map((key) => {
      const copy = localeCopy(optionCopy[key]);
      return { key, ar: copy.ar, en: copy.en };
    }),
    correctOptionKey: correct,
    enabled: rec.enabled !== false,
    selectionWeight:
      typeof rec.selectionWeight === 'number' && rec.selectionWeight > 0
        ? rec.selectionWeight
        : 100,
  };
}

export function parseSymbolCipherBank(
  serverConfig: Record<string, unknown>,
): SymbolCipherStudioBank {
  const title = localeCopy(serverConfig.titleCopy);
  const instruction = localeCopy(serverConfig.instructionCopy);
  const rawQuestions = Array.isArray(serverConfig.questions)
    ? serverConfig.questions
    : [];
  const questions = rawQuestions
    .map(parseOneQuestion)
    .filter((q): q is SymbolCipherStudioQuestion => q != null);
  if (questions.length === 0) {
    return defaultSymbolCipherBank();
  }
  return {
    titleAr: title.ar || SYMBOL_CIPHER_WORD_TITLE_COPY.ar,
    titleEn: title.en || SYMBOL_CIPHER_WORD_TITLE_COPY.en,
    instructionAr:
      instruction.ar || SYMBOL_CIPHER_WORD_INSTRUCTION_COPY.ar,
    instructionEn:
      instruction.en || SYMBOL_CIPHER_WORD_INSTRUCTION_COPY.en,
    questions,
  };
}

export function symbolCipherBankSignature(bank: SymbolCipherStudioBank): string {
  return JSON.stringify(bank);
}

function toKeyMappings(
  mappings: SymbolCipherStudioMapping[],
): CipherKeyMapping[] {
  return mappings
    .filter(
      (m): m is SymbolCipherStudioMapping & { symbolId: CipherSymbolId } =>
        m.symbolId !== '' && m.letter.trim().length > 0,
    )
    .map((m) => ({
      symbolId: m.symbolId,
      letter: normalizeArabicCipherText(m.letter),
      isDecoy: m.isDecoy,
    }));
}

/** Rebuild mappings + encoding when the answer or mapping drafts change. */
export function regenerateSymbolCipherQuestion(
  question: SymbolCipherStudioQuestion,
): SymbolCipherStudioQuestion {
  const normalized = normalizeArabicCipherText(question.answerDisplayText);
  if (arabicGraphemes(normalized).length !== 5) {
    return question;
  }
  try {
    const completed = completeCipherKeyMappings({
      normalizedAnswer: normalized,
      mappings: toKeyMappings(question.mappings),
    });
    // Keep correct option text in sync with answer when empty/matching prior.
    const options = question.options.map((o) => {
      if (o.key === question.correctOptionKey) {
        return {
          ...o,
          ar: o.ar.trim() ? o.ar : question.answerDisplayText.trim(),
        };
      }
      return o;
    });
    return {
      ...question,
      mappings: completed.map((m) => ({
        symbolId: m.symbolId,
        letter: m.letter,
        isDecoy: m.isDecoy,
      })),
      options,
    };
  } catch {
    return question;
  }
}

export function autoAssignUniqueSymbols(
  question: SymbolCipherStudioQuestion,
): SymbolCipherStudioQuestion {
  const normalized = normalizeArabicCipherText(question.answerDisplayText);
  const completed = completeCipherKeyMappings({
    normalizedAnswer: normalized.length === 5 ? normalized : 'مفتاح',
    mappings: [],
    preferredSymbols: [...CIPHER_SYMBOL_IDS],
  });
  // If answer invalid, just assign symbols onto existing letters.
  if (arabicGraphemes(normalized).length !== 5) {
    const used = new Set<CipherSymbolId>();
    const mappings = question.mappings.map((m, i) => {
      const preferred = CIPHER_SYMBOL_IDS[i]!;
      let symbolId = preferred;
      if (used.has(symbolId)) {
        symbolId =
          CIPHER_SYMBOL_IDS.find((s) => !used.has(s)) ?? preferred;
      }
      used.add(symbolId);
      return { ...m, symbolId };
    });
    return { ...question, mappings };
  }
  return {
    ...question,
    mappings: completed.map((m) => ({
      symbolId: m.symbolId,
      letter: m.letter,
      isDecoy: m.isDecoy,
    })),
  };
}

export function serializeSymbolCipherBank(
  bank: SymbolCipherStudioBank,
): Record<string, unknown> {
  const questions = bank.questions.map((q) => {
    const rebuilt = regenerateSymbolCipherQuestion(q);
    const normalized = normalizeArabicCipherText(rebuilt.answerDisplayText);
    const graphemes = arabicGraphemes(normalized);
    const optionCopy = Object.fromEntries(
      rebuilt.options.map((o) => [
        o.key,
        {
          ar: o.ar.trim() || rebuilt.answerDisplayText.trim() || o.key,
          ...(o.en.trim() ? { en: o.en.trim() } : {}),
        },
      ]),
    );
    if (graphemes.length !== 5) {
      return {
        questionId: rebuilt.questionId,
        internalName: rebuilt.internalName || undefined,
        answerDisplayText: rebuilt.answerDisplayText,
        normalizedAnswer: normalized || rebuilt.answerDisplayText,
        keyMappings: toKeyMappings(rebuilt.mappings),
        encodedSymbols: [],
        optionKeys: rebuilt.options.map((o) => o.key),
        correctOptionKey: rebuilt.correctOptionKey,
        optionCopy,
        selectionWeight: rebuilt.selectionWeight,
        enabled: rebuilt.enabled,
      };
    }
    try {
      return buildSymbolCipherQuestion({
        questionId: rebuilt.questionId,
        internalName: rebuilt.internalName || undefined,
        answerDisplayText: rebuilt.answerDisplayText,
        keyMappings: toKeyMappings(rebuilt.mappings),
        optionKeys: rebuilt.options.map((o) => o.key),
        correctOptionKey: rebuilt.correctOptionKey,
        optionCopy,
        selectionWeight: rebuilt.selectionWeight,
        enabled: rebuilt.enabled,
      });
    } catch {
      return {
        questionId: rebuilt.questionId,
        internalName: rebuilt.internalName || undefined,
        answerDisplayText: rebuilt.answerDisplayText,
        normalizedAnswer: normalized,
        keyMappings: toKeyMappings(rebuilt.mappings),
        encodedSymbols: [],
        optionKeys: rebuilt.options.map((o) => o.key),
        correctOptionKey: rebuilt.correctOptionKey,
        optionCopy,
        selectionWeight: rebuilt.selectionWeight,
        enabled: rebuilt.enabled,
      };
    }
  });
  return {
    titleCopy: { ar: bank.titleAr, en: bank.titleEn },
    instructionCopy: { ar: bank.instructionAr, en: bank.instructionEn },
    questions,
  };
}

export function symbolCipherClientPreview(
  bank: SymbolCipherStudioBank,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const q = regenerateSymbolCipherQuestion(
    bank.questions[0] ?? createSymbolCipherQuestion([]),
  );
  let encoded: CipherSymbolId[] = [];
  let keyMappings: Array<{ symbolId: CipherSymbolId; letter: string }> = [];
  try {
    const mappings = toKeyMappings(q.mappings);
    const normalized = normalizeArabicCipherText(q.answerDisplayText);
    if (arabicGraphemes(normalized).length === 5 && mappings.length === 5) {
      encoded = encodeSymbolCipherAnswer(normalized, mappings);
      keyMappings = mappings.map((m) => ({
        symbolId: m.symbolId,
        letter: m.letter,
      }));
      // Consistency check for studio operators.
      decodeSymbolCipherSequence(encoded, mappings);
    }
  } catch {
    /* preview stays partial until valid */
  }
  return {
    ...base,
    categoryKey: base.categoryKey ?? 'challenge.category.trivia',
    promptKey: base.promptKey ?? 'challenge.symbol_cipher.prompt',
    titleKey: base.titleKey ?? 'challenge.symbol_cipher.title',
    titleText: bank.titleAr,
    instructionText: bank.instructionAr,
    questionId: q.questionId,
    // Only pin round fields when complete — empty arrays fail .length(5) Zod checks.
    ...(keyMappings.length === 5 && encoded.length === 5
      ? { keyMappings, encodedSymbols: encoded }
      : {}),
    ...(q.options.length === 4
      ? {
          optionKeys: q.options.map((o) => o.key),
          optionTexts: Object.fromEntries(
            q.options.map((o) => [o.key, o.ar || o.key]),
          ),
        }
      : {}),
    backgroundAssetId: 'symbol_cipher_word.background',
    /** Admin-only preview marker — stripped before publish/player payloads. */
    _studioCorrectOptionKey: q.correctOptionKey,
  };
}

export function symbolCipherBankIssues(
  bank: SymbolCipherStudioBank,
): string[] {
  const issues: string[] = [];
  if (!bank.titleAr.trim()) issues.push('titleAr required');
  if (!bank.instructionAr.trim()) issues.push('instructionAr required');
  if (bank.questions.length === 0) issues.push('at least one question');
  for (const q of bank.questions) {
    const normalized = normalizeArabicCipherText(q.answerDisplayText);
    const graphemes = arabicGraphemes(normalized);
    if (graphemes.length !== 5) {
      issues.push(`${q.questionId}: answer must be exactly 5 Arabic graphemes`);
      continue;
    }
    try {
      const serialized = serializeSymbolCipherBank({
        ...bank,
        questions: [q],
      });
      const questions = serialized.questions as unknown[];
      if (!Array.isArray(questions) || questions.length !== 1) {
        issues.push(`${q.questionId}: failed to serialize`);
      }
    } catch (err) {
      issues.push(
        `${q.questionId}: ${err instanceof Error ? err.message : 'invalid'}`,
      );
    }
  }
  return issues;
}

/** Cipher questions are fixed at exactly four options. */
export function addSymbolCipherOption(
  question: SymbolCipherStudioQuestion,
): SymbolCipherStudioQuestion {
  return question;
}

export function removeSymbolCipherOption(
  question: SymbolCipherStudioQuestion,
  _key: string,
): SymbolCipherStudioQuestion {
  return question;
}

export const CIPHER_SYMBOL_OPTIONS = CIPHER_SYMBOL_IDS.map((id) => ({
  value: id,
  label: id,
}));
