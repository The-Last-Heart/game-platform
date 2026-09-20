import {
  VERTICAL_REFLECTION_INSTRUCTION_COPY,
  VERTICAL_REFLECTION_TITLE_COPY,
  VERTICAL_REFLECTION_REFERENCE_QUESTION,
  buildDefaultVerticalReflectionBank,
  materializeVerticalReflectionQuestion,
  shapesEqual,
  reflectShapeVertical,
  type VerticalReflectionQuestion,
} from '@thelastheart/contracts';
import { toPublicChallengeView } from '../match.engine';
import type { ChallengeDefinition, ChallengeRound } from '../types';
import {
  FocusVerticalReflectionEvaluator,
  materializePack31Round,
} from './pack-31-evaluators';

function verticalReflectionDefinition(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  const bank = buildDefaultVerticalReflectionBank();
  return {
    definitionId: 'focus.vertical_reflection.test',
    definitionVersion: 1,
    engineId: 'focus.vertical_reflection',
    durationMs: 12000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.vertical_reflection.intro',
    choiceKeys: [],
    clientConfig: {
      categoryKey: 'challenge.category.focus',
      promptKey: 'challenge.vertical_reflection.prompt',
      titleKey: 'challenge.vertical_reflection.title',
    },
    serverConfig: {
      questions: bank.questions.slice(0, 3),
    },
    ...overrides,
  };
}

describe('focus.vertical_reflection match authority', () => {
  const evaluator = new FocusVerticalReflectionEvaluator();

  it('materializes public geometry without leaking the correct candidate id', () => {
    const definition = verticalReflectionDefinition();
    materializePack31Round(definition);
    expect(definition.clientConfig['sourceShape']).toBeTruthy();
    expect(definition.clientConfig['candidates']).toHaveLength(4);
    expect(definition.clientConfig['sourceSide']).toBe('left');
    expect(definition.serverConfig['correctCandidateId']).toBeTruthy();
    expect(definition.serverConfig['correctOptionKey']).toBe(
      definition.serverConfig['correctCandidateId'],
    );
    expect(definition.clientConfig['correctCandidateId']).toBeUndefined();
    expect(definition.clientConfig['correctOptionKey']).toBeUndefined();

    const round: ChallengeRound = {
      challengeInstanceId: 'ch-vr-1',
      engineId: 'focus.vertical_reflection',
      definitionId: definition.definitionId,
      definitionVersion: 1,
      definition,
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
    const view = toPublicChallengeView(round, 1_200, 'p1');
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/correctCandidateId/);
    expect(serialized).not.toMatch(/correctOptionKey/);
    expect(serialized).not.toMatch(/isCorrect/);
    expect(serialized).not.toMatch(/distractorTransforms/);
    expect(serialized).not.toMatch(/correct_vertical/);
    expect(view.clientConfig['candidates']).toHaveLength(4);
  });

  it('evaluates chosenOptionKey authoritatively and rejects invalid ids', () => {
    const definition = verticalReflectionDefinition({
      serverConfig: {
        questions: [VERTICAL_REFLECTION_REFERENCE_QUESTION],
      },
    });
    materializePack31Round(definition);
    const correct = String(definition.serverConfig['correctOptionKey']);
    const options = definition.serverConfig['optionKeys'] as string[];
    const wrong = options.find((id) => id !== correct)!;

    expect(
      evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: correct },
        receivedMonoMs: 100,
        deadlineMonoMs: 12_000,
      }).success,
    ).toBe(true);

    expect(
      evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: wrong },
        receivedMonoMs: 100,
        deadlineMonoMs: 12_000,
      }).success,
    ).toBe(false);

    expect(
      evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: 'vr.opt.missing' },
        receivedMonoMs: 100,
        deadlineMonoMs: 12_000,
      }).success,
    ).toBe(false);

    expect(
      evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: correct },
        receivedMonoMs: 12_001,
        deadlineMonoMs: 12_000,
      }),
    ).toEqual({ success: false, reasonKey: 'result.timeout' });
  });

  it('keeps reconnect-equivalent materialization deterministic for a seed', () => {
    const question = materializeVerticalReflectionQuestion({
      ...(VERTICAL_REFLECTION_REFERENCE_QUESTION as VerticalReflectionQuestion),
    });
    const definitionA = verticalReflectionDefinition({
      serverConfig: { questions: [question] },
    });
    const definitionB = verticalReflectionDefinition({
      serverConfig: { questions: [question] },
    });
    materializePack31Round(definitionA);
    materializePack31Round(definitionB);
    expect(definitionA.clientConfig['optionKeys']).toEqual(
      definitionB.clientConfig['optionKeys'],
    );
    expect(definitionA.serverConfig['correctCandidateId']).toBe(
      definitionB.serverConfig['correctCandidateId'],
    );
    const expected = reflectShapeVertical(question.sourceShape);
    const correctId = String(definitionA.serverConfig['correctCandidateId']);
    const candidates = definitionA.clientConfig['candidates'] as Array<{
      id: string;
      shape: Parameters<typeof shapesEqual>[0];
    }>;
    const match = candidates.find((c) => c.id === correctId)!;
    expect(shapesEqual(match.shape, expected)).toBe(true);
  });

  it('pins Arabic title and instruction defaults', () => {
    const definition = verticalReflectionDefinition({
      serverConfig: {
        questions: [
          {
            ...VERTICAL_REFLECTION_REFERENCE_QUESTION,
            titleCopy: undefined,
            instructionCopy: undefined,
          },
        ],
      },
    });
    materializePack31Round(definition);
    expect(definition.clientConfig['titleText']).toBe(
      VERTICAL_REFLECTION_TITLE_COPY.ar,
    );
    expect(definition.clientConfig['instructionText']).toBe(
      VERTICAL_REFLECTION_INSTRUCTION_COPY.ar,
    );
  });
});
