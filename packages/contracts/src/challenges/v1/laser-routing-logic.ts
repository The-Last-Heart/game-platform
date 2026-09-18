/**
 * Authoritative laser-routing optics, tracing, generation, and solvability.
 *
 * Shared by the match authority and Challenge Studio preview. Flutter never
 * imports this module — it only renders server-issued traces.
 */

export const LASER_ROUTING_ENGINE_ID = 'laser.routing' as const;

export const LASER_ROUTING_VARIANTS = [
  'classic',
  'zigzag',
  'dual_fusion',
  'pulse_gates',
] as const;
export type LaserRoutingVariant = (typeof LASER_ROUTING_VARIANTS)[number];

export const LASER_DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export type LaserDirection = (typeof LASER_DIRECTIONS)[number];

export const MIRROR_ORIENTATIONS = ['slash', 'backslash'] as const;
export type MirrorOrientation = (typeof MIRROR_ORIENTATIONS)[number];

export const GATE_AXES = ['horizontal', 'vertical'] as const;
export type GateAxis = (typeof GATE_AXES)[number];

export const LASER_COLORS = ['cyan', 'amber', 'fused'] as const;
export type LaserColor = (typeof LASER_COLORS)[number];

export type LaserCoord = { readonly row: number; readonly col: number };

export const LASER_ROUTING_DEFAULT_ASSET_IDS = {
  laserLoopSfx: 'laser_routing.laser_loop',
  reflectionSfx: 'laser_routing.reflection',
  heartPowerOnSfx: 'laser_routing.heart_power_on',
} as const;

/** How long the solved board stays on screen after the last seat succeeds. */
export const LASER_ROUTING_SUCCESS_HOLD_MS = 1000;

export const LASER_ROUTING_DEFAULT_CONFIG = {
  variant: 'classic' as LaserRoutingVariant,
  gridWidth: 4,
  gridHeight: 4,
  startDelayMs: 800,
  moveBudgetMs: 1800,
  safetyMarginMs: 2000,
  maxGenerationAttempts: 24,
  minRequiredMoves: 2,
  maxRequiredMoves: 5,
  requireUniqueSolution: true,
  avoidSingleMoveStart: true,
  mirrorCount: 4,
  difficulty: 'medium' as const,
} as const;

export const LASER_ROUTING_DIFFICULTY_TUNING = {
  easy: {
    durationMs: 15000,
    startDelayMs: 1000,
    minRequiredMoves: 2,
    maxRequiredMoves: 4,
    mirrorCount: 3,
    moveBudgetMs: 2000,
    avoidSingleMoveStart: false,
  },
  medium: {
    durationMs: 15000,
    startDelayMs: 800,
    minRequiredMoves: 2,
    maxRequiredMoves: 5,
    mirrorCount: 4,
    moveBudgetMs: 1800,
    avoidSingleMoveStart: true,
  },
  hard: {
    durationMs: 15000,
    startDelayMs: 600,
    minRequiredMoves: 3,
    maxRequiredMoves: 6,
    mirrorCount: 5,
    moveBudgetMs: 1400,
    avoidSingleMoveStart: true,
  },
} as const;

export const LASER_ROUTING_TITLE_KEYS: Record<LaserRoutingVariant, string> = {
  classic: 'challenge.laser.classic.title',
  zigzag: 'challenge.laser.zigzag.title',
  dual_fusion: 'challenge.laser.dual_fusion.title',
  pulse_gates: 'challenge.laser.pulse_gates.title',
};

export const LASER_ROUTING_PROMPT_KEYS: Record<LaserRoutingVariant, string> = {
  classic: 'challenge.laser.classic.prompt',
  zigzag: 'challenge.laser.zigzag.prompt',
  dual_fusion: 'challenge.laser.dual_fusion.prompt',
  pulse_gates: 'challenge.laser.pulse_gates.prompt',
};

const SLASH_MAP: Record<LaserDirection, LaserDirection> = {
  north: 'east',
  east: 'north',
  south: 'west',
  west: 'south',
};

const BACKSLASH_MAP: Record<LaserDirection, LaserDirection> = {
  north: 'west',
  west: 'north',
  south: 'east',
  east: 'south',
};

const DELTA: Record<LaserDirection, LaserCoord> = {
  north: { row: -1, col: 0 },
  east: { row: 0, col: 1 },
  south: { row: 1, col: 0 },
  west: { row: 0, col: -1 },
};

const OPPOSITE: Record<LaserDirection, LaserDirection> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

const CW: Record<LaserDirection, LaserDirection> = {
  north: 'east',
  east: 'south',
  south: 'west',
  west: 'north',
};

export class LaserRoutingConfigError extends Error {
  readonly code = 'LASER_ROUTING_INVALID_CONFIG';

  constructor(message: string) {
    super(message);
    this.name = 'LaserRoutingConfigError';
  }
}

export function reflectDirection(
  incoming: LaserDirection,
  orientation: MirrorOrientation,
): LaserDirection {
  return orientation === 'slash' ? SLASH_MAP[incoming] : BACKSLASH_MAP[incoming];
}

