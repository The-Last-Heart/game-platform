import { applyChallengeDifficulty } from '@thelastheart/contracts';

describe('applyChallengeDifficulty', () => {
  it('writes wait-for-signal windows that Flutter/server already honor', () => {
    const easy = applyChallengeDifficulty({
      engineId: 'reaction.wait_for_signal',
      difficulty: 'easy',
      durationMs: 5000,
      clientConfig: { waitingPromptKey: 'keep.me' },
      serverConfig: { signalDelayMs: 1500, signalWindowMs: 1500 },
    });
    const hard = applyChallengeDifficulty({
      engineId: 'reaction.wait_for_signal',
      difficulty: 'hard',
      durationMs: 5000,
      clientConfig: { waitingPromptKey: 'keep.me' },
      serverConfig: { signalDelayMs: 1500, signalWindowMs: 1500 },
    });

    expect(easy.clientConfig['waitingPromptKey']).toBe('keep.me');
    expect(easy.serverConfig['signalWindowMs']).toBeGreaterThan(
      hard.serverConfig['signalWindowMs'] as number,
    );
    expect(
      (easy.serverConfig['signalDelayMs'] as number) +
        (easy.serverConfig['signalWindowMs'] as number),
    ).toBeLessThanOrEqual(easy.durationMs);
    expect(
      (hard.serverConfig['signalDelayMs'] as number) +
        (hard.serverConfig['signalWindowMs'] as number),
    ).toBeLessThanOrEqual(hard.durationMs);
  });

  it('slows tap targets and speeds them up on hard', () => {
    const easy = applyChallengeDifficulty({
      engineId: 'tap.precision',
      difficulty: 'easy',
      durationMs: 5000,
      clientConfig: {
        targets: [{ id: 't1', x: 0.5, y: 0.5 }],
        attemptCount: 1,
      },
      serverConfig: { targetIds: ['t1'], attemptCount: 1 },
    });
    const hard = applyChallengeDifficulty({
      engineId: 'tap.precision',
      difficulty: 'hard',
      durationMs: 5000,
      clientConfig: {
        targets: [{ id: 't1', x: 0.5, y: 0.5 }],
        attemptCount: 1,
      },
      serverConfig: { targetIds: ['t1'], attemptCount: 1 },
    });

    expect(easy.clientConfig['targets']).toEqual([
      { id: 't1', x: 0.5, y: 0.5 },
    ]);
    expect(easy.clientConfig['speedMax']).toBeLessThan(
      hard.clientConfig['speedMin'] as number,
    );
  });

  it('sets ring-lock generation numbers from difficulty', () => {
    const hard = applyChallengeDifficulty({
      engineId: 'precision.ring_lock',
      difficulty: 'hard',
      durationMs: 15000,
      clientConfig: { promptKey: 'challenge.ring_lock.prompt' },
      serverConfig: {
        minAngularVelocityDegPerSec: 45,
        maxAngularVelocityDegPerSec: 90,
        alignmentToleranceDeg: 24,
        difficulty: 'medium',
      },
    });
    expect(hard.serverConfig['difficulty']).toBe('hard');
    expect(hard.serverConfig['minAngularVelocityDegPerSec']).toBeGreaterThan(45);
    expect(hard.serverConfig['alignmentToleranceDeg']).toBeLessThan(24);
  });
});
