import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  precisionCableUntangleAnswerSchema,
  precisionCableUntangleClientConfigSchema,
  precisionCableUntangleServerConfigSchema,
  validateEngineConfigs,
} from '@thelastheart/contracts';
import {
  applyCableUntangleSwap,
  evaluateCableUntangleAnswer,
  replayCableUntangleSwaps,
} from './cable-untangle';
import {
  CableUntangleEvaluator,
  PRECISION_CABLE_UNTANGLE_ENGINE_ID,
} from './pack-31-evaluators';
import type { ChallengeDefinition } from '../types';

function loadFixture(): ChallengeDefinition {
  const path = join(
    __dirname,
    '..',
    '..',
    'challenges',
    'fixtures',
    'precision.cable_untangle.v1.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as ChallengeDefinition;
}

describe('precision.cable_untangle', () => {
  const fixture = loadFixture();

  it('validates fixture client/server configs', () => {
    expect(() =>
      validateEngineConfigs(
        PRECISION_CABLE_UNTANGLE_ENGINE_ID,
        fixture.clientConfig,
        fixture.serverConfig,
      ),
    ).not.toThrow();
    expect(
      precisionCableUntangleClientConfigSchema.safeParse(fixture.clientConfig)
        .success,
    ).toBe(true);
    expect(
      precisionCableUntangleServerConfigSchema.safeParse(fixture.serverConfig)
        .success,
    ).toBe(true);
  });

  it('rejects already-solved cable permutations', () => {
    const solved = {
      ...fixture.clientConfig,
      cables: [
        {
          id: 'cable-1',
          leftSocketId: 'left-1',
          initialRightSocketId: 'right-1',
        },
        {
          id: 'cable-2',
          leftSocketId: 'left-2',
          initialRightSocketId: 'right-2',
        },
        {
          id: 'cable-3',
          leftSocketId: 'left-3',
          initialRightSocketId: 'right-3',
        },
        {
          id: 'cable-4',
          leftSocketId: 'left-4',
          initialRightSocketId: 'right-4',
        },
      ],
    };
    expect(precisionCableUntangleClientConfigSchema.safeParse(solved).success).toBe(
      false,
    );
  });

  it('replays swaps authoritatively and accepts a solved answer', () => {
    const puzzle = precisionCableUntangleServerConfigSchema.parse(
      fixture.serverConfig,
    );
    const afterFirst = applyCableUntangleSwap(
      {
        'cable-1': 'right-3',
        'cable-2': 'right-1',
        'cable-3': 'right-4',
        'cable-4': 'right-2',
      },
      'cable-1',
      'right-1',
    )!;
    const afterSecond = applyCableUntangleSwap(afterFirst, 'cable-2', 'right-2')!;
    const finalAssignment = applyCableUntangleSwap(
      afterSecond,
      'cable-3',
      'right-3',
    )!;

    const answer = precisionCableUntangleAnswerSchema.parse({
      swaps: [
        {
          sequence: 1,
          draggedCableId: 'cable-1',
          displacedCableId: 'cable-2',
          fromRightSocketId: 'right-3',
          toRightSocketId: 'right-1',
          elapsedMs: 400,
        },
        {
          sequence: 2,
          draggedCableId: 'cable-2',
          displacedCableId: 'cable-4',
          fromRightSocketId: 'right-3',
          toRightSocketId: 'right-2',
          elapsedMs: 900,
        },
        {
          sequence: 3,
          draggedCableId: 'cable-3',
          displacedCableId: 'cable-4',
          fromRightSocketId: 'right-4',
          toRightSocketId: 'right-3',
          elapsedMs: 1400,
        },
      ],
      finalAssignment,
    });

    expect(replayCableUntangleSwaps(puzzle, answer.swaps)).toEqual(
      finalAssignment,
    );
    expect(
      evaluateCableUntangleAnswer({ puzzle, answer }).success,
    ).toBe(true);

    const evaluator = new CableUntangleEvaluator();
    const result = evaluator.evaluate({
      definition: fixture,
      answer,
      receivedMonoMs: 1400,
      deadlineMonoMs: 8000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects incomplete or forged success answers', () => {
    const evaluator = new CableUntangleEvaluator();
    expect(
      evaluator.evaluate({
        definition: fixture,
        answer: {
          swaps: [],
          finalAssignment: {
            'cable-1': 'right-1',
            'cable-2': 'right-2',
            'cable-3': 'right-3',
            'cable-4': 'right-4',
          },
        },
        receivedMonoMs: 100,
        deadlineMonoMs: 8000,
      }).reasonKey,
    ).toBe('result.cable_untangle.invalid');
  });
});