export function toggleMirrorOrientation(
  orientation: MirrorOrientation,
): MirrorOrientation {
  return orientation === 'slash' ? 'backslash' : 'slash';
}

export function toggleGateAxis(axis: GateAxis): GateAxis {
  return axis === 'horizontal' ? 'vertical' : 'horizontal';
}

export function gateAllows(incoming: LaserDirection, axis: GateAxis): boolean {
  const horizontal = incoming === 'east' || incoming === 'west';
  return axis === 'horizontal' ? horizontal : !horizontal;
}

export function stepCoord(coord: LaserCoord, direction: LaserDirection): LaserCoord {
  const delta = DELTA[direction];
  return { row: coord.row + delta.row, col: coord.col + delta.col };
}

export function inBounds(
  coord: LaserCoord,
  width: number,
  height: number,
): boolean {
  return (
    coord.row >= 0 &&
    coord.col >= 0 &&
    coord.row < height &&
    coord.col < width
  );
}

export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function playerSeedForLaserRouting(
  challengeInstanceId: string,
  playerId: string,
  baseSeed: number,
): number {
  return hashStringToSeed(
    `laser.routing:${challengeInstanceId}:${playerId}:${baseSeed}`,
  );
}

export type LaserSource = {
  id: string;
  kind: 'source';
  row: number;
  col: number;
  direction: LaserDirection;
  color: Exclude<LaserColor, 'fused'>;
};

export type LaserMirror = {
  id: string;
  kind: 'mirror';
  row: number;
  col: number;
  orientation: MirrorOrientation;
};

export type LaserGate = {
  id: string;
  kind: 'gate';
  row: number;
  col: number;
  axis: GateAxis;
};

export type LaserCombiner = {
  id: string;
  kind: 'combiner';
  row: number;
  col: number;
  cyanInput: LaserDirection;
  amberInput: LaserDirection;
  outputDirection: LaserDirection;
  outputColor: 'fused';
};

export type LaserHeart = {
  id: string;
  kind: 'heart';
  row: number;
  col: number;
};

export type LaserComponent =
  | LaserSource
  | LaserMirror
  | LaserGate
  | LaserCombiner
  | LaserHeart;

export type LaserBoard = {
  width: number;
  height: number;
  variant: LaserRoutingVariant;
  components: LaserComponent[];
};

export type LaserTraceTermination =
  | 'heart'
  | 'boundary'
  | 'closed_gate'
  | 'loop'
  | 'combiner'
  | 'invalid'
  | 'max_steps';

export type LaserTrace = {
  sourceId: string;
  color: LaserColor;
  cells: LaserCoord[];
  hitComponentIds: string[];
  termination: LaserTraceTermination;
  blockedComponentId: string | null;
  incomingAtEnd: LaserDirection | null;
};

export type LaserTraceResult = {
  traces: LaserTrace[];
  success: boolean;
  heartReached: boolean;
  combinerCharged: boolean;
  cyanPathConnected: boolean;
  amberPathConnected: boolean;
  hitComponentIds: string[];
  requiredComponentIds: string[];
  requiredHitCount: number;
  mirrorsHit: number;
  mirrorsTotal: number;
  gatesOpen: number;
  gatesTotal: number;
  connectedPaths: number;
  totalPaths: number;
};

type Occupant =
  | { kind: 'source'; component: LaserSource }
  | { kind: 'mirror'; component: LaserMirror }
  | { kind: 'gate'; component: LaserGate }
  | { kind: 'combiner'; component: LaserCombiner }
  | { kind: 'heart'; component: LaserHeart };

function cellKey(coord: LaserCoord): string {
  return `${coord.row},${coord.col}`;
}

function visitKey(
  coord: LaserCoord,
  direction: LaserDirection,
  color: LaserColor,
): string {
  return `${coord.row},${coord.col},${direction},${color}`;
}

function occupancyMap(board: LaserBoard): Map<string, Occupant> {
  const map = new Map<string, Occupant>();
  for (const component of board.components) {
    const key = cellKey({ row: component.row, col: component.col });
    if (map.has(key)) {
      throw new LaserRoutingConfigError(`overlapping component at ${key}`);
    }
    map.set(key, { kind: component.kind, component } as Occupant);
  }
  return map;
}

