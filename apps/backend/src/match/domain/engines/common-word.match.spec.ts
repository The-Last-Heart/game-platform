import { validateEngineConfigs } from '@thelastheart/contracts';
import { toPublicChallengeView } from '../match.engine';
import type { ChallengeDefinition, ChallengeRound } from '../types';
import {
  CommonWordEvaluator,
  materializePack31Round,
} from './pack-31-evaluators';

function commonWordDefinition(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return {
    definitionId: 'trivia.common_word.test',
    definitionVersion: 1,
    engineId: 'trivia.common_word',
    durationMs: 10000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.common_word.intro',
    choiceKeys: [],
    clientConfig: {
      categoryKey: 'challenge.category.trivia',
      promptKey: 'challenge.common_word.prompt',
      titleKey: 'challenge.common_word.title',
      clues: [
        { id: 'clue.needle', text: 'الإبرة' },
        { id: 'clue.storm', text: 'العاصفة' },
        { id: 'clue.water', text: 'الماء' },
      ],
      optionKeys: ['opt.eye', 'opt.heart', 'opt.head', 'opt.door'],
    },
    serverConfig: {
      titleCopy: { ar: 'الكلمة المشتركة' },
      instructionCopy: { ar: 'اختر كلمة ترتبط بالعبارات الثلاث' },
      questions: [
        {
          questionKey: 'common_word.q.eye',
          clues: [
            {
              clueId: 'clue.needle',
              textCopy: { ar: 'الإبرة' },
              relationshipCopy: { ar: 'عين الإبرة' },
              visualHint: 'needle',
            },
            {
              clueId: 'clue.storm',
              textCopy: { ar: 'العاصفة' },
              relationshipCopy: { ar: 'عين العاصفة' },
              visualHint: 'storm',
            },
            {
              clueId: 'clue.water',
              textCopy: { ar: 'الماء' },
              relationshipCopy: { ar: 'عين الماء' },
              visualHint: 'water',
            },
          ],
          optionKeys: ['opt.eye', 'opt.heart', 'opt.head', 'opt.door'],
          correctOptionKey: 'opt.eye',
          optionCopy: {
            'opt.eye': { ar: 'عين' },
            'opt.heart': { ar: 'قلب' },
            'opt.head': { ar: 'رأس' },
            'opt.door': { ar: 'باب' },
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('trivia.common_word', () => {
  it('validates private definition contracts', () => {
    const def = commonWordDefinition();
    const result = validateEngineConfigs(
      'trivia.common_word',
      def.clientConfig,
      def.serverConfig,
    );
    expect(result.engineId).toBe('trivia.common_word');
  });

  it('never leaks correctOptionId or relationship explanations publicly', () => {
    const definition = commonWordDefinition();
    materializePack31Round(definition);
    const round: ChallengeRound = {
      challengeInstanceId: 'cw-1',
      engineId: 'trivia.common_word',
      definitionId: definition.definitionId,
      definitionVersion: 1,
      definition,
      participatingPlayerIds: ['p1', 'p2'],
      startsAtMs: 1_000,
      deadlineAtMs: 11_000,
      deadlineMonoMs: 11_000,
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
    const blob = JSON.stringify(view);
    expect(blob).not.toContain('correctOptionKey');
    expect(blob).not.toContain('عين الإبرة');
    expect(blob).not.toContain('relationshipCopy');
    expect(view.clientConfig['clues']).toHaveLength(3);
    expect(view.clientConfig['optionKeys']).toEqual(
      expect.arrayContaining(['opt.eye', 'opt.heart', 'opt.head', 'opt.door']),
    );
  });

  it('accepts the correct option and rejects invalid / wrong options', () => {
    const evaluator = new CommonWordEvaluator();
    const definition = commonWordDefinition();
    materializePack31Round(definition);
    const correct = definition.serverConfig['correctOptionKey'] as string;
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
        answer: { chosenOptionKey: 'opt.heart' },
        receivedMonoMs: 100,
        deadlineMonoMs: 10_000,
      }).success,
    ).toBe(false);
  });

  it('times out after the deadline', () => {
    const evaluator = new CommonWordEvaluator();
    const definition = commonWordDefinition();
    materializePack31Round(definition);
    expect(
      evaluator.evaluate({
        definition,
        answer: {
          chosenOptionKey: definition.serverConfig['correctOptionKey'],
        },
        receivedMonoMs: 20_000,
        deadlineMonoMs: 10_000,
      }).reasonKey,
    ).toBe('result.timeout');
  });

  it('preserves shuffled option order on the pinned definition', () => {
    const definition = commonWordDefinition();
    materializePack31Round(definition);
    const first = [...(definition.clientConfig['optionKeys'] as string[])];
    expect(definition.serverConfig['optionKeys']).toEqual(first);
    expect(first).toHaveLength(4);
  });
});
