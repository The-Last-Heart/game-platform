import {
  LASER_ROUTING_ENGINE_ID,
  LASER_ROUTING_PROMPT_KEYS,
  LASER_ROUTING_SUCCESS_HOLD_MS,
  LASER_ROUTING_TITLE_KEYS,
  applyInteractiveState,
  generateLaserRoutingPuzzle,
  laserRoutingAnswerSchema,
  playerSeedForLaserRouting,
  readInteractiveState,
  resolveLaserRoutingGenerationConfig,
  rotateComponent,
  toPublicBoard,
  toPublicTraces,
  traceLasers,
  type InteractiveState,
  type LaserBoard,
  type LaserGeneratedPuzzle,
  type LaserRoutingVariant,
  type LaserTraceResult,
} from '@thelastheart/contracts';

export { LASER_ROUTING_ENGINE_ID, LASER_ROUTING_SUCCESS_HOLD_MS };

export type LaserRoutingPlayerResult = 'active' | 'success' | 'timeout';

export type LaserRoutingPlayerState = {
  playerId: string;
  challengeInstanceId: string;
  seed: number;
  variant: LaserRoutingVariant;
  board: LaserBoard;
  solvedState: InteractiveState;
  puzzleStartsAtMs: number;
  puzzleStartsMonoMs: number;
  deadlineAtMs: number;
  deadlineMonoMs: number;
  lastAcceptedCommandId: string | null;
  lastCommandMonoMs: number | null;
  lastRotatedComponentId: string | null;
  reflectionOccurred: boolean;
  result: LaserRoutingPlayerResult;
  stateSequence: number;
  usedFallback: boolean;
};

export type LaserRoutingRoundState = {
  challengeInstanceId: string;
  startDelayMs: number;
  difficulty: 'easy' | 'medium' | 'hard';
  players: Record<string, LaserRoutingPlayerState>;
  /** When set, keep the lit board visible until this mono timestamp. */
  successResolveAtMonoMs?: number | null;
};

export type LaserRoutingPublicPlayerPayload = {
  seed: number;
  variant: LaserRoutingVariant;
  titleKey: string;
  promptKey: string;
  puzzleStartsAtMs: number;
  startDelayMs: number;
  board: ReturnType<typeof toPublicBoard>;
  traces: ReturnType<typeof toPublicTraces>;
  combinerCharged: boolean;
  heartLit: boolean;
  mirrorsHit: number;
  mirrorsTotal: number;
  gatesOpen: number;
  gatesTotal: number;
  connectedPaths: number;
  totalPaths: number;
  progress: number;
  result: LaserRoutingPlayerResult;
  stateSequence: number;
  lastAcceptedCommandId: string | null;
  lastRotatedComponentId: string | null;
  reflectionOccurred: boolean;
  isParticipant: true;
};

export function cloneLaserRoutingState(
  state: LaserRoutingRoundState,
): LaserRoutingRoundState {
  return {
    challengeInstanceId: state.challengeInstanceId,
    startDelayMs: state.startDelayMs,
    difficulty: state.difficulty,
    successResolveAtMonoMs: state.successResolveAtMonoMs ?? null,
    players: Object.fromEntries(
      Object.entries(state.players).map(([playerId, player]) => [
        playerId,
        {
          ...player,
          board: {
            width: player.board.width,
            height: player.board.height,
            variant: player.board.variant,
            components: player.board.components.map((component) => ({
              ...component,
            })),
          },
          solvedState: {
            mirrors: { ...player.solvedState.mirrors },
            gates: { ...player.solvedState.gates },
          },
        },
      ]),
    ),
  };
}

export function buildInitialLaserRoutingPlayerState(input: {
  playerId: string;
  challengeInstanceId: string;
  generated: LaserGeneratedPuzzle;
  puzzleStartsAtMs: number;
  puzzleStartsMonoMs: number;
  deadlineAtMs: number;
  deadlineMonoMs: number;
}): LaserRoutingPlayerState {
  return {
    playerId: input.playerId,
    challengeInstanceId: input.challengeInstanceId,
    seed: input.generated.seed,
    variant: input.generated.variant,
    board: input.generated.board,
    solvedState: input.generated.solutionState,
    puzzleStartsAtMs: input.puzzleStartsAtMs,
    puzzleStartsMonoMs: input.puzzleStartsMonoMs,
    deadlineAtMs: input.deadlineAtMs,
    deadlineMonoMs: input.deadlineMonoMs,
    lastAcceptedCommandId: null,
    lastCommandMonoMs: null,
    lastRotatedComponentId: null,
    reflectionOccurred: false,
    result: 'active',
    stateSequence: 0,
    usedFallback: input.generated.usedFallback,
  };
}

function progressRatio(trace: LaserTraceResult): number {
  if (trace.success) return 1;
  if (trace.totalPaths === 2) {
    return trace.connectedPaths / 2;
  }
  if (trace.gatesTotal > 0) {
    return trace.gatesTotal === 0 ? 0 : trace.gatesOpen / trace.gatesTotal;
  }
  if (trace.mirrorsTotal > 0) {
    return trace.mirrorsHit / trace.mirrorsTotal;
  }
  return 0;
}