function traceBeam(input: {
  board: LaserBoard;
  occupancy: Map<string, Occupant>;
  start: LaserCoord;
  direction: LaserDirection;
  color: LaserColor;
  sourceId: string;
  skipStartOptics: boolean;
}): LaserTrace {
  const { board, occupancy } = input;
  let pos = input.start;
  let dir = input.direction;
  const color = input.color;
  const cells: LaserCoord[] = [{ row: pos.row, col: pos.col }];
  const hitComponentIds: string[] = [];
  const visited = new Set<string>();
  const maxSteps = board.width * board.height * 8 + 8;

  if (!input.skipStartOptics) {
    const startOcc = occupancy.get(cellKey(pos));
    if (startOcc?.kind === 'combiner') {
      hitComponentIds.push(startOcc.component.id);
    }
  }

  for (let step = 0; step < maxSteps; step += 1) {
    const state = visitKey(pos, dir, color);
    if (visited.has(state)) {
      return {
        sourceId: input.sourceId,
        color,
        cells,
        hitComponentIds,
        termination: 'loop',
        blockedComponentId: null,
        incomingAtEnd: dir,
      };
    }
    visited.add(state);

    const next = stepCoord(pos, dir);
    if (!inBounds(next, board.width, board.height)) {
      return {
        sourceId: input.sourceId,
        color,
        cells,
        hitComponentIds,
        termination: 'boundary',
        blockedComponentId: null,
        incomingAtEnd: dir,
      };
    }

    pos = next;
    cells.push({ row: pos.row, col: pos.col });
    const occ = occupancy.get(cellKey(pos));
    if (!occ) {
      continue;
    }
    switch (occ.kind) {
      case 'mirror': {
        hitComponentIds.push(occ.component.id);
        dir = reflectDirection(dir, occ.component.orientation);
        break;
      }
      case 'gate': {
        if (!gateAllows(dir, occ.component.axis)) {
          return {
            sourceId: input.sourceId,
            color,
            cells,
            hitComponentIds,
            termination: 'closed_gate',
            blockedComponentId: occ.component.id,
            incomingAtEnd: dir,
          };
        }
        hitComponentIds.push(occ.component.id);
        break;
      }
      case 'heart': {
        hitComponentIds.push(occ.component.id);
        return {
          sourceId: input.sourceId,
          color,
          cells,
          hitComponentIds,
          termination: 'heart',
          blockedComponentId: null,
          incomingAtEnd: dir,
        };
      }
      case 'combiner': {
        hitComponentIds.push(occ.component.id);
        return {
          sourceId: input.sourceId,
          color,
          cells,
          hitComponentIds,
          termination: 'combiner',
          blockedComponentId: null,
          incomingAtEnd: dir,
        };
      }
      case 'source': {
        return {
          sourceId: input.sourceId,
          color,
          cells,
          hitComponentIds,
          termination: cells.length > 2 ? 'loop' : 'invalid',
          blockedComponentId: occ.component.id,
          incomingAtEnd: dir,
        };
      }
    }
  }

  return {
    sourceId: input.sourceId,
    color,
    cells,
    hitComponentIds,
    termination: 'max_steps',
    blockedComponentId: null,
    incomingAtEnd: dir,
  };
}

export function requiredInteractiveIds(board: LaserBoard): string[] {
  return board.components
    .filter(
      (component) =>
        component.kind === 'mirror' ||
        component.kind === 'gate' ||
        component.kind === 'combiner',
    )
    .map((component) => component.id);
}

export function traceLasers(board: LaserBoard): LaserTraceResult {
  const occupancy = occupancyMap(board);
  const sources = board.components.filter(
    (component): component is LaserSource => component.kind === 'source',
  );
  const combiner = board.components.find(
    (component): component is LaserCombiner => component.kind === 'combiner',
  );
  const mirrors = board.components.filter((c) => c.kind === 'mirror');
  const gates = board.components.filter((c) => c.kind === 'gate');
  const traces: LaserTrace[] = [];
  let cyanPathConnected = false;
  let amberPathConnected = false;

  for (const source of sources) {
    const trace = traceBeam({
      board,
      occupancy,
      start: { row: source.row, col: source.col },
      direction: source.direction,
      color: source.color,
      sourceId: source.id,
      skipStartOptics: true,
    });
    traces.push(trace);
    if (combiner && trace.termination === 'combiner') {
      if (
        source.color === 'cyan' &&
        trace.incomingAtEnd === combiner.cyanInput
      ) {
        cyanPathConnected = true;
      }
      if (
        source.color === 'amber' &&
        trace.incomingAtEnd === combiner.amberInput
      ) {
        amberPathConnected = true;
      }
    }
  }

  const combinerCharged =
    combiner != null && cyanPathConnected && amberPathConnected;
  if (combiner && combinerCharged) {
    traces.push(
      traceBeam({
        board,
        occupancy,
        start: { row: combiner.row, col: combiner.col },
        direction: combiner.outputDirection,
        color: combiner.outputColor,
        sourceId: combiner.id,
        skipStartOptics: true,
      }),
    );
  }

  const hit = new Set<string>();
  for (const trace of traces) {
    for (const id of trace.hitComponentIds) hit.add(id);
  }

  const required = requiredInteractiveIds(board);
  const requiredHitCount = required.filter((id) => hit.has(id)).length;
  const mirrorsHit = mirrors.filter((m) => hit.has(m.id)).length;
  const gatesOpen = gates.filter((g) => hit.has(g.id)).length;

  let heartReached = false;
  if (board.variant === 'dual_fusion') {
    heartReached = traces.some(
      (trace) => trace.color === 'fused' && trace.termination === 'heart',
    );
  } else {
    heartReached = traces.some(
      (trace) => trace.color === 'cyan' && trace.termination === 'heart',
    );
  }

  const allRequiredHit = required.every((id) => hit.has(id));
  const success = heartReached && allRequiredHit && (board.variant !== 'dual_fusion' || combinerCharged);

  return {
    traces,
    success,
    heartReached,
    combinerCharged,
    cyanPathConnected,
    amberPathConnected,
    hitComponentIds: [...hit],
    requiredComponentIds: required,
    requiredHitCount,
    mirrorsHit,
    mirrorsTotal: mirrors.length,
    gatesOpen,
    gatesTotal: gates.length,
    connectedPaths:
      board.variant === 'dual_fusion'
        ? Number(cyanPathConnected) + Number(amberPathConnected)
        : Number(heartReached || mirrorsHit > 0),
    totalPaths: board.variant === 'dual_fusion' ? 2 : 1,
  };
}

