export type TriviaLocaleCopy = { ar: string; en: string };

export type TriviaStudioOption = {
  key: string;
  ar: string;
  en: string;
};

export type TriviaStudioQuestion = {
  questionKey: string;
  questionAr: string;
  questionEn: string;
  options: TriviaStudioOption[];
  correctOptionKey: string;
};

/** Known launch-pack trivia strings so Studio can show copy without a catalog fetch. */
export const TRIVIA_COPY_PRESETS: Record<string, TriviaLocaleCopy> = {
  'trivia.q.japan_capital': {
    ar: 'ما عاصمة اليابان؟',
    en: 'What is the capital of Japan?',
  },
  'trivia.q.egypt_capital': {
    ar: 'ما عاصمة مصر؟',
    en: 'What is the capital of Egypt?',
  },
  'trivia.opt.osaka': { ar: 'أوساكا', en: 'Osaka' },
  'trivia.opt.tokyo': { ar: 'طوكيو', en: 'Tokyo' },
  'trivia.opt.seoul': { ar: 'سيول', en: 'Seoul' },
  'trivia.opt.kyoto': { ar: 'كيوتو', en: 'Kyoto' },
  'trivia.opt.cairo': { ar: 'القاهرة', en: 'Cairo' },
  'trivia.opt.alex': { ar: 'الإسكندرية', en: 'Alexandria' },
  'trivia.opt.giza': { ar: 'الجيزة', en: 'Giza' },
  'trivia.opt.aswan': { ar: 'أسوان', en: 'Aswan' },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function copyFor(
  key: string,
  stored?: { ar?: string; en?: string },
): TriviaLocaleCopy {
  const preset = TRIVIA_COPY_PRESETS[key];
  return {
    ar: stored?.ar ?? preset?.ar ?? '',
    en: stored?.en ?? preset?.en ?? '',
  };
}

function parseOptionCopy(
  raw: unknown,
): Record<string, { ar?: string; en?: string }> {
  const rec = asRecord(raw);
  if (!rec) return {};
  const out: Record<string, { ar?: string; en?: string }> = {};
  for (const [key, value] of Object.entries(rec)) {
    const copy = asRecord(value);
    if (!copy) continue;
    out[key] = {
      ar: typeof copy.ar === 'string' ? copy.ar : undefined,
      en: typeof copy.en === 'string' ? copy.en : undefined,
    };
  }
  return out;
}

function parseOneQuestion(raw: unknown): TriviaStudioQuestion | null {
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
  const optionCopy = parseOptionCopy(rec.optionCopy);
  const questionCopy = asRecord(rec.questionCopy);
  const qCopy = copyFor(questionKey, {
    ar: typeof questionCopy?.ar === 'string' ? questionCopy.ar : undefined,
    en: typeof questionCopy?.en === 'string' ? questionCopy.en : undefined,
  });
  const options = optionKeys.map((key) => {
    const opt = copyFor(key, optionCopy[key]);
    return { key, ar: opt.ar, en: opt.en };
  });
  const correct =
    typeof rec.correctOptionKey === 'string' &&
    optionKeys.includes(rec.correctOptionKey)
      ? rec.correctOptionKey
      : optionKeys[0]!;
  return {
    questionKey,
    questionAr: qCopy.ar,
    questionEn: qCopy.en,
    options,
    correctOptionKey: correct,
  };
}

export function defaultTriviaQuestions(): TriviaStudioQuestion[] {
  return [
    parseOneQuestion({
      questionKey: 'trivia.q.japan_capital',
      optionKeys: [
        'trivia.opt.osaka',
        'trivia.opt.tokyo',
        'trivia.opt.seoul',
        'trivia.opt.kyoto',
      ],
      correctOptionKey: 'trivia.opt.tokyo',
    })!,
    parseOneQuestion({
      questionKey: 'trivia.q.egypt_capital',
      optionKeys: [
        'trivia.opt.cairo',
        'trivia.opt.alex',
        'trivia.opt.giza',
        'trivia.opt.aswan',
      ],
      correctOptionKey: 'trivia.opt.cairo',
    })!,
  ];
}

export function parseTriviaQuestions(
  serverConfig: Record<string, unknown>,
): TriviaStudioQuestion[] {
  const raw = serverConfig.questions;
  if (Array.isArray(raw)) {
    const parsed = raw
      .map(parseOneQuestion)
      .filter((q): q is TriviaStudioQuestion => q != null);
    if (parsed.length > 0) return parsed;
  }
  const legacy = parseOneQuestion({
    questionKey: serverConfig.questionKey,
    optionKeys: serverConfig.optionKeys,
    correctOptionKey: serverConfig.correctOptionKey,
  });
  return legacy ? [legacy] : defaultTriviaQuestions();
}

function compactCopy(
  ar: string,
  en: string,
): { ar: string; en?: string } | undefined {
  if (!ar.trim() && !en.trim()) return undefined;
  return {
    ar: ar.trim() ? ar : en,
    ...(en.trim() ? { en } : {}),
  };
}

export function serializeTriviaQuestions(
  questions: TriviaStudioQuestion[],
): Array<Record<string, unknown>> {
  return questions.map((question) => {
    const optionKeys = question.options.map((o) => o.key);
    const optionCopy: Record<string, { ar: string; en?: string }> = {};
    for (const option of question.options) {
      const copy = compactCopy(option.ar, option.en);
      if (copy) optionCopy[option.key] = copy;
    }
    const questionCopy = compactCopy(question.questionAr, question.questionEn);
    const correct = optionKeys.includes(question.correctOptionKey)
      ? question.correctOptionKey
      : optionKeys[0];
    return {
      questionKey: question.questionKey,
      optionKeys,
      correctOptionKey: correct,
      ...(questionCopy ? { questionCopy } : {}),
      ...(Object.keys(optionCopy).length > 0 ? { optionCopy } : {}),
    };
  });
}

export function createTriviaQuestion(
  existing: TriviaStudioQuestion[],
): TriviaStudioQuestion {
  const slug = `custom_${existing.length + 1}_${Date.now().toString(36).slice(-4)}`;
  const optionKeys = ['a', 'b', 'c', 'd'].map((s) => `trivia.opt.${slug}_${s}`);
  return {
    questionKey: `trivia.q.${slug}`,
    questionAr: '',
    questionEn: '',
    options: optionKeys.map((key) => ({ key, ar: '', en: '' })),
    correctOptionKey: optionKeys[0]!,
  };
}

export function addTriviaOption(
  question: TriviaStudioQuestion,
): TriviaStudioQuestion {
  if (question.options.length >= 6) return question;
  const n = question.options.length + 1;
  const suffix = String.fromCharCode(96 + n);
  let key = `${question.questionKey.replace(/^trivia\.q\./, 'trivia.opt.')}_${suffix}`;
  const used = new Set(question.options.map((o) => o.key));
  let i = 0;
  while (used.has(key)) {
    i += 1;
    key = `${question.questionKey.replace(/^trivia\.q\./, 'trivia.opt.')}_${suffix}${i}`;
  }
  return {
    ...question,
    options: [...question.options, { key, ar: '', en: '' }],
  };
}

export function removeTriviaOption(
  question: TriviaStudioQuestion,
  optionKey: string,
): TriviaStudioQuestion {
  if (question.options.length <= 2) return question;
  const options = question.options.filter((o) => o.key !== optionKey);
  return {
    ...question,
    options,
    correctOptionKey: options.some((o) => o.key === question.correctOptionKey)
      ? question.correctOptionKey
      : options[0]!.key,
  };
}

export function triviaQuestionBankIssues(
  questions: TriviaStudioQuestion[],
): string[] {
  const issues: string[] = [];
  if (questions.length === 0) {
    issues.push('questions');
  }
  questions.forEach((question, index) => {
    if (!question.questionAr.trim()) {
      issues.push(`questions.${index}.questionAr`);
    }
    if (question.options.length < 2 || question.options.length > 6) {
      issues.push(`questions.${index}.options`);
    }
    for (const [optionIndex, option] of question.options.entries()) {
      if (!option.ar.trim()) {
        issues.push(`questions.${index}.options.${optionIndex}.ar`);
      }
    }
    if (!question.options.some((o) => o.key === question.correctOptionKey)) {
      issues.push(`questions.${index}.correctOptionKey`);
    }
  });
  return issues;
}

export function triviaClientPreview(
  question: TriviaStudioQuestion | undefined,
  clientConfig: Record<string, unknown>,
): Record<string, unknown> {
  if (!question) return clientConfig;
  return {
    ...clientConfig,
    questionKey: question.questionKey,
    optionKeys: question.options.map((o) => o.key),
  };
}
