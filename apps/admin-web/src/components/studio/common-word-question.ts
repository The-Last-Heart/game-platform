import type { CommonWordVisualHint } from '@thelastheart/contracts';
import { COMMON_WORD_VISUAL_HINTS } from '@thelastheart/contracts';
import type { TriviaStudioOption } from './trivia-question-bank';
import {
  addTriviaOption,
  removeTriviaOption,
} from './trivia-question-bank';

export type CommonWordStudioClue = {
  clueId: string;
  textAr: string;
  textEn: string;
  relationshipAr: string;
  relationshipEn: string;
  visualHint: CommonWordVisualHint | '';
};

export type CommonWordStudioQuestion = {
  questionKey: string;
  clues: [CommonWordStudioClue, CommonWordStudioClue, CommonWordStudioClue];
  options: TriviaStudioOption[];
  correctOptionKey: string;
};

export type CommonWordStudioBank = {
  titleAr: string;
  titleEn: string;
  instructionAr: string;
  instructionEn: string;
  questions: CommonWordStudioQuestion[];
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

function parseVisualHint(raw: unknown): CommonWordVisualHint | '' {
  if (typeof raw !== 'string') return '';
  return (COMMON_WORD_VISUAL_HINTS as readonly string[]).includes(raw)
    ? (raw as CommonWordVisualHint)
    : '';
}

function defaultClue(index: number, prefix = 'clue'): CommonWordStudioClue {
  return {
    clueId: `${prefix}.${index + 1}`,
    textAr: '',
    textEn: '',
    relationshipAr: '',
    relationshipEn: '',
    visualHint: '',
  };
}

export function createCommonWordQuestion(
  existing: CommonWordStudioQuestion[],
): CommonWordStudioQuestion {
  const slug = `custom_${existing.length + 1}_${Date.now().toString(36).slice(-4)}`;
  const optionKeys = ['a', 'b', 'c', 'd'].map(
    (s) => `common_word.opt.${slug}_${s}`,
  );
  return {
    questionKey: `common_word.q.${slug}`,
    clues: [
      defaultClue(0, `clue.${slug}`),
      defaultClue(1, `clue.${slug}`),
      defaultClue(2, `clue.${slug}`),
    ],
    options: optionKeys.map((key) => ({ key, ar: '', en: '' })),
    correctOptionKey: optionKeys[0]!,
  };
}

export function defaultCommonWordQuestions(): CommonWordStudioQuestion[] {
  return [createCommonWordQuestion([])];
}

export function defaultCommonWordBank(): CommonWordStudioBank {
  return {
    titleAr: 'الكلمة المشتركة',
    titleEn: 'The Common Word',
    instructionAr: 'اختر كلمة ترتبط بالعبارات الثلاث',
    instructionEn: 'Choose a word related to the three phrases',
    questions: defaultCommonWordQuestions(),
  };
}

function parseClue(raw: unknown, index: number): CommonWordStudioClue {
  const rec = asRecord(raw);
  if (!rec) return defaultClue(index);
  const text = localeCopy(rec.textCopy);
  const relationship = localeCopy(rec.relationshipCopy);
  const clueId =
    typeof rec.clueId === 'string' && rec.clueId.trim()
      ? rec.clueId.trim()
      : `clue.${index + 1}`;
  return {
    clueId,
    textAr: text.ar,
    textEn: text.en,
    relationshipAr: relationship.ar,
    relationshipEn: relationship.en,
    visualHint: parseVisualHint(rec.visualHint),
  };
}

function parseOneQuestion(raw: unknown): CommonWordStudioQuestion | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const questionKey =
    typeof rec.questionKey === 'string' ? rec.questionKey.trim() : '';
  const optionKeys = Array.isArray(rec.optionKeys)
    ? rec.optionKeys.filter(
        (k): k is string => typeof k === 'string' && k.trim().length > 0,
      )
    : [];
  if (!questionKey || optionKeys.length < 2) return null;
  const rawClues = Array.isArray(rec.clues) ? rec.clues : [];
  const clues: CommonWordStudioQuestion['clues'] = [
    parseClue(rawClues[0], 0),
    parseClue(rawClues[1], 1),
    parseClue(rawClues[2], 2),
  ];
  const optionCopy = asRecord(rec.optionCopy) ?? {};
  const options: TriviaStudioOption[] = optionKeys.map((key) => {
    const copy = localeCopy(optionCopy[key]);
    return { key, ar: copy.ar, en: copy.en };
  });
  const correct =
    typeof rec.correctOptionKey === 'string' &&
    optionKeys.includes(rec.correctOptionKey)
      ? rec.correctOptionKey
      : optionKeys[0]!;
  return {
    questionKey,
    clues,
    options,
    correctOptionKey: correct,
  };
}