export type InteractiveState = {
  mirrors: Record<string, MirrorOrientation>;
  gates: Record<string, GateAxis>;
};

export function readInteractiveState(board: LaserBoard): InteractiveState {
  const mirrors: Record<string, MirrorOrientation> = {};
  const gates: Record<string, GateAxis> = {};
  for (const component of board.components) {
    if (component.kind === 'mirror') mirrors[component.id] = component.orientation;
    if (component.kind === 'gate') gates[component.id] = component.axis;
  }
  return { mirrors, gates };
}

export function applyInteractiveState(
  board: LaserBoard,
  state: InteractiveState,
): LaserBoard {
  return {
    ...board,
    components: board.components.map((component) => {
      if (component.kind === 'mirror' && state.mirrors[component.id]) {
        return { ...component, orientation: state.mirrors[component.id]! };
      }
      if (component.kind === 'gate' && state.gates[component.id]) {
        return { ...component, axis: state.gates[component.id]! };
      }
      return component;
    }),
  };
}

export function rotateComponent(
  board: LaserBoard,
  componentId: string,
): LaserBoard {
  const component = board.components.find((item) => item.id === componentId);
  if (!component) {
    throw new LaserRoutingConfigError(`unknown component "${componentId}"`);
  }
  const current = readInteractiveState(board);
  if (component.kind === 'mirror') {
    return applyInteractiveState(board, {
      ...current,
      mirrors: {
        ...current.mirrors,
        [componentId]: toggleMirrorOrientation(component.orientation),
      },
    });
  }
  if (component.kind === 'gate') {
    return applyInteractiveState(board, {
      ...current,
      gates: {
        ...current.gates,
        [componentId]: toggleGateAxis(component.axis),
      },
    });
  }
  throw new LaserRoutingConfigError(`component "${componentId}" is not interactive`);
}

function interactiveList(board: LaserBoard): Array<
  | { id: string; kind: 'mirror' }
  | { id: string; kind: 'gate' }
> {
  return board.components
    .filter(
      (component): component is LaserMirror | LaserGate =>
        component.kind === 'mirror' || component.kind === 'gate',
    )
    .map((component) => ({ id: component.id, kind: component.kind }));
}

function maskFromState(
  board: LaserBoard,
  state: InteractiveState,
): number {
  const items = interactiveList(board);
  let mask = 0;
  items.forEach((item, index) => {
    const flipped =
      item.kind === 'mirror'
        ? state.mirrors[item.id] === 'backslash'
        : state.gates[item.id] === 'vertical';
    if (flipped) mask |= 1 << index;
  });
  return mask;
}

function stateFromMask(board: LaserBoard, mask: number): InteractiveState {
  const items = interactiveList(board);
  const mirrors: Record<string, MirrorOrientation> = {};
  const gates: Record<string, GateAxis> = {};
  items.forEach((item, index) => {
    const bit = (mask & (1 << index)) !== 0;
    if (item.kind === 'mirror') {
      mirrors[item.id] = bit ? 'backslash' : 'slash';
    } else {
      gates[item.id] = bit ? 'vertical' : 'horizontal';
    }
  });
  return { mirrors, gates };
}

export type LaserSolutionReport = {
  solutionCount: number;
  unique: boolean;
  solvable: boolean;
  solutions: number[];
  minimumMovesFromStart: number;
  startSolved: boolean;
};

export function solveLaserBoard(board: LaserBoard): LaserSolutionReport {
  const items = interactiveList(board);
  if (items.length > 12) {
    throw new LaserRoutingConfigError('too many interactive components for exhaustive solve');
  }
  const startMask = maskFromState(board, readInteractiveState(board));
  const total = 1 << items.length;
  const solutions: number[] = [];
  for (let mask = 0; mask < total; mask += 1) {
    const traced = traceLasers(applyInteractiveState(board, stateFromMask(board, mask)));
    if (traced.success) solutions.push(mask);
  }
  let minimumMovesFromStart = Number.POSITIVE_INFINITY;
  for (const solution of solutions) {
    const distance = hamming(startMask, solution, items.length);
    if (distance < minimumMovesFromStart) minimumMovesFromStart = distance;
  }
  if (!Number.isFinite(minimumMovesFromStart)) minimumMovesFromStart = -1;
  return {
    solutionCount: solutions.length,
    unique: solutions.length === 1,
    solvable: solutions.length > 0,
    solutions,
    minimumMovesFromStart,
    startSolved: solutions.includes(startMask),
  };
}

function hamming(a: number, b: number, bits: number): number {
  let x = (a ^ b) >>> 0;
  let count = 0;
  for (let i = 0; i < bits; i += 1) {
    if (x & (1 << i)) count += 1;
  }
  return count;
}