export function toLaserRoutingPublicPlayerPayload(
  round: LaserRoutingRoundState,
  player: LaserRoutingPlayerState,
): LaserRoutingPublicPlayerPayload {
  const trace = traceLasers(player.board);
  return {
    seed: player.seed,
    variant: player.variant,
    titleKey: LASER_ROUTING_TITLE_KEYS[player.variant],
    promptKey: LASER_ROUTING_PROMPT_KEYS[player.variant],
    puzzleStartsAtMs: player.puzzleStartsAtMs,
    startDelayMs: round.startDelayMs,
    board: toPublicBoard(player.board),
    traces: toPublicTraces(trace),
    combinerCharged: trace.combinerCharged,
    heartLit: player.result === 'success',
    mirrorsHit: trace.mirrorsHit,
    mirrorsTotal: trace.mirrorsTotal,
    gatesOpen: trace.gatesOpen,
    gatesTotal: trace.gatesTotal,
    connectedPaths: trace.connectedPaths,
    totalPaths: trace.totalPaths,
    progress: progressRatio(trace),
    result: player.result,
    stateSequence: player.stateSequence,
    lastAcceptedCommandId: player.lastAcceptedCommandId,
    lastRotatedComponentId: player.lastRotatedComponentId,
    reflectionOccurred: player.reflectionOccurred,
    isParticipant: true,
  };
}

export function validateLaserRoutingAnswer(answer: Record<string, unknown>):
  | {
      ok: true;
      componentId: string;
      expectedSequence?: number;
    }
  | { ok: false; reason: string } {
  const parsed = laserRoutingAnswerSchema.safeParse(answer);
  if (!parsed.success) {
    return { ok: false, reason: 'malformed' };
  }
  return {
    ok: true,
    componentId: parsed.data.componentId,
    expectedSequence: parsed.data.expectedSequence,
  };
}

const COMMAND_COOLDOWN_MS = 80;

export function applyLaserRoutingCommand(input: {
  state: LaserRoutingRoundState;
  playerId: string;
  componentId: string;
  commandId: string;
  expectedSequence?: number;
  nowMonoMs: number;
}):
  | {
      ok: true;
      state: LaserRoutingRoundState;
      completed: boolean;
      duplicate: boolean;
    }
  | { ok: false; reason: string; state: LaserRoutingRoundState } {
  const next = cloneLaserRoutingState(input.state);
  const player = next.players[input.playerId];
  if (!player) {
    return { ok: false, reason: 'not_participant', state: next };
  }
  if (player.lastAcceptedCommandId === input.commandId) {
    return {
      ok: true,
      state: next,
      completed: player.result === 'success',
      duplicate: true,
    };
  }
  if (player.result !== 'active') {
    return { ok: false, reason: 'already_resolved', state: next };
  }
  if (input.nowMonoMs > player.deadlineMonoMs) {
    return { ok: false, reason: 'late', state: next };
  }
  if (input.nowMonoMs < player.puzzleStartsMonoMs + next.startDelayMs) {
    return { ok: false, reason: 'not_started', state: next };
  }
  if (
    input.expectedSequence != null &&
    input.expectedSequence !== player.stateSequence
  ) {
    return { ok: false, reason: 'stale_sequence', state: next };
  }
  if (
    player.lastCommandMonoMs != null &&
    input.nowMonoMs - player.lastCommandMonoMs < COMMAND_COOLDOWN_MS
  ) {
    return { ok: false, reason: 'cooldown', state: next };
  }

  const component = player.board.components.find(
    (item) => item.id === input.componentId,
  );
  if (!component) {
    return { ok: false, reason: 'unknown_component', state: next };
  }
  if (component.kind !== 'mirror' && component.kind !== 'gate') {
    return { ok: false, reason: 'not_interactive', state: next };
  }

  let rotated: LaserBoard;
  try {
    rotated = rotateComponent(player.board, input.componentId);
  } catch {
    return { ok: false, reason: 'not_interactive', state: next };
  }

  const nextTrace = traceLasers(rotated);
  const reachedAfter = nextTrace.hitComponentIds.includes(input.componentId);

  player.board = rotated;
  player.lastAcceptedCommandId = input.commandId;
  player.lastCommandMonoMs = input.nowMonoMs;
  player.lastRotatedComponentId = input.componentId;
  player.reflectionOccurred =
    component.kind === 'mirror' && reachedAfter && player.result === 'active';
  player.stateSequence += 1;

  if (nextTrace.success) {
    player.result = 'success';
    player.reflectionOccurred = false;
  }

  return {
    ok: true,
    state: next,
    completed: player.result === 'success',
    duplicate: false,
  };
}

export function markLaserRoutingTimeouts(
  state: LaserRoutingRoundState,
): LaserRoutingRoundState {
  const next = cloneLaserRoutingState(state);
  for (const player of Object.values(next.players)) {
    if (player.result === 'active') {
      player.result = 'timeout';
      player.reflectionOccurred = false;
    }
  }
  return next;
}

export function generateLaserRoutingForPlayer(input: {
  challengeInstanceId: string;
  playerId: string;
  baseSeed: number;
  serverConfig: Record<string, unknown>;
  durationMs: number;
}): LaserGeneratedPuzzle {
  const config = resolveLaserRoutingGenerationConfig(
    input.serverConfig,
    input.durationMs,
  );
  const seed = playerSeedForLaserRouting(
    input.challengeInstanceId,
    input.playerId,
    input.baseSeed,
  );
  return generateLaserRoutingPuzzle({ seed, config });
}

export function restoreSolvedBoard(
  player: LaserRoutingPlayerState,
): LaserBoard {
  return applyInteractiveState(player.board, player.solvedState);
}

export { readInteractiveState, resolveLaserRoutingGenerationConfig };
