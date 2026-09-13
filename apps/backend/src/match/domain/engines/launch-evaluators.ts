import {
  oppositeSwipeDirection,
  type SwipeDirection,
} from '@thelastheart/contracts';
import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
} from '../types';

export const TRAP_NO_TOUCH_ENGINE_ID = 'trap.no_touch';
export const GESTURE_REVERSE_SWIPE_ENGINE_ID = 'gesture.reverse_swipe';
export const TAP_PRECISION_ENGINE_ID = 'tap.precision';
export const MEMORY_SEQUENCE_ENGINE_ID = 'memory.sequence';
export const HOLD_MULTITOUCH_ENGINE_ID = 'hold.multitouch';

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Touch in the prohibited zone fails; reaching the deadline untouched succeeds. */
export class TrapNoTouchEvaluator implements ChallengeEvaluator {
  readonly engineId = TRAP_NO_TOUCH_ENGINE_ID;
  readonly absenceOutcome = 'success' as const;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return {
        success: false,
        reasonKey: 'result.timeout',
      };
    }
    if (input.answer['touched'] === true) {
      return {
        success: false,
        reasonKey: 'result.no_touch.touched',
        measureMs: Math.max(
          0,
          Math.floor(input.receivedMonoMs),
        ),
      };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: input.definition.durationMs,
    };
  }
}

export class GestureReverseSwipeEvaluator implements ChallengeEvaluator {
  readonly engineId = GESTURE_REVERSE_SWIPE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const displayed = str(
      input.definition.clientConfig['displayedDirection'],
    ) as SwipeDirection | null;
    const required =
      (str(input.definition.serverConfig['requiredDirection']) as
        | SwipeDirection
        | null) ??
      (displayed ? oppositeSwipeDirection(displayed) : null);
    const minDistance = num(
      input.definition.serverConfig['minDistancePx'],
      num(input.definition.clientConfig['minDistancePx'], 80),
    );
    const maxDuration = num(
      input.definition.serverConfig['maxDurationMs'],
      1500,
    );
    const dx = num(input.answer['dx']);
    const dy = num(input.answer['dy']);
    const durationMs = num(input.answer['durationMs']);
    if (!required || durationMs <= 0 || durationMs > maxDuration) {
      return { success: false, reasonKey: 'result.swipe.invalid' };
    }
    const distance = Math.hypot(dx, dy);
    if (distance < minDistance) {
      return { success: false, reasonKey: 'result.swipe.too_short' };
    }
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    let actual: SwipeDirection;
    if (absX >= absY) {
      actual = dx >= 0 ? 'right' : 'left';
    } else {
      actual = dy >= 0 ? 'down' : 'up';
    }
    if (actual !== required) {
      return { success: false, reasonKey: 'result.swipe.wrong_direction' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(durationMs)),
    };
  }
}

export class TapPrecisionEvaluator implements ChallengeEvaluator {
  readonly engineId = TAP_PRECISION_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const expected = input.definition.serverConfig['targetIds'];
    const attemptCount = num(
      input.definition.serverConfig['attemptCount'],
      1,
    );
    const tapped = input.answer['tappedTargetIds'];
    if (!Array.isArray(expected) || !Array.isArray(tapped)) {
      return { success: false, reasonKey: 'result.precision.invalid' };
    }
    const expectedIds = expected.filter((v): v is string => typeof v === 'string');
    const tappedIds = tapped.filter((v): v is string => typeof v === 'string');
    if (tappedIds.length !== attemptCount || tappedIds.length !== expectedIds.length) {
      return { success: false, reasonKey: 'result.precision.wrong_count' };
    }
    const ok =
      expectedIds.length === tappedIds.length &&
      expectedIds.every((id) => tappedIds.includes(id));
    return {
      success: ok,
      reasonKey: ok ? 'result.success' : 'result.precision.miss',
      measureMs: ok
        ? Math.max(0, Math.floor(input.receivedMonoMs))
        : undefined,
    };
  }
}

export class MemorySequenceEvaluator implements ChallengeEvaluator {
  readonly engineId = MEMORY_SEQUENCE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const expected = input.definition.serverConfig['sequence'];
    const submitted = input.answer['sequence'];
    if (!Array.isArray(expected) || !Array.isArray(submitted)) {
      return { success: false, reasonKey: 'result.memory.invalid' };
    }
    if (expected.length !== submitted.length) {
      return { success: false, reasonKey: 'result.memory.wrong' };
    }
    const ok = expected.every(
      (v, i) => typeof v === 'string' && submitted[i] === v,
    );
    return {
      success: ok,
      reasonKey: ok ? 'result.success' : 'result.memory.wrong',
      measureMs: ok
        ? Math.max(0, Math.floor(input.receivedMonoMs))
        : undefined,
    };
  }
}

export class HoldMultitouchEvaluator implements ChallengeEvaluator {
  readonly engineId = HOLD_MULTITOUCH_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const requiredContacts = num(
      input.definition.serverConfig['requiredContacts'],
      2,
    );
    const holdMs = num(input.definition.serverConfig['holdMs'], 1500);
    const contacts = num(input.answer['contacts']);
    const heldMs = num(input.answer['heldMs']);
    if (contacts < requiredContacts || heldMs < holdMs) {
      return { success: false, reasonKey: 'result.hold.incomplete' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(heldMs)),
    };
  }
}

export function createLaunchEvaluators(): ChallengeEvaluator[] {
  return [
    new TrapNoTouchEvaluator(),
    new GestureReverseSwipeEvaluator(),
    new TapPrecisionEvaluator(),
    new MemorySequenceEvaluator(),
    new HoldMultitouchEvaluator(),
  ];
}

export { createAdvancedEvaluators } from './advanced-evaluators';

