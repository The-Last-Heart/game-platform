import {
  THREE_DOORS_REFERENCE_QUESTION,
  assertThreeDoorsQuestionUnique,
  buildThreeDoorsPublicDoors,
  evaluateDoorPredicate,
  renderDoorPredicateStatement,
  solveThreeDoorsQuestion,
  threeDoorsInstructionText,
  validateEngineConfigs,
  type DoorId,
  type DoorPredicate,
  type ThreeDoorsQuestion,
} from '@thelastheart/contracts';
import { toPublicChallengeView } from '../match.engine';
import type { ChallengeDefinition, ChallengeRound } from '../types';
import {
  LogicThreeDoorsEvaluator,
  materializePack31Round,
} from './pack-31-evaluators';

function threeDoorsDefinition(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return {
    definitionId: 'logic.three_doors.test',
    definitionVersion: 1,
    engineId: 'logic.three_doors',
    durationMs: 12000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.three_doors.intro',
    choiceKeys: [],
    clientConfig: {
      categoryKey: 'challenge.category.logic',
      promptKey: 'challenge.three_doors.prompt',
      titleKey: 'challenge.three_doors.title',
    },
    serverConfig: {
      questions: [
        THREE_DOORS_REFERENCE_QUESTION,
        {
          questionId: 'three_doors.q.exactly_one_false_sample',
          truthRule: 'exactly_one_false',
          statements: [
            { doorId: 'A', predicate: { kind: 'is_here' } },
            { doorId: 'B', predicate: { kind: 'is_not_here' } },
            { doorId: 'C', predicate: { kind: 'is', doorId: 'B' } },
          ],
          correctDoorId: 'A',
          enabled: true,
        },
      ],
    },
    ...overrides,
  };
}