/** Supports bank (`questions[]`) and legacy single-question serverConfig. */
export function parseCommonWordBank(
  serverConfig: Record<string, unknown>,
): CommonWordStudioBank {
  const title = localeCopy(serverConfig.titleCopy);
  const instruction = localeCopy(serverConfig.instructionCopy);
  const raw = serverConfig.questions;
  let questions: CommonWordStudioQuestion[] = [];
  if (Array.isArray(raw)) {
    questions = raw
      .map(parseOneQuestion)
      .filter((q): q is CommonWordStudioQuestion => q != null);
  }
  if (questions.length === 0) {
    const legacy = parseOneQuestion({
      questionKey: serverConfig.questionKey,
      clues: serverConfig.clues,
      optionKeys: serverConfig.optionKeys,
      correctOptionKey: serverConfig.correctOptionKey,
      optionCopy: serverConfig.optionCopy,
    });
    if (legacy) questions = [legacy];
  }
  if (questions.length === 0) {
    return defaultCommonWordBank();
  }
  return {
    titleAr: title.ar || 'الكلمة المشتركة',
    titleEn: title.en || 'The Common Word',
    instructionAr: instruction.ar || 'اختر كلمة ترتبط بالعبارات الثلاث',
    instructionEn:
      instruction.en || 'Choose a word related to the three phrases',
    questions,
  };
}

/** @deprecated Use parseCommonWordBank — kept for callers expecting one question. */
export function parseCommonWordQuestion(
  serverConfig: Record<string, unknown>,
): CommonWordStudioQuestion {
  return parseCommonWordBank(serverConfig).questions[0]!;
}

export function serializeCommonWordBank(
  bank: CommonWordStudioBank,
): Record<string, unknown> {
  return {
    titleCopy: { ar: bank.titleAr, en: bank.titleEn },
    instructionCopy: {
      ar: bank.instructionAr,
      en: bank.instructionEn,
    },
    questions: bank.questions.map((question) => {
      const optionKeys = question.options.map((o) => o.key);
      const optionCopy: Record<string, { ar: string; en: string }> = {};
      for (const option of question.options) {
        optionCopy[option.key] = { ar: option.ar, en: option.en };
      }
      const correct = optionKeys.includes(question.correctOptionKey)
        ? question.correctOptionKey
        : optionKeys[0];
      return {
        questionKey: question.questionKey,
        clues: question.clues.map((clue) => {
          const entry: Record<string, unknown> = {
            clueId: clue.clueId,
            textCopy: { ar: clue.textAr, en: clue.textEn },
            relationshipCopy: {
              ar: clue.relationshipAr,
              en: clue.relationshipEn,
            },
          };
          if (clue.visualHint) entry.visualHint = clue.visualHint;
          return entry;
        }),
        optionKeys,
        correctOptionKey: correct,
        optionCopy,
      };
    }),
  };
}

export function serializeCommonWordQuestion(
  question: CommonWordStudioQuestion,
): Record<string, unknown> {
  return serializeCommonWordBank({
    ...defaultCommonWordBank(),
    questions: [question],
  });
}

export function commonWordClientPreview(
  bank: CommonWordStudioBank,
  clientConfig: Record<string, unknown>,
): Record<string, unknown> {
  const question = bank.questions[0];
  if (!question) return clientConfig;
  return {
    ...clientConfig,
    categoryKey: clientConfig.categoryKey ?? 'challenge.category.trivia',
    promptKey: clientConfig.promptKey ?? 'challenge.common_word.prompt',
    titleKey: clientConfig.titleKey ?? 'challenge.common_word.title',
    titleText: bank.titleAr.trim() || 'الكلمة المشتركة',
    instructionText:
      bank.instructionAr.trim() || 'اختر كلمة ترتبط بالعبارات الثلاث',
    questionKey: question.questionKey,
    clues: question.clues.map((clue) => {
      const entry: Record<string, unknown> = {
        id: clue.clueId,
        text: clue.textAr.trim() || '—',
      };
      if (clue.visualHint) entry.visualHint = clue.visualHint;
      return entry;
    }),
    optionKeys: question.options.map((o) => o.key),
    optionTexts: Object.fromEntries(
      question.options.map((o) => [o.key, o.ar.trim() || o.key]),
    ),
  };
}

