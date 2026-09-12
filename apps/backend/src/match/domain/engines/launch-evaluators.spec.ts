import {
  GestureReverseSwipeEvaluator,
  HoldMultitouchEvaluator,
  MemorySequenceEvaluator,
  TapPrecisionEvaluator,
  TrapNoTouchEvaluator,
} from './launch-evaluators';
import type { ChallengeDefinition } from '../types';

function def(
  engineId: string,
  clientConfig: Record<string, unknown>,
  serverConfig: Record<string, unknown>,
): ChallengeDefinition {
  return {
    definitionId: `${engineId}.test`,
    definitionVersion: 1,
    engineId,
    durationMs: 4000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'prompt',
    clientConfig,
    serverConfig,
  };
}

describe('launch evaluators', () => {
  it('trap.no_touch fails on touch and succeeds with empty answer', () => {
    const e = new TrapNoTouchEvaluator();
    const d = def('trap.no_touch', {}, {});
    expect(
      e.evaluate({
        definition: d,
        answer: { touched: true },
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(false);
    expect(
      e.evaluate({
        definition: d,
        answer: {},
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(true);
  });

  it('reverse swipe requires opposite direction and distance', () => {
    const e = new GestureReverseSwipeEvaluator();
    const d = def(
      'gesture.reverse_swipe',
      { displayedDirection: 'right', minDistancePx: 80 },
      { requiredDirection: 'left', minDistancePx: 80, maxDurationMs: 1500 },
    );
    expect(
      e.evaluate({
        definition: d,
        answer: { dx: -100, dy: 0, durationMs: 200 },
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(true);
    expect(
      e.evaluate({
        definition: d,
        answer: { dx: 100, dy: 0, durationMs: 200 },
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(false);
  });

  it('precision tap matches target ids', () => {
    const e = new TapPrecisionEvaluator();
    const d = def(
      'tap.precision',
      {},
      { targetIds: ['t1', 't2'], attemptCount: 2 },
    );
    expect(
      e.evaluate({
        definition: d,
        answer: { tappedTargetIds: ['t2', 't1'] },
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(true);
  });

  it('memory sequence compares ordered keys', () => {
    const e = new MemorySequenceEvaluator();
    const d = def(
      'memory.sequence',
      {},
      { sequence: ['a', 'b'], previewMs: 500, optionKeys: ['a', 'b', 'c'] },
    );
    expect(
      e.evaluate({
        definition: d,
        answer: { sequence: ['a', 'b'] },
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(true);
    expect(
      e.evaluate({
        definition: d,
        answer: { sequence: ['b', 'a'] },
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(false);
  });

  it('multitouch hold requires contacts and duration', () => {
    const e = new HoldMultitouchEvaluator();
    const d = def(
      'hold.multitouch',
      {},
      { requiredContacts: 2, holdMs: 1000, resetOnLift: true },
    );
    expect(
      e.evaluate({
        definition: d,
        answer: { contacts: 2, heldMs: 1000, final: true },
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(true);
    expect(
      e.evaluate({
        definition: d,
        answer: { contacts: 1, heldMs: 1000, final: true },
        receivedMonoMs: 10,
        deadlineMonoMs: 4000,
      }).success,
    ).toBe(false);
  });
});