export type LaserGenerationConfig = {
  variant: LaserRoutingVariant;
  gridWidth?: number;
  gridHeight?: number;
  startDelayMs: number;
  moveBudgetMs: number;
  safetyMarginMs: number;
  maxGenerationAttempts: number;
  minRequiredMoves: number;
  maxRequiredMoves: number;
  requireUniqueSolution: boolean;
  avoidSingleMoveStart: boolean;
  mirrorCount?: number;
  challengeDurationMs: number;
  difficulty: 'easy' | 'medium' | 'hard';
  variantWeights?: Partial<Record<LaserRoutingVariant, number>>;
};

export type LaserGeneratedPuzzle = {
  seed: number;
  variant: LaserRoutingVariant;
  board: LaserBoard;
  solvedBoard: LaserBoard;
  usedFallback: boolean;
  attempts: number;
  solution: LaserSolutionReport;
  solutionState: InteractiveState;
};

function cloneBoard(board: LaserBoard): LaserBoard {
  return {
    width: board.width,
    height: board.height,
    variant: board.variant,
    components: board.components.map((component) => ({ ...component })),
  };
}

function rotateCoordCW(
  coord: LaserCoord,
  width: number,
  height: number,
): LaserCoord {
  return { row: coord.col, col: height - 1 - coord.row };
}

function rotateComponentCW(component: LaserComponent, width: number, height: number): LaserComponent {
  const next = rotateCoordCW(
    { row: component.row, col: component.col },
    width,
    height,
  );
  if (component.kind === 'source') {
    return { ...component, row: next.row, col: next.col, direction: CW[component.direction] };
  }
  if (component.kind === 'mirror') {
    return {
      ...component,
      row: next.row,
      col: next.col,
      orientation: toggleMirrorOrientation(component.orientation),
    };
  }
  if (component.kind === 'gate') {
    return {
      ...component,
      row: next.row,
      col: next.col,
      axis: toggleGateAxis(component.axis),
    };
  }
  if (component.kind === 'combiner') {
    return {
      ...component,
      row: next.row,
      col: next.col,
      cyanInput: CW[component.cyanInput],
      amberInput: CW[component.amberInput],
      outputDirection: CW[component.outputDirection],
    };
  }
  return { ...component, row: next.row, col: next.col };
}

function rotateBoardCW(board: LaserBoard): LaserBoard {
  return {
    width: board.height,
    height: board.width,
    variant: board.variant,
    components: board.components.map((component) =>
      rotateComponentCW(component, board.width, board.height),
    ),
  };
}

function flipHorizontal(board: LaserBoard): LaserBoard {
  const flipDir = (direction: LaserDirection): LaserDirection =>
    direction === 'east' ? 'west' : direction === 'west' ? 'east' : direction;
  return {
    ...board,
    components: board.components.map((component) => {
      const col = board.width - 1 - component.col;
      if (component.kind === 'source') {
        return { ...component, col, direction: flipDir(component.direction) };
      }
      if (component.kind === 'mirror') {
        return {
          ...component,
          col,
          orientation: toggleMirrorOrientation(component.orientation),
        };
      }
      if (component.kind === 'combiner') {
        return {
          ...component,
          col,
          cyanInput: flipDir(component.cyanInput),
          amberInput: flipDir(component.amberInput),
          outputDirection: flipDir(component.outputDirection),
        };
      }
      return { ...component, col };
    }),
  };
}

function classicTemplate(mirrorCount: number): LaserBoard {
  if (mirrorCount <= 3) {
    return {
      width: 4,
      height: 4,
      variant: 'classic',
      components: [
        { id: 'source-cyan', kind: 'source', row: 3, col: 0, direction: 'east', color: 'cyan' },
        { id: 'mirror-1', kind: 'mirror', row: 3, col: 1, orientation: 'slash' },
        { id: 'mirror-2', kind: 'mirror', row: 1, col: 1, orientation: 'slash' },
        { id: 'mirror-3', kind: 'mirror', row: 1, col: 3, orientation: 'backslash' },
        { id: 'heart', kind: 'heart', row: 3, col: 3 },
      ],
    };
  }
  if (mirrorCount === 4) {
    return {
      width: 5,
      height: 5,
      variant: 'classic',
      components: [
        { id: 'source-cyan', kind: 'source', row: 4, col: 0, direction: 'east', color: 'cyan' },
        { id: 'mirror-1', kind: 'mirror', row: 4, col: 1, orientation: 'slash' },
        { id: 'mirror-2', kind: 'mirror', row: 2, col: 1, orientation: 'slash' },
        { id: 'mirror-3', kind: 'mirror', row: 2, col: 3, orientation: 'backslash' },
        { id: 'mirror-4', kind: 'mirror', row: 4, col: 3, orientation: 'backslash' },
        { id: 'heart', kind: 'heart', row: 4, col: 4 },
      ],
    };
  }
  return {
    width: 5,
    height: 5,
    variant: 'classic',
    components: [
      { id: 'source-cyan', kind: 'source', row: 4, col: 0, direction: 'north', color: 'cyan' },
      { id: 'mirror-1', kind: 'mirror', row: 3, col: 0, orientation: 'slash' },
      { id: 'mirror-2', kind: 'mirror', row: 3, col: 1, orientation: 'backslash' },
      { id: 'mirror-3', kind: 'mirror', row: 1, col: 1, orientation: 'slash' },
      { id: 'mirror-4', kind: 'mirror', row: 1, col: 3, orientation: 'backslash' },
      { id: 'mirror-5', kind: 'mirror', row: 3, col: 3, orientation: 'backslash' },
      { id: 'heart', kind: 'heart', row: 3, col: 4 },
    ],
  };
}

