import type {
  CableUntanglePuzzleLike,
  CableUntangleSwap,
  PrecisionCableUntangleAnswer,
} from '@thelastheart/contracts';
import {
  countCableUntangleIntersections,
  initialCableUntangleAssignment,
} from '@thelastheart/contracts';

export function applyCableUntangleSwap(
  assignment: Record<string, string>,
  draggedCableId: string,
  toRightSocketId: string,
): Record<string, string> | null {
  const fromRight = assignment[draggedCableId];
  if (!fromRight) return null;
  if (fromRight === toRightSocketId) {
    return { ...assignment };
  }

  let displacedCableId: string | null = null;
  for (const [cableId, rightId] of Object.entries(assignment)) {
    if (rightId === toRightSocketId) {
      displacedCableId = cableId;
      break;
    }
  }
  if (!displacedCableId || displacedCableId === draggedCableId) {
    return null;
  }

  const next = { ...assignment };
  next[draggedCableId] = toRightSocketId;
  next[displacedCableId] = fromRight;

  const rights = new Set(Object.values(next));
  if (rights.size !== Object.keys(next).length) {
    return null;
  }
  return next;
}

export function replayCableUntangleSwaps(
  puzzle: CableUntanglePuzzleLike,
  swaps: readonly CableUntangleSwap[],
): Record<string, string> | null {
  let current = initialCableUntangleAssignment(puzzle);
  for (let i = 0; i < swaps.length; i += 1) {
    const swap = swaps[i]!;
    if (swap.sequence !== i + 1) return null;
    if (current[swap.draggedCableId] !== swap.fromRightSocketId) return null;
    if (current[swap.displacedCableId] !== swap.toRightSocketId) return null;
    const next = applyCableUntangleSwap(
      current,
      swap.draggedCableId,
      swap.toRightSocketId,
    );
    if (!next) return null;
    if (next[swap.draggedCableId] !== swap.toRightSocketId) return null;
    if (next[swap.displacedCableId] !== swap.fromRightSocketId) return null;
    current = next;
  }
  return current;
}

export function assignmentsMatch(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

export function evaluateCableUntangleAnswer(input: {
  puzzle: CableUntanglePuzzleLike;
  answer: PrecisionCableUntangleAnswer;
}): { success: boolean; reason: 'ok' | 'invalid' | 'incomplete' } {
  const replayed = replayCableUntangleSwaps(input.puzzle, input.answer.swaps);
  if (!replayed) {
    return { success: false, reason: 'invalid' };
  }
  if (!assignmentsMatch(replayed, input.answer.finalAssignment)) {
    return { success: false, reason: 'invalid' };
  }
  const crossings = countCableUntangleIntersections(
    input.puzzle,
    replayed,
  );
  if (crossings !== 0) {
    return { success: false, reason: 'incomplete' };
  }
  return { success: true, reason: 'ok' };
}
