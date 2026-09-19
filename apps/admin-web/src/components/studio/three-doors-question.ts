import {
  DOOR_IDS,
  THREE_DOORS_REFERENCE_QUESTION,
  assertThreeDoorsQuestionUnique,
  renderDoorPredicateStatement,
  solveThreeDoorsQuestion,
  threeDoorsInstructionText,
  threeDoorsStatementMayOverflow,
  type DoorId,
  type DoorPredicate,
  type DoorTruthRule,
  type ThreeDoorsQuestion,
  type ThreeDoorsSolveReport,
} from '@thelastheart/contracts';

export type ThreeDoorsStudioQuestion = {
  questionId: string;
  internalName: string;
  truthRule: DoorTruthRule;
  statements: [
    { doorId: 'A'; predicate: DoorPredicate },
    { doorId: 'B'; predicate: DoorPredicate },
    { doorId: 'C'; predicate: DoorPredicate },
  ];
  correctDoorId: DoorId;
  enabled: boolean;
  selectionWeight: number;
  difficulty: string;
  tags: string[];
};

export type ThreeDoorsStudioBank = {
  questions: ThreeDoorsStudioQuestion[];
};

const PREDICATE_KINDS = [
  'is_here',
  'is_not_here',
  'is',
  'is_not',
  'is_one_of',
  'is_not_one_of',
] as const;

export type DoorPredicateKind = (typeof PREDICATE_KINDS)[number];

export const DOOR_PREDICATE_KIND_OPTIONS: readonly DoorPredicateKind[] =
  PREDICATE_KINDS;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function defaultPredicate(): DoorPredicate {
  return { kind: 'is_not_here' };
}

export function createThreeDoorsQuestion(
  existing: ThreeDoorsStudioQuestion[],
): ThreeDoorsStudioQuestion {
  const slug = `custom_${existing.length + 1}_${Date.now().toString(36).slice(-4)}`;
  return {
    questionId: `three_doors.q.${slug}`,
    internalName: `Question ${existing.length + 1}`,
    truthRule: 'exactly_one_true',
    statements: [
      { doorId: 'A', predicate: defaultPredicate() },
      { doorId: 'B', predicate: { kind: 'is', doorId: 'A' } },
      { doorId: 'C', predicate: { kind: 'is_not', doorId: 'B' } },
    ],
    correctDoorId: 'B',
    enabled: true,
    selectionWeight: 1,
    difficulty: 'medium',
    tags: [],
  };
}

export function defaultThreeDoorsBank(): ThreeDoorsStudioBank {
  const ref = THREE_DOORS_REFERENCE_QUESTION;
  return {
    questions: [
      {
        questionId: ref.questionId,
        internalName: ref.internalName ?? 'Reference',
        truthRule: ref.truthRule,
        statements: [
          { doorId: 'A', predicate: ref.statements[0].predicate },
          { doorId: 'B', predicate: ref.statements[1].predicate },
          { doorId: 'C', predicate: ref.statements[2].predicate },
        ],
        correctDoorId: ref.correctDoorId,
        enabled: true,
        selectionWeight: 1,
        difficulty: 'medium',
        tags: [],
      },
    ],
  };
}

function parsePredicate(raw: unknown): DoorPredicate {
  const rec = asRecord(raw);
  if (!rec || typeof rec.kind !== 'string') return defaultPredicate();
  const kind = rec.kind as DoorPredicateKind;
  if (kind === 'is_here' || kind === 'is_not_here') {
    return { kind };
  }
  if (kind === 'is' || kind === 'is_not') {
    const doorId =
      rec.doorId === 'A' || rec.doorId === 'B' || rec.doorId === 'C'
        ? rec.doorId
        : 'A';
    return { kind, doorId };
  }
  if (kind === 'is_one_of' || kind === 'is_not_one_of') {
    const ids = Array.isArray(rec.doorIds) ? rec.doorIds : [];
    const a =
      ids[0] === 'A' || ids[0] === 'B' || ids[0] === 'C' ? ids[0] : 'A';
    const b =
      ids[1] === 'A' || ids[1] === 'B' || ids[1] === 'C' ? ids[1] : 'B';
    return { kind, doorIds: [a, b] };
  }
  return defaultPredicate();
}

function parseOneQuestion(raw: unknown): ThreeDoorsStudioQuestion | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const questionId =
    typeof rec.questionId === 'string' ? rec.questionId.trim() : '';
  if (!questionId) return null;
  const statementsRaw = Array.isArray(rec.statements) ? rec.statements : [];
  const statements: ThreeDoorsStudioQuestion['statements'] = [
    {
      doorId: 'A',
      predicate: parsePredicate(asRecord(statementsRaw[0])?.predicate),
    },
    {
      doorId: 'B',
      predicate: parsePredicate(asRecord(statementsRaw[1])?.predicate),
    },
    {
      doorId: 'C',
      predicate: parsePredicate(asRecord(statementsRaw[2])?.predicate),
    },
  ];
  const correct =
    rec.correctDoorId === 'A' ||
    rec.correctDoorId === 'B' ||
    rec.correctDoorId === 'C'
      ? rec.correctDoorId
      : 'A';
  const truthRule: DoorTruthRule =
    rec.truthRule === 'exactly_one_false'
      ? 'exactly_one_false'
      : 'exactly_one_true';
  const tags = Array.isArray(rec.tags)
    ? rec.tags.filter((t): t is string => typeof t === 'string')
    : [];
  return {
    questionId,
    internalName:
      typeof rec.internalName === 'string' ? rec.internalName : questionId,
    truthRule,
    statements,
    correctDoorId: correct,
    enabled: rec.enabled !== false,
    selectionWeight:
      typeof rec.selectionWeight === 'number' && rec.selectionWeight > 0
        ? rec.selectionWeight
        : 1,
    difficulty:
      typeof rec.difficulty === 'string' && rec.difficulty
        ? rec.difficulty
        : 'medium',
    tags,
  };
}

