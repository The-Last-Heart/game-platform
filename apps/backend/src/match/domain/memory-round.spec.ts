import { materializeMemoryRound } from './memory-round';
import type { ChallengeDefinition } from './types';

function baseDef(
  overrides: Partial<ChallengeDefinition> = {},
): ChallengeDefinition {
  return {
    definitionId: 'memory.sequence.dev',
    definitionVersion: 1,
    engineId: 'memory.sequence',
    durationMs: 8000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'challenge.memory.intro',
    clientConfig: {
      categoryKey: 'challenge.category.memory',
      promptKey: 'challenge.memory.prompt',
      previewMs: 4000,
      optionKeys: ['a', 'b', 'c', 'd'],
    },
    serverConfig: {
      previewMs: 4000,
      optionKeys: ['a', 'b', 'c', 'd'],
      sequence: ['a', 'b', 'c'],
      optionCount: 4,
      sequenceLength: 4,
      objectGroups: [
        {
          groupId: 'shapes',
          keys: ['shape.1', 'shape.2', 'shape.3', 'shape.4', 'shape.5', 'shape.6'],
        },
        {
          groupId: 'symbols',
          keys: ['sym.1', 'sym.2', 'sym.3', 'sym.4', 'sym.5', 'sym.6'],
        },
      ],
    },
    ...overrides,
  };
}

describe('materializeMemoryRound', () => {
  it('leaves authored configs alone when objectGroups are absent', () => {
    const def = baseDef({
      serverConfig: {
        previewMs: 1500,
        optionKeys: ['a', 'b', 'c'],
        sequence: ['a', 'c', 'b'],
      },
      clientConfig: {
        categoryKey: 'challenge.category.memory',
        promptKey: 'challenge.memory.prompt',
        previewMs: 1500,
        optionKeys: ['a', 'b', 'c'],
      },
    });
    materializeMemoryRound(def);
    expect(def.serverConfig['sequence']).toEqual(['a', 'c', 'b']);
    expect(def.serverConfig['optionKeys']).toEqual(['a', 'b', 'c']);
  });

  it('samples four unique options and a length-4 sequence from one group', () => {
    const def = baseDef();
    materializeMemoryRound(def);
    const options = def.serverConfig['optionKeys'] as string[];
    const sequence = def.serverConfig['sequence'] as string[];
    const clientOptions = def.clientConfig['optionKeys'] as string[];
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(sequence).toHaveLength(4);
    expect(new Set(sequence).size).toBe(4);
    for (const key of sequence) {
      expect(options).toContain(key);
    }
    expect(new Set(clientOptions)).toEqual(new Set(options));

    const shapeKeys = new Set([
      'shape.1',
      'shape.2',
      'shape.3',
      'shape.4',
      'shape.5',
      'shape.6',
    ]);
    const symKeys = new Set([
      'sym.1',
      'sym.2',
      'sym.3',
      'sym.4',
      'sym.5',
      'sym.6',
    ]);
    const allShape = options.every((k) => shapeKeys.has(k));
    const allSym = options.every((k) => symKeys.has(k));
    expect(allShape || allSym).toBe(true);
  });
});