describe('logic.three_doors', () => {
  it('evaluates every predicate against A/B/C', () => {
    const cases: Array<{
      predicate: DoorPredicate;
      statementDoor: DoorId;
      expected: Record<DoorId, boolean>;
    }> = [
      {
        predicate: { kind: 'is_here' },
        statementDoor: 'A',
        expected: { A: true, B: false, C: false },
      },
      {
        predicate: { kind: 'is_not_here' },
        statementDoor: 'A',
        expected: { A: false, B: true, C: true },
      },
      {
        predicate: { kind: 'is', doorId: 'B' },
        statementDoor: 'A',
        expected: { A: false, B: true, C: false },
      },
      {
        predicate: { kind: 'is_not', doorId: 'B' },
        statementDoor: 'A',
        expected: { A: true, B: false, C: true },
      },
      {
        predicate: { kind: 'is_one_of', doorIds: ['A', 'C'] },
        statementDoor: 'B',
        expected: { A: true, B: false, C: true },
      },
      {
        predicate: { kind: 'is_not_one_of', doorIds: ['A', 'C'] },
        statementDoor: 'B',
        expected: { A: false, B: true, C: false },
      },
    ];
    for (const entry of cases) {
      for (const key of ['A', 'B', 'C'] as const) {
        expect(
          evaluateDoorPredicate(entry.predicate, entry.statementDoor, key),
        ).toBe(entry.expected[key]);
      }
    }
  });

  it('solves the reference question as B', () => {
    const report = solveThreeDoorsQuestion(THREE_DOORS_REFERENCE_QUESTION);
    expect(report.unique).toBe(true);
    expect(report.derivedDoorId).toBe('B');
    expect(assertThreeDoorsQuestionUnique(THREE_DOORS_REFERENCE_QUESTION).derivedDoorId).toBe(
      'B',
    );
  });

  it('rejects impossible, ambiguous, and mismatched answers', () => {
    expect(() =>
      assertThreeDoorsQuestionUnique({
        questionId: 'three_doors.q.impossible',
        truthRule: 'exactly_one_true',
        statements: [
          { doorId: 'A', predicate: { kind: 'is_not_here' } },
          { doorId: 'B', predicate: { kind: 'is_not_here' } },
          { doorId: 'C', predicate: { kind: 'is_not_here' } },
        ],
        correctDoorId: 'A',
      }),
    ).toThrow(/no solution/);

    expect(() =>
      assertThreeDoorsQuestionUnique({
        questionId: 'three_doors.q.ambiguous',
        truthRule: 'exactly_one_true',
        statements: [
          { doorId: 'A', predicate: { kind: 'is_here' } },
          { doorId: 'B', predicate: { kind: 'is_here' } },
          { doorId: 'C', predicate: { kind: 'is_here' } },
        ],
        correctDoorId: 'A',
      }),
    ).toThrow(/multiple/);

    expect(() =>
      assertThreeDoorsQuestionUnique({
        ...THREE_DOORS_REFERENCE_QUESTION,
        correctDoorId: 'A',
      }),
    ).toThrow(/correctDoorId/);
  });

  it('rejects duplicate door ids in is_one_of', () => {
    expect(() =>
      validateEngineConfigs(
        'logic.three_doors',
        {
          categoryKey: 'challenge.category.logic',
          promptKey: 'challenge.three_doors.prompt',
        },
        {
          questions: [
            {
              questionId: 'three_doors.q.dup',
              truthRule: 'exactly_one_true',
              statements: [
                {
                  doorId: 'A',
                  predicate: { kind: 'is_one_of', doorIds: ['A', 'A'] },
                },
                { doorId: 'B', predicate: { kind: 'is_not_here' } },
                { doorId: 'C', predicate: { kind: 'is_not_here' } },
              ],
              correctDoorId: 'B',
            },
          ],
        },
      ),
    ).toThrow();
  });

  it('renders Arabic templates', () => {
    expect(renderDoorPredicateStatement({ kind: 'is_not_here' }, 'ar')).toBe(
      'المفتاح ليس هنا',
    );
    expect(
      renderDoorPredicateStatement({ kind: 'is', doorId: 'A' }, 'ar'),
    ).toBe('المفتاح خلف الباب A');
    expect(threeDoorsInstructionText('exactly_one_true', 'ar')).toContain(
      'صحيحة',
    );
  });

  it('materializes public doors without leaking the solution', () => {
    const def = threeDoorsDefinition();
    materializePack31Round(def, { usedThreeDoorsQuestionIds: [] });
    expect(def.clientConfig['doors']).toEqual(
      buildThreeDoorsPublicDoors(
        (def.serverConfig['statements'] as ThreeDoorsQuestion['statements']) ??
          THREE_DOORS_REFERENCE_QUESTION.statements,
        'ar',
      ),
    );
    expect(def.clientConfig['correctDoorId']).toBeUndefined();
    expect(def.clientConfig['statements']).toBeUndefined();
    expect(def.clientConfig['questions']).toBeUndefined();
    expect(def.serverConfig['correctDoorId']).toBeTruthy();

    const round: ChallengeRound = {
      challengeInstanceId: 'td-1',
      engineId: 'logic.three_doors',
      definitionId: def.definitionId,
      definitionVersion: 1,
      definition: def,
      participatingPlayerIds: ['p1', 'p2'],
      startsAtMs: 1_000,
      deadlineAtMs: 13_000,
      deadlineMonoMs: 13_000,
      status: 'active',
      roundPhase: 'answer',
      signalToken: null,
      signaledAtMs: null,
      signalAtMonoMs: null,
      signalEndsAtMs: null,
      signalEndsAtMonoMs: null,
      submissions: new Map(),
      resolutions: [],
    };
    const publicView = toPublicChallengeView(round, 1_200, 'p1');
    const json = JSON.stringify(publicView);
    expect(json).not.toContain('correctDoorId');
    expect(json).not.toContain('is_not_here');
    expect(json).toContain('المفتاح');
  });

  it('avoids repeating a questionId when alternatives exist', () => {
    const def = threeDoorsDefinition();
    materializePack31Round(def, {
      usedThreeDoorsQuestionIds: [
        'three_doors.q.reference_exactly_one_true',
      ],
    });
    expect(def.clientConfig['questionId']).toBe(
      'three_doors.q.exactly_one_false_sample',
    );
    expect(def.serverConfig['correctDoorId']).toBe('A');
  });

  it('evaluates answers authoritatively', () => {
    const evaluator = new LogicThreeDoorsEvaluator();
    const def = threeDoorsDefinition();
    materializePack31Round(def);
    const correct = def.serverConfig['correctDoorId'] as string;
    const wrong = correct === 'B' ? 'A' : 'B';

    expect(
      evaluator.evaluate({
        definition: def,
        answer: { selectedDoorId: correct },
        receivedMonoMs: 100,
        deadlineMonoMs: 1000,
      }).success,
    ).toBe(true);

    expect(
      evaluator.evaluate({
        definition: def,
        answer: { selectedDoorId: wrong },
        receivedMonoMs: 100,
        deadlineMonoMs: 1000,
      }).success,
    ).toBe(false);

    expect(
      evaluator.evaluate({
        definition: def,
        answer: { selectedDoorId: 'Z' },
        receivedMonoMs: 100,
        deadlineMonoMs: 1000,
      }).reasonKey,
    ).toBe('result.three_doors.invalid');

    expect(
      evaluator.evaluate({
        definition: def,
        answer: { selectedDoorId: correct },
        receivedMonoMs: 2000,
        deadlineMonoMs: 1000,
      }).reasonKey,
    ).toBe('result.timeout');
  });
});
