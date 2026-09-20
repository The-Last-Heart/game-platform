import {
  VERTICAL_REFLECTION_INSTRUCTION_COPY,
  VERTICAL_REFLECTION_TEMPLATE_IDS,
  VERTICAL_REFLECTION_TITLE_COPY,
  assertVerticalReflectionQuestionSolvable,
  buildDefaultVerticalReflectionBank,
  buildVerticalReflectionQuestion,
  generateVerticalReflectionCandidates,
  getVerticalReflectionTemplate,
  listVerticalReflectionTemplateIds,
  materializeVerticalReflectionQuestion,
  type VerticalReflectionQuestion,
  type VerticalReflectionTemplateId,
} from '@thelastheart/contracts';

export type VerticalReflectionStudioQuestion = {
  questionId: string;
  internalName: string;
  templateId: VerticalReflectionTemplateId;
  generationSeed: string;
  sourceShape: VerticalReflectionQuestion['sourceShape'];
  sourceSide: 'left' | 'right';
  candidates: Array<{ id: string; shape: VerticalReflectionQuestion['sourceShape'] }>;
  correctCandidateId: string;
  titleAr: string;
  instructionAr: string;
  enabled: boolean;
  selectionWeight: number;
  difficulty: string;
  tags: string[];
  durationMs?: number;
};