function zigzagTemplate(): LaserBoard {
  return {
    width: 8,
    height: 8,
    variant: 'zigzag',
    components: [
      { id: 'source-cyan', kind: 'source', row: 6, col: 0, direction: 'east', color: 'cyan' },
      { id: 'mirror-1', kind: 'mirror', row: 6, col: 3, orientation: 'slash' },
      { id: 'mirror-2', kind: 'mirror', row: 3, col: 3, orientation: 'slash' },
      { id: 'mirror-3', kind: 'mirror', row: 3, col: 5, orientation: 'backslash' },
      { id: 'mirror-4', kind: 'mirror', row: 6, col: 5, orientation: 'backslash' },
      { id: 'heart', kind: 'heart', row: 6, col: 7 },
    ],
  };
}

function dualFusionTemplate(): LaserBoard {
  return {
    width: 5,
    height: 5,
    variant: 'dual_fusion',
    components: [
      { id: 'source-cyan', kind: 'source', row: 4, col: 0, direction: 'east', color: 'cyan' },
      { id: 'source-amber', kind: 'source', row: 4, col: 4, direction: 'west', color: 'amber' },
      { id: 'mirror-cyan-1', kind: 'mirror', row: 4, col: 1, orientation: 'slash' },
      { id: 'mirror-cyan-2', kind: 'mirror', row: 2, col: 1, orientation: 'slash' },
      { id: 'mirror-amber-1', kind: 'mirror', row: 4, col: 3, orientation: 'backslash' },
      { id: 'mirror-amber-2', kind: 'mirror', row: 2, col: 3, orientation: 'backslash' },
      {
        id: 'combiner',
        kind: 'combiner',
        row: 2,
        col: 2,
        cyanInput: 'east',
        amberInput: 'west',
        outputDirection: 'north',
        outputColor: 'fused',
      },
      { id: 'heart', kind: 'heart', row: 0, col: 2 },
    ],
  };
}

function pulseGatesTemplate(): LaserBoard {
  return {
    width: 5,
    height: 5,
    variant: 'pulse_gates',
    components: [
      { id: 'source-cyan', kind: 'source', row: 4, col: 0, direction: 'east', color: 'cyan' },
      { id: 'mirror-1', kind: 'mirror', row: 4, col: 1, orientation: 'slash' },
      { id: 'gate-1', kind: 'gate', row: 3, col: 1, axis: 'vertical' },
      { id: 'mirror-2', kind: 'mirror', row: 2, col: 1, orientation: 'slash' },
      { id: 'gate-2', kind: 'gate', row: 2, col: 2, axis: 'horizontal' },
      { id: 'mirror-3', kind: 'mirror', row: 2, col: 3, orientation: 'backslash' },
      { id: 'gate-3', kind: 'gate', row: 3, col: 3, axis: 'vertical' },
      { id: 'mirror-4', kind: 'mirror', row: 4, col: 3, orientation: 'backslash' },
      { id: 'heart', kind: 'heart', row: 4, col: 4 },
    ],
  };
}

export function fallbackBoardForVariant(
  variant: LaserRoutingVariant,
  mirrorCount = 4,
): LaserBoard {
  switch (variant) {
    case 'classic':
      return classicTemplate(mirrorCount);
    case 'zigzag':
      return zigzagTemplate();
    case 'dual_fusion':
      return dualFusionTemplate();
    case 'pulse_gates':
      return pulseGatesTemplate();
  }
}

function pickVariant(
  rng: () => number,
  config: LaserGenerationConfig,
): LaserRoutingVariant {
  const weights = config.variantWeights;
  if (!weights) return config.variant;
  const entries = LASER_ROUTING_VARIANTS.map((variant) => [
    variant,
    Math.max(0, weights[variant] ?? 0),
  ] as const);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!(total > 0)) return config.variant;
  let cursor = rng() * total;
  for (const [variant, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return variant;
  }
  return entries[entries.length - 1]![0];
}

function transformBoard(
  board: LaserBoard,
  rng: () => number,
): LaserBoard {
  let next = cloneBoard(board);
  const turns = Math.floor(rng() * 4);
  for (let i = 0; i < turns; i += 1) next = rotateBoardCW(next);
  if (rng() < 0.5) next = flipHorizontal(next);
  return next;
}

