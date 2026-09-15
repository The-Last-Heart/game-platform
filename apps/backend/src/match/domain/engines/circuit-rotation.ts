import type {
  CircuitRotationGrid,
  CircuitRotationShape,
  CircuitRotationSide,
  CircuitRotationSource,
  CircuitRotationStationaryConnection,
  CircuitRotationTarget,
  CircuitRotationTile,
} from '@thelastheart/contracts';

const SIDES: readonly CircuitRotationSide[] = [
  'north',
  'east',
  'south',
  'west',
];

const OPPOSITE_SIDE: Record<CircuitRotationSide, CircuitRotationSide> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
};

const CELL_OFFSET: Record<CircuitRotationSide, readonly [number, number]> = {
  north: [-1, 0],
  east: [0, 1],
  south: [1, 0],
  west: [0, -1],
};

export type CircuitRotationEvaluationInput = {
  grid: CircuitRotationGrid;
  source: CircuitRotationSource;
  target: CircuitRotationTarget;
  tiles: CircuitRotationTile[];
  stationaryConnections: CircuitRotationStationaryConnection[];
  tileQuarterTurns: Record<string, number>;
  requireAllConfiguredTilesPowered: boolean;
};

export type CircuitRotationEvaluation = {
  success: boolean;
  poweredTileIds: string[];
  targetReached: boolean;
};

function normalizedQuarterTurns(quarterTurns: number): number {
  const integerTurns = Number.isFinite(quarterTurns)
    ? Math.trunc(quarterTurns)
    : 0;
  return ((integerTurns % 4) + 4) % 4;
}

export function rotatePorts(
  ports: readonly CircuitRotationSide[],
  quarterTurns: number,
): CircuitRotationSide[] {
  const turns = normalizedQuarterTurns(quarterTurns);
  return ports.map((port) => {
    const index = SIDES.indexOf(port);
    return SIDES[(index + turns) % SIDES.length]!;
  });
}

export function portsForShape(
  shape: CircuitRotationShape,
): CircuitRotationSide[] {
  switch (shape) {
    case 'straight':
      return ['north', 'south'];
    case 'corner':
      return ['north', 'east'];
  }
}

function cellKey(row: number, column: number): string {
  return `${row},${column}`;
}

export function evaluateCircuit(
  input: CircuitRotationEvaluationInput,
): CircuitRotationEvaluation {
  const tileByCell = new Map<string, CircuitRotationTile>();
  const portsByTileId = new Map<string, Set<CircuitRotationSide>>();

  for (const tile of input.tiles) {
    tileByCell.set(cellKey(tile.cell[0], tile.cell[1]), tile);
    const submittedTurns = input.tileQuarterTurns[tile.id];
    const quarterTurns =
      tile.movable && submittedTurns != null
        ? submittedTurns
        : tile.initialQuarterTurns;
    portsByTileId.set(
      tile.id,
      new Set(rotatePorts(portsForShape(tile.shape), quarterTurns)),
    );
  }

  const sourceTile = tileByCell.get(
    cellKey(input.source.cell[0], input.source.cell[1]),
  );
  if (
    !sourceTile ||
    !portsByTileId.get(sourceTile.id)?.has(input.source.side)
  ) {
    return { success: false, poweredTileIds: [], targetReached: false };
  }

  const poweredTileIds: string[] = [];
  const powered = new Set<string>([sourceTile.id]);
  const queue: CircuitRotationTile[] = [sourceTile];

  while (queue.length > 0) {
    const tile = queue.shift()!;
    poweredTileIds.push(tile.id);
    const ports = portsByTileId.get(tile.id)!;

    for (const side of ports) {
      const [rowOffset, columnOffset] = CELL_OFFSET[side];
      const neighbor = tileByCell.get(
        cellKey(tile.cell[0] + rowOffset, tile.cell[1] + columnOffset),
      );
      if (
        !neighbor ||
        powered.has(neighbor.id) ||
        !portsByTileId.get(neighbor.id)?.has(OPPOSITE_SIDE[side])
      ) {
        continue;
      }
      powered.add(neighbor.id);
      queue.push(neighbor);
    }
  }

  const targetTile = tileByCell.get(
    cellKey(input.target.cell[0], input.target.cell[1]),
  );
  const targetReached =
    targetTile != null &&
    powered.has(targetTile.id) &&
    portsByTileId.get(targetTile.id)?.has(input.target.side) === true;
  const allConfiguredTilesPowered = input.tiles.every((tile) =>
    powered.has(tile.id),
  );
  const success =
    targetReached &&
    (!input.requireAllConfiguredTilesPowered || allConfiguredTilesPowered);

  return { success, poweredTileIds, targetReached };
}