export type VerticalReflectionStudioBank = {
  questions: VerticalReflectionStudioQuestion[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function localeAr(value: unknown, fallback: string): string {
  const rec = asRecord(value);
  if (rec && typeof rec.ar === 'string' && rec.ar.trim()) return rec.ar.trim();
  return fallback;
}

export function defaultVerticalReflectionBank(): VerticalReflectionStudioBank {
  return {
    questions: buildDefaultVerticalReflectionBank().questions.map((q) =>
      toStudioQuestion(q),
    ),
  };
}

function toStudioQuestion(
  q: VerticalReflectionQuestion & {
    candidates: Array<{ id: string; shape: VerticalReflectionQuestion['sourceShape'] }>;
    correctCandidateId: string;
  },
): VerticalReflectionStudioQuestion {
  return {
    questionId: q.questionId,
    internalName: q.internalName ?? q.templateId ?? q.questionId,
    templateId: (q.templateId ?? 'asymmetric_arrow_notch') as VerticalReflectionTemplateId,
    generationSeed: q.generationSeed,
    sourceShape: q.sourceShape,
    sourceSide: q.sourceSide ?? 'left',
    candidates: q.candidates,
    correctCandidateId: q.correctCandidateId,
    titleAr: localeAr(q.titleCopy, VERTICAL_REFLECTION_TITLE_COPY.ar),
    instructionAr: localeAr(
      q.instructionCopy,
      VERTICAL_REFLECTION_INSTRUCTION_COPY.ar,
    ),
    enabled: q.enabled !== false,
    selectionWeight: q.selectionWeight ?? 1,
    difficulty: q.difficulty ?? 'easy',
    tags: q.tags ?? [],
    durationMs: q.durationMs,
  };
}

export function parseVerticalReflectionBank(
  serverConfig: Record<string, unknown>,
): VerticalReflectionStudioBank {
  const raw = serverConfig.questions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultVerticalReflectionBank();
  }
  const questions: VerticalReflectionStudioQuestion[] = [];
  for (const entry of raw) {
    const rec = asRecord(entry);
    if (!rec) continue;
    try {
      const templateId = (typeof rec.templateId === 'string'
        ? rec.templateId
        : 'asymmetric_arrow_notch') as VerticalReflectionTemplateId;
      const seed =
        typeof rec.generationSeed === 'string' && rec.generationSeed
          ? rec.generationSeed
          : `studio-${String(rec.questionId ?? 'q')}`;
      const sourceShape =
        rec.sourceShape ?? getVerticalReflectionTemplate(templateId);
      const base = {
        questionId: String(rec.questionId ?? `vertical_reflection.q.${questions.length}`),
        internalName:
          typeof rec.internalName === 'string'
            ? rec.internalName
            : templateId,
        templateId,
        sourceShape,
        generatorVersion: 1,
        generationSeed: seed,
        sourceSide: rec.sourceSide === 'right' ? 'right' : 'left',
        titleCopy: {
          ar: localeAr(rec.titleCopy, VERTICAL_REFLECTION_TITLE_COPY.ar),
        },
        instructionCopy: {
          ar: localeAr(
            rec.instructionCopy,
            VERTICAL_REFLECTION_INSTRUCTION_COPY.ar,
          ),
        },
        enabled: rec.enabled !== false,
        selectionWeight:
          typeof rec.selectionWeight === 'number' ? rec.selectionWeight : 1,
        difficulty:
          typeof rec.difficulty === 'string' ? rec.difficulty : 'easy',
        tags: Array.isArray(rec.tags)
          ? rec.tags.filter((t): t is string => typeof t === 'string')
          : [],
        durationMs:
          typeof rec.durationMs === 'number' ? rec.durationMs : undefined,
        candidates: Array.isArray(rec.candidates)
          ? (rec.candidates as VerticalReflectionStudioQuestion['candidates'])
          : undefined,
        correctCandidateId:
          typeof rec.correctCandidateId === 'string'
            ? rec.correctCandidateId
            : undefined,
      } as VerticalReflectionQuestion;
      const materialized = materializeVerticalReflectionQuestion(base);
      questions.push(toStudioQuestion(materialized));
    } catch {
      // Skip malformed draft rows; editor can regenerate.
    }
  }
  return questions.length > 0
    ? { questions }
    : defaultVerticalReflectionBank();
}

export function serializeVerticalReflectionBank(
  bank: VerticalReflectionStudioBank,
): Record<string, unknown> {
  return {
    questions: bank.questions.map((q) => ({
      questionId: q.questionId,
      internalName: q.internalName,
      templateId: q.templateId,
      generationSeed: q.generationSeed,
      sourceShape: q.sourceShape,
      sourceSide: q.sourceSide,
      generatorVersion: 1,
      candidates: q.candidates,
      correctCandidateId: q.correctCandidateId,
      titleCopy: { ar: q.titleAr, en: VERTICAL_REFLECTION_TITLE_COPY.en },
      instructionCopy: {
        ar: q.instructionAr,
        en: VERTICAL_REFLECTION_INSTRUCTION_COPY.en,
      },
      enabled: q.enabled,
      selectionWeight: q.selectionWeight,
      difficulty: q.difficulty,
      tags: q.tags,
      ...(q.durationMs != null ? { durationMs: q.durationMs } : {}),
    })),
  };
}

export function verticalReflectionClientPreview(
  bank: VerticalReflectionStudioBank,
  baseClient: Record<string, unknown>,
  activeIndex = 0,
  options?: { adminDiagnostics?: boolean },
): Record<string, unknown> {
  const q =
    bank.questions[Math.min(activeIndex, bank.questions.length - 1)] ??
    bank.questions[0];
  if (!q) return { ...baseClient };
  const preview: Record<string, unknown> = {
    ...baseClient,
    categoryKey: 'challenge.category.focus',
    promptKey: 'challenge.vertical_reflection.prompt',
    titleKey: 'challenge.vertical_reflection.title',
    instructionKey: 'challenge.vertical_reflection.instruction',
    titleText: q.titleAr,
    instructionText: q.instructionAr,
    questionId: q.questionId,
    sourceShape: q.sourceShape,
    sourceSide: q.sourceSide,
    candidates: q.candidates,
    optionKeys: q.candidates.map((c) => c.id),
  };
  if (options?.adminDiagnostics) {
    preview.adminCorrectCandidateId = q.correctCandidateId;
    preview.adminTemplateId = q.templateId;
    preview.adminGenerationSeed = q.generationSeed;
  }
  delete preview.correctCandidateId;
  delete preview.correctOptionKey;
  return preview;
}

export function createVerticalReflectionQuestion(
  existing: VerticalReflectionStudioQuestion[],
  templateId?: VerticalReflectionTemplateId,
): VerticalReflectionStudioQuestion {
  const ids = listVerticalReflectionTemplateIds();
  const pick =
    templateId ??
    ids[existing.length % ids.length] ??
    'asymmetric_arrow_notch';
  const questionId = `vertical_reflection.q.${pick}.${existing.length + 1}`;
  const built = buildVerticalReflectionQuestion({
    questionId,
    templateId: pick,
    generationSeed: `studio-${questionId}-${Date.now()}`,
    internalName: pick,
  });
  return toStudioQuestion(built);
}

export function duplicateVerticalReflectionQuestion(
  question: VerticalReflectionStudioQuestion,
  existing: VerticalReflectionStudioQuestion[],
): VerticalReflectionStudioQuestion {
  const questionId = `${question.questionId}.copy.${existing.length + 1}`;
  const built = buildVerticalReflectionQuestion({
    questionId,
    templateId: question.templateId,
    generationSeed: `${question.generationSeed}-copy`,
    internalName: `${question.internalName} (copy)`,
    difficulty: question.difficulty,
    selectionWeight: question.selectionWeight,
    tags: question.tags,
    titleCopy: { ar: question.titleAr },
    instructionCopy: { ar: question.instructionAr },
  });
  return toStudioQuestion(built);
}

export function regenerateVerticalReflectionQuestion(
  question: VerticalReflectionStudioQuestion,
  options?: { newSeed?: string; templateId?: VerticalReflectionTemplateId },
): VerticalReflectionStudioQuestion {
  const templateId = options?.templateId ?? question.templateId;
  const seed = options?.newSeed ?? `${question.generationSeed}-regen`;
  const sourceShape = getVerticalReflectionTemplate(templateId);
  const generated = generateVerticalReflectionCandidates({
    sourceShape,
    generationSeed: seed,
    optionIdPrefix: `vr.${question.questionId}`,
  });
  return {
    ...question,
    templateId,
    generationSeed: seed,
    sourceShape,
    candidates: generated.candidates.map((c) => ({
      id: c.id,
      shape: c.shape,
    })),
    correctCandidateId: generated.correctCandidateId,
  };
}

export function verticalReflectionPublishIssues(
  bank: VerticalReflectionStudioBank,
): string[] {
  const issues: string[] = [];
  if (bank.questions.length === 0) {
    issues.push('at least one question is required');
  }
  const enabled = bank.questions.filter((q) => q.enabled);
  if (enabled.length === 0) {
    issues.push('at least one enabled question is required');
  }
  for (const q of enabled) {
    try {
      assertVerticalReflectionQuestionSolvable({
        questionId: q.questionId,
        templateId: q.templateId,
        sourceShape: q.sourceShape,
        generationSeed: q.generationSeed,
        sourceSide: q.sourceSide,
        candidates: q.candidates,
        correctCandidateId: q.correctCandidateId,
        titleCopy: { ar: q.titleAr },
        instructionCopy: { ar: q.instructionAr },
        enabled: true,
        generatorVersion: 1,
      });
    } catch (err) {
      issues.push(
        `${q.questionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  const templateSet = new Set(enabled.map((q) => q.templateId));
  if (
    enabled.length >= 2 &&
    templateSet.size === 1 &&
    templateSet.has('asymmetric_arrow_notch')
  ) {
    issues.push('bank must not be arrow-only — add other shape families');
  }
  if (VERTICAL_REFLECTION_TEMPLATE_IDS.length < 12) {
    issues.push('catalog must expose at least 12 templates');
  }
  return issues;
}

export function availableVerticalReflectionTemplates(): VerticalReflectionTemplateId[] {
  return listVerticalReflectionTemplateIds();
}