function scrambleBoard(
  solved: LaserBoard,
  rng: () => number,
  config: LaserGenerationConfig,
): { board: LaserBoard; report: LaserSolutionReport } | null {
  const items = interactiveList(solved);
  const solvedReport = solveLaserBoard(solved);
  if (!solvedReport.solvable) return null;
  if (config.requireUniqueSolution && !solvedReport.unique) return null;
  const solutionMask = solvedReport.solutions[0]!;
  const bits = items.length;
  const minMoves = Math.max(1, config.minRequiredMoves);
  const maxMoves = Math.max(minMoves, config.maxRequiredMoves);

  for (let attempt = 0; attempt < 48; attempt += 1) {
    let mask = solutionMask;
    if (attempt === 0) {
      const needed = Math.min(maxMoves, Math.max(minMoves, 2));
      const indices = items.map((_, index) => index);
      for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [indices[i], indices[j]] = [indices[j]!, indices[i]!];
      }
      for (let i = 0; i < needed; i += 1) mask ^= 1 << indices[i]!;
    } else {
      for (let i = 0; i < bits; i += 1) {
        if (rng() < 0.5) mask ^= 1 << i;
      }
    }
    if (mask === solutionMask) continue;
    const board = applyInteractiveState(solved, stateFromMask(solved, mask));
    const report = solveLaserBoard(board);
    if (!report.solvable) continue;
    if (config.requireUniqueSolution && !report.unique) continue;
    if (report.startSolved) continue;
    if (report.minimumMovesFromStart < minMoves) continue;
    if (report.minimumMovesFromStart > maxMoves) continue;
    if (
      config.avoidSingleMoveStart &&
      report.minimumMovesFromStart <= 1 &&
      config.difficulty !== 'easy'
    ) {
      continue;
    }
    return { board, report };
  }
  return null;
}

export function validateTimingBudget(config: LaserGenerationConfig): void {
  const need =
    config.startDelayMs +
    config.minRequiredMoves * config.moveBudgetMs +
    config.safetyMarginMs;
  if (need > config.challengeDurationMs) {
    throw new LaserRoutingConfigError(
      `duration ${config.challengeDurationMs}ms is too short for ${config.minRequiredMoves} moves (need ${need}ms)`,
    );
  }
}

export function resolveLaserRoutingGenerationConfig(
  serverConfig: Record<string, unknown>,
  challengeDurationMs: number,
): LaserGenerationConfig {
  const difficulty =
    serverConfig['difficulty'] === 'easy' ||
    serverConfig['difficulty'] === 'hard'
      ? serverConfig['difficulty']
      : 'medium';
  const tuning = LASER_ROUTING_DIFFICULTY_TUNING[difficulty];
  const variantRaw = serverConfig['variant'];
  const variant = LASER_ROUTING_VARIANTS.includes(variantRaw as LaserRoutingVariant)
    ? (variantRaw as LaserRoutingVariant)
    : 'classic';
  const weightsRaw = serverConfig['variantWeights'];
  const variantWeights =
    weightsRaw && typeof weightsRaw === 'object'
      ? (weightsRaw as Partial<Record<LaserRoutingVariant, number>>)
      : undefined;
  const config: LaserGenerationConfig = {
    variant,
    gridWidth: num(serverConfig['gridWidth'], fallbackWidth(variant)),
    gridHeight: num(serverConfig['gridHeight'], fallbackHeight(variant)),
    startDelayMs: num(serverConfig['startDelayMs'], tuning.startDelayMs),
    moveBudgetMs: num(serverConfig['moveBudgetMs'], tuning.moveBudgetMs),
    safetyMarginMs: num(
      serverConfig['safetyMarginMs'],
      LASER_ROUTING_DEFAULT_CONFIG.safetyMarginMs,
    ),
    maxGenerationAttempts: num(
      serverConfig['maxGenerationAttempts'],
      LASER_ROUTING_DEFAULT_CONFIG.maxGenerationAttempts,
    ),
    minRequiredMoves: num(serverConfig['minRequiredMoves'], tuning.minRequiredMoves),
    maxRequiredMoves: num(serverConfig['maxRequiredMoves'], tuning.maxRequiredMoves),
    requireUniqueSolution: serverConfig['requireUniqueSolution'] !== false,
    avoidSingleMoveStart: serverConfig['avoidSingleMoveStart'] !== false,
    mirrorCount: num(serverConfig['mirrorCount'], tuning.mirrorCount),
    challengeDurationMs,
    difficulty,
  };
  if (variantWeights) {
    config.variantWeights = variantWeights;
  }
  validateTimingBudget(config);
  return config;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fallbackWidth(variant: LaserRoutingVariant): number {
  if (variant === 'zigzag') return 8;
  if (variant === 'classic') return 4;
  return 5;
}

function fallbackHeight(variant: LaserRoutingVariant): number {
  if (variant === 'zigzag') return 8;
  if (variant === 'classic') return 4;
  return 5;
}

export function generateLaserRoutingPuzzle(input: {
  seed: number;
  config: LaserGenerationConfig;
}): LaserGeneratedPuzzle {
  validateTimingBudget(input.config);
  const rng = createSeededRng(input.seed);
  const variant = pickVariant(rng, input.config);
  const mirrorCount =
    variant === 'classic'
      ? Math.min(5, Math.max(3, input.config.mirrorCount ?? 4))
      : variant === 'zigzag' || variant === 'pulse_gates'
        ? 4
        : 4;
  const attempts = Math.max(1, Math.min(48, input.config.maxGenerationAttempts));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const solved = transformBoard(fallbackBoardForVariant(variant, mirrorCount), rng);
    const scrambled = scrambleBoard(solved, rng, {
      ...input.config,
      variant,
    });
    if (!scrambled) continue;
    const live = traceLasers(scrambled.board);
    if (live.success) continue;
    return {
      seed: input.seed,
      variant,
      board: scrambled.board,
      solvedBoard: solved,
      usedFallback: false,
      attempts: attempt,
      solution: scrambled.report,
      solutionState: readInteractiveState(solved),
    };
  }

  const solved = fallbackBoardForVariant(variant, mirrorCount);
  const solvedReport = solveLaserBoard(solved);
  const items = interactiveList(solved);
  let mask = maskFromState(solved, readInteractiveState(solved));
  const flips = Math.min(
    items.length,
    Math.max(input.config.minRequiredMoves, 2),
  );
  for (let i = 0; i < flips; i += 1) mask ^= 1 << i;
  const board = applyInteractiveState(solved, stateFromMask(solved, mask));
  const report = solveLaserBoard(board);
  return {
    seed: input.seed,
    variant,
    board,
    solvedBoard: solved,
    usedFallback: true,
    attempts,
    solution: report,
    solutionState: readInteractiveState(solved),
  };
}