export function parseThreeDoorsBank(
  serverConfig: Record<string, unknown>,
): ThreeDoorsStudioBank {
  const raw = serverConfig.questions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultThreeDoorsBank();
  }
  const questions = raw
    .map(parseOneQuestion)
    .filter((q): q is ThreeDoorsStudioQuestion => q != null);
  return { questions: questions.length > 0 ? questions : defaultThreeDoorsBank().questions };
}

export function serializeThreeDoorsBank(
  bank: ThreeDoorsStudioBank,
): Record<string, unknown> {
  return {
    questions: bank.questions.map((q) => ({
      questionId: q.questionId,
      internalName: q.internalName,
      truthRule: q.truthRule,
      statements: q.statements,
      correctDoorId: q.correctDoorId,
      enabled: q.enabled,
      selectionWeight: q.selectionWeight,
      difficulty: q.difficulty,
      ...(q.tags.length > 0 ? { tags: q.tags } : {}),
    })),
  };
}

export function threeDoorsClientPreview(
  bank: ThreeDoorsStudioBank,
  base: Record<string, unknown>,
  questionIndex = 0,
): Record<string, unknown> {
  const question = bank.questions[questionIndex] ?? bank.questions[0];
  if (!question) return base;
  return {
    ...base,
    titleKey: 'challenge.three_doors.title',
    titleText: 'باب الحقيقة',
    instructionText: threeDoorsInstructionText(question.truthRule, 'ar'),
    instructionKey: `challenge.three_doors.instruction.${question.truthRule}`,
    truthRule: question.truthRule,
    questionId: question.questionId,
    doors: DOOR_IDS.map((id, index) => ({
      id,
      statement: renderDoorPredicateStatement(
        question.statements[index]!.predicate,
        'ar',
      ),
    })),
    roomAssetId: 'three_doors.room',
  };
}

export function solveStudioQuestion(
  question: ThreeDoorsStudioQuestion,
): ThreeDoorsSolveReport {
  return solveThreeDoorsQuestion(question);
}

export function syncCorrectDoorFromSolver(
  question: ThreeDoorsStudioQuestion,
): ThreeDoorsStudioQuestion {
  const report = solveThreeDoorsQuestion(question);
  if (report.unique && report.derivedDoorId) {
    return { ...question, correctDoorId: report.derivedDoorId };
  }
  return question;
}

export function threeDoorsPublishIssues(
  bank: ThreeDoorsStudioBank,
): string[] {
  const issues: string[] = [];
  const enabled = bank.questions.filter((q) => q.enabled);
  if (enabled.length === 0) {
    issues.push('no_enabled_questions');
    return issues;
  }
  for (const question of enabled) {
    try {
      assertThreeDoorsQuestionUnique(question as ThreeDoorsQuestion);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'invalid_question';
      issues.push(`${question.questionId}:${message}`);
    }
    for (const statement of question.statements) {
      const text = renderDoorPredicateStatement(statement.predicate, 'ar');
      if (threeDoorsStatementMayOverflow(text)) {
        issues.push(`${question.questionId}:statement_overflow_${statement.doorId}`);
      }
    }
  }
  return issues;
}

export function duplicateThreeDoorsQuestion(
  source: ThreeDoorsStudioQuestion,
  existing: ThreeDoorsStudioQuestion[],
): ThreeDoorsStudioQuestion {
  const slug = `copy_${Date.now().toString(36).slice(-4)}`;
  return {
    ...source,
    questionId: `${source.questionId}.${slug}`,
    internalName: `${source.internalName} (copy)`,
  };
}

export function updatePredicateKind(
  predicate: DoorPredicate,
  kind: DoorPredicateKind,
): DoorPredicate {
  switch (kind) {
    case 'is_here':
    case 'is_not_here':
      return { kind };
    case 'is':
    case 'is_not':
      return {
        kind,
        doorId:
          predicate.kind === 'is' || predicate.kind === 'is_not'
            ? predicate.doorId
            : 'A',
      };
    case 'is_one_of':
    case 'is_not_one_of':
      return {
        kind,
        doorIds:
          predicate.kind === 'is_one_of' || predicate.kind === 'is_not_one_of'
            ? predicate.doorIds
            : ['A', 'B'],
      };
  }
}

export function statementPreview(
  predicate: DoorPredicate,
  locale: 'ar' | 'en' = 'ar',
): string {
  return renderDoorPredicateStatement(predicate, locale);
}
