import { describe, expect, it } from 'vitest';
import {
  THREE_DOORS_REFERENCE_QUESTION,
  solveThreeDoorsQuestion,
} from '@thelastheart/contracts';
import {
  createThreeDoorsQuestion,
  defaultThreeDoorsBank,
  duplicateThreeDoorsQuestion,
  parseThreeDoorsBank,
  serializeThreeDoorsBank,
  statementPreview,
  threeDoorsPublishIssues,
  updatePredicateKind,
} from './three-doors-question';

describe('three-doors studio bank', () => {
  it('creates, duplicates, and serializes multiple questions', () => {
    const bank = defaultThreeDoorsBank();
    const created = createThreeDoorsQuestion(bank.questions);
    const copy = duplicateThreeDoorsQuestion(created, [
      ...bank.questions,
      created,
    ]);
    const next = {
      questions: [...bank.questions, created, copy],
    };
    const serialized = serializeThreeDoorsBank(next);
    const parsed = parseThreeDoorsBank(serialized);
    expect(parsed.questions).toHaveLength(3);
    expect(parsed.questions[0]?.questionId).toBe(
      THREE_DOORS_REFERENCE_QUESTION.questionId,
    );
  });

  it('previews every predicate kind and solves the reference question', () => {
    expect(statementPreview({ kind: 'is_not_here' }, 'ar')).toBe(
      'المفتاح ليس هنا',
    );
    expect(
      statementPreview(updatePredicateKind({ kind: 'is_here' }, 'is'), 'en'),
    ).toContain('door');
    const report = solveThreeDoorsQuestion(THREE_DOORS_REFERENCE_QUESTION);
    expect(report.derivedDoorId).toBe('B');
    expect(threeDoorsPublishIssues(defaultThreeDoorsBank())).toEqual([]);
  });

  it('rejects ambiguous publish candidates', () => {
    const bad = {
      questions: [
        {
          ...createThreeDoorsQuestion([]),
          statements: [
            { doorId: 'A' as const, predicate: { kind: 'is_here' as const } },
            { doorId: 'B' as const, predicate: { kind: 'is_here' as const } },
            { doorId: 'C' as const, predicate: { kind: 'is_here' as const } },
          ],
          correctDoorId: 'A' as const,
        },
      ],
    };
    expect(threeDoorsPublishIssues(bad).length).toBeGreaterThan(0);
  });
});