export type LaserPublicBoard = {
  width: number;
  height: number;
  variant: LaserRoutingVariant;
  components: Array<{
    id: string;
    kind: LaserComponent['kind'];
    row: number;
    col: number;
    orientation?: MirrorOrientation;
    axis?: GateAxis;
    direction?: LaserDirection;
    color?: LaserColor;
    cyanInput?: LaserDirection;
    amberInput?: LaserDirection;
    outputDirection?: LaserDirection;
    interactive: boolean;
  }>;
};

export function toPublicBoard(board: LaserBoard): LaserPublicBoard {
  return {
    width: board.width,
    height: board.height,
    variant: board.variant,
    components: board.components.map((component) => {
      const base = {
        id: component.id,
        kind: component.kind,
        row: component.row,
        col: component.col,
        interactive: component.kind === 'mirror' || component.kind === 'gate',
      };
      if (component.kind === 'mirror') {
        return { ...base, orientation: component.orientation };
      }
      if (component.kind === 'gate') {
        return { ...base, axis: component.axis };
      }
      if (component.kind === 'source') {
        return { ...base, direction: component.direction, color: component.color };
      }
      if (component.kind === 'combiner') {
        return {
          ...base,
          color: component.outputColor,
          cyanInput: component.cyanInput,
          amberInput: component.amberInput,
          outputDirection: component.outputDirection,
        };
      }
      return base;
    }),
  };
}

export function toPublicTraces(result: LaserTraceResult): Array<{
  sourceId: string;
  color: LaserColor;
  cells: LaserCoord[];
  hitComponentIds: string[];
  termination: LaserTraceTermination;
  blockedComponentId: string | null;
}> {
  return result.traces.map((trace) => ({
    sourceId: trace.sourceId,
    color: trace.color,
    cells: trace.cells,
    hitComponentIds: trace.hitComponentIds,
    termination: trace.termination,
    blockedComponentId: trace.blockedComponentId,
  }));
}

export function previewLaserRoutingPuzzle(input: {
  seed: number;
  serverConfig: Record<string, unknown>;
  challengeDurationMs: number;
}): {
  seed: number;
  variant: LaserRoutingVariant;
  board: LaserPublicBoard;
  traces: ReturnType<typeof toPublicTraces>;
  solvedBoard: LaserPublicBoard;
  solvedTraces: ReturnType<typeof toPublicTraces>;
  solvable: boolean;
  unique: boolean;
  startSolved: boolean;
  minimumMoves: number;
  usedFallback: boolean;
  progress: {
    mirrorsHit: number;
    mirrorsTotal: number;
    gatesOpen: number;
    gatesTotal: number;
    connectedPaths: number;
    totalPaths: number;
  };
} {
  const config = resolveLaserRoutingGenerationConfig(
    input.serverConfig,
    input.challengeDurationMs,
  );
  const generated = generateLaserRoutingPuzzle({ seed: input.seed, config });
  const live = traceLasers(generated.board);
  const solved = traceLasers(generated.solvedBoard);
  return {
    seed: generated.seed,
    variant: generated.variant,
    board: toPublicBoard(generated.board),
    traces: toPublicTraces(live),
    solvedBoard: toPublicBoard(generated.solvedBoard),
    solvedTraces: toPublicTraces(solved),
    solvable: generated.solution.solvable,
    unique: generated.solution.unique,
    startSolved: generated.solution.startSolved,
    minimumMoves: generated.solution.minimumMovesFromStart,
    usedFallback: generated.usedFallback,
    progress: {
      mirrorsHit: live.mirrorsHit,
      mirrorsTotal: live.mirrorsTotal,
      gatesOpen: live.gatesOpen,
      gatesTotal: live.gatesTotal,
      connectedPaths: live.connectedPaths,
      totalPaths: live.totalPaths,
    },
  };
}