export function commonWordBankSignature(bank: CommonWordStudioBank): string {
  return [
    bank.titleAr,
    bank.instructionAr,
    ...bank.questions.map(
      (q) =>
        `${q.questionKey}:${q.correctOptionKey}:${q.clues
          .map((c) => `${c.clueId}:${c.textAr}:${c.relationshipAr}`)
          .join('|')}:${q.options.map((o) => `${o.key}:${o.ar}`).join(',')}`,
    ),
  ].join('::');
}

export function commonWordQuestionSignature(
  question: CommonWordStudioQuestion,
): string {
  return commonWordBankSignature({
    ...defaultCommonWordBank(),
    questions: [question],
  });
}

export function commonWordBankIssues(bank: CommonWordStudioBank): string[] {
  const issues: string[] = [];
  if (!bank.titleAr.trim()) issues.push('titleAr');
  if (!bank.instructionAr.trim()) issues.push('instructionAr');
  if (bank.questions.length === 0) issues.push('questions');
  bank.questions.forEach((question, qIndex) => {
    if (question.options.length < 2 || question.options.length > 6) {
      issues.push(`questions.${qIndex}.options`);
    }
    const clueTexts = question.clues.map((c) =>
      c.textAr.trim().replace(/\s+/g, ' '),
    );
    question.clues.forEach((clue, index) => {
      if (!clue.textAr.trim()) {
        issues.push(`questions.${qIndex}.clues.${index}.textAr`);
      }
      if (!clue.relationshipAr.trim()) {
        issues.push(`questions.${qIndex}.clues.${index}.relationshipAr`);
      }
    });
    if (
      new Set(clueTexts.filter(Boolean)).size !==
      clueTexts.filter(Boolean).length
    ) {
      issues.push(`questions.${qIndex}.clues.duplicate`);
    }
    const optionTexts = question.options.map((o) =>
      o.ar.trim().replace(/\s+/g, ' '),
    );
    for (const [i, option] of question.options.entries()) {
      if (!option.ar.trim()) issues.push(`questions.${qIndex}.options.${i}.ar`);
    }
    if (
      new Set(optionTexts.filter(Boolean)).size !==
      optionTexts.filter(Boolean).length
    ) {
      issues.push(`questions.${qIndex}.options.duplicate`);
    }
    if (!question.options.some((o) => o.key === question.correctOptionKey)) {
      issues.push(`questions.${qIndex}.correctOptionKey`);
    }
  });
  return issues;
}

export function commonWordQuestionIssues(
  question: CommonWordStudioQuestion,
): string[] {
  return commonWordBankIssues({
    ...defaultCommonWordBank(),
    questions: [question],
  });
}

export function addCommonWordOption(
  question: CommonWordStudioQuestion,
): CommonWordStudioQuestion {
  const next = addTriviaOption({
    questionKey: question.questionKey.replace(/^common_word\.q\./, 'trivia.q.'),
    questionAr: '',
    questionEn: '',
    options: question.options,
    correctOptionKey: question.correctOptionKey,
  });
  return {
    ...question,
    options: next.options.map((o) => ({
      ...o,
      key: o.key.replace(/^trivia\.opt\./, 'common_word.opt.'),
    })),
    correctOptionKey: next.correctOptionKey.replace(
      /^trivia\.opt\./,
      'common_word.opt.',
    ),
  };
}

export function removeCommonWordOption(
  question: CommonWordStudioQuestion,
  optionKey: string,
): CommonWordStudioQuestion {
  const next = removeTriviaOption(
    {
      questionKey: question.questionKey,
      questionAr: '',
      questionEn: '',
      options: question.options,
      correctOptionKey: question.correctOptionKey,
    },
    optionKey,
  );
  return {
    ...question,
    options: next.options,
    correctOptionKey: next.correctOptionKey,
  };
}

export const COMMON_WORD_HINT_OPTIONS: readonly {
  value: CommonWordVisualHint | '';
  labelKey: string;
}[] = [
  { value: '', labelKey: 'fp.commonWordHintNone' },
  ...COMMON_WORD_VISUAL_HINTS.map((value) => ({
    value,
    labelKey: `fp.commonWordHint.${value}`,
  })),
];
