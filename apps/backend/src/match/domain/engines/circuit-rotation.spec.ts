import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  precisionCircuitRotationServerConfigSchema,
  validateEngineConfigs,
} from '@thelastheart/contracts';
import {
  evaluateCircuit,
  portsForShape,
  rotatePorts,
  type CircuitRotationEvaluationInput,
} from './circuit-rotation';

function loadCircuitFixture(): {
  engineId: string;
  clientConfig: unknown;
  serverConfig: unknown;
} {
  return JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '..',
        '..',
        'challenges',
        'fixtures',
        'precision.circuit_rotation.v1.json',
      ),
      'utf8',
    ),
  ) as {
    engineId: string;
    clientConfig: unknown;
    serverConfig: unknown;
  };
}

function circuit(
  overrides: Partial<CircuitRotationEvaluationInput> = {},
): CircuitRotationEvaluationInput {
  return {
    grid: { rows: 1, columns: 2 },
    source: { cell: [0, 0], side: 'west' },
    target: { cell: [0, 1], side: 'east', kind: 'heart' },
    tiles: [
      {
        id: 'source-tile',
        cell: [0, 0],
        shape: 'straight',
        initialQuarterTurns: 1,
        movable: true,
      },
      {
        id: 'target-tile',
        cell: [0, 1],
        shape: 'straight',
        initialQuarterTurns: 1,
        movable: true,
      },
    ],
    stationaryConnections: [
      { cell: [0, 0], side: 'west' },
      { cell: [0, 1], side: 'east' },
    ],
    tileQuarterTurns: {},
    requireAllConfiguredTilesPowered: true,
    ...overrides,
  };
}

describe('circuit rotation solver', () => {
  it('rotates straight and corner ports clockwise', () => {
    expect(portsForShape('straight')).toEqual(['north', 'south']);
    expect(rotatePorts(portsForShape('straight'), 1)).toEqual(['east', 'west']);
    expect(rotatePorts(portsForShape('straight'), 2)).toEqual([
      'south',
      'north',
    ]);
    expect(rotatePorts(portsForShape('corner'), 0)).toEqual(['north', 'east']);
    expect(rotatePorts(portsForShape('corner'), 1)).toEqual(['east', 'south']);
    expect(rotatePorts(portsForShape('corner'), 2)).toEqual(['south', 'west']);
    expect(rotatePorts(portsForShape('corner'), 3)).toEqual(['west', 'north']);
    expect(rotatePorts(portsForShape('corner'), -1)).toEqual(['west', 'north']);
  });

  it('requires reciprocal ports between neighboring tiles', () => {
    const result = evaluateCircuit(
      circuit({
        tileQuarterTurns: { 'target-tile': 0 },
      }),
    );

    expect(result.poweredTileIds).toEqual(['source-tile']);
    expect(result.targetReached).toBe(false);
    expect(result.success).toBe(false);
  });

  it('keeps a correctly oriented downstream tile unpowered across a gap', () => {
    const result = evaluateCircuit(
      circuit({
        grid: { rows: 1, columns: 3 },
        target: { cell: [0, 2], side: 'east', kind: 'heart' },
        tiles: [
          {
            id: 'source-tile',
            cell: [0, 0],
            shape: 'straight',
            initialQuarterTurns: 1,
            movable: false,
          },
          {
            id: 'gap-tile',
            cell: [0, 1],
            shape: 'straight',
            initialQuarterTurns: 0,
            movable: false,
          },
          {
            id: 'target-tile',
            cell: [0, 2],
            shape: 'straight',
            initialQuarterTurns: 1,
            movable: false,
          },
        ],
        stationaryConnections: [
          { cell: [0, 0], side: 'west' },
          { cell: [0, 2], side: 'east' },
        ],
      }),
    );

    expect(result.poweredTileIds).toEqual(['source-tile']);
    expect(result.poweredTileIds).not.toContain('target-tile');
    expect(result.success).toBe(false);
  });

  it('powers a complete source-to-heart path', () => {
    const result = evaluateCircuit(
      circuit({
        grid: { rows: 3, columns: 3 },
        source: { cell: [2, 0], side: 'south' },
        target: { cell: [0, 2], side: 'north', kind: 'heart' },
        tiles: [
          {
            id: 'source-corner',
            cell: [2, 0],
            shape: 'corner',
            initialQuarterTurns: 1,
            movable: false,
          },
          {
            id: 'bottom-turn',
            cell: [2, 1],
            shape: 'corner',
            initialQuarterTurns: 0,
            movable: true,
          },
          {
            id: 'middle-straight',
            cell: [1, 1],
            shape: 'straight',
            initialQuarterTurns: 0,
            movable: false,
          },
          {
            id: 'top-turn',
            cell: [0, 1],
            shape: 'corner',
            initialQuarterTurns: 2,
            movable: true,
          },
          {
            id: 'heart-corner',
            cell: [0, 2],
            shape: 'corner',
            initialQuarterTurns: 3,
            movable: false,
          },
        ],
        stationaryConnections: [
          { cell: [2, 0], side: 'south' },
          { cell: [0, 2], side: 'north' },
        ],
        tileQuarterTurns: {
          'bottom-turn': 3,
          'top-turn': 1,
        },
      }),
    );

    expect(result.poweredTileIds).toEqual([
      'source-corner',
      'bottom-turn',
      'middle-straight',
      'top-turn',
      'heart-corner',
    ]);
    expect(result.targetReached).toBe(true);
    expect(result.success).toBe(true);
  });

  it('fails when a path has a gap', () => {
    const result = evaluateCircuit(
      circuit({
        tileQuarterTurns: { 'target-tile': 0 },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.targetReached).toBe(false);
  });

  it('requires every configured tile when the rule is enabled', () => {
    const withExtraTile = circuit({
      grid: { rows: 2, columns: 2 },
      tiles: [
        ...circuit().tiles,
        {
          id: 'disconnected',
          cell: [1, 0],
          shape: 'corner',
          initialQuarterTurns: 0,
          movable: false,
        },
      ],
    });

    expect(evaluateCircuit(withExtraTile)).toMatchObject({
      targetReached: true,
      success: false,
    });
    expect(
      evaluateCircuit({
        ...withExtraTile,
        requireAllConfiguredTilesPowered: false,
      }).success,
    ).toBe(true);
  });

  it('ignores submitted rotations for immovable tiles', () => {
    const result = evaluateCircuit(
      circuit({
        tiles: circuit().tiles.map((tile) => ({ ...tile, movable: false })),
        tileQuarterTurns: {
          'source-tile': 0,
          'target-tile': 0,
        },
      }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects invalid cells, duplicate tiles, and unsupported shapes', () => {
    const serverConfig = precisionCircuitRotationServerConfigSchema.parse(
      loadCircuitFixture().serverConfig,
    );
    const duplicateId = {
      ...serverConfig,
      tiles: serverConfig.tiles.map((tile, index) =>
        index === 1 ? { ...tile, id: serverConfig.tiles[0]!.id } : tile,
      ),
    };
    const duplicateCell = {
      ...serverConfig,
      tiles: serverConfig.tiles.map((tile, index) =>
        index === 1 ? { ...tile, cell: serverConfig.tiles[0]!.cell } : tile,
      ),
    };
    const outOfBounds = {
      ...serverConfig,
      target: { ...serverConfig.target, cell: [3, 2] },
    };
    const unsupportedShape = {
      ...serverConfig,
      tiles: [
        { ...serverConfig.tiles[0], shape: 'tee' },
        ...serverConfig.tiles.slice(1),
      ],
    };

    expect(
      precisionCircuitRotationServerConfigSchema.safeParse(duplicateId).success,
    ).toBe(false);
    expect(
      precisionCircuitRotationServerConfigSchema.safeParse(duplicateCell)
        .success,
    ).toBe(false);
    expect(
      precisionCircuitRotationServerConfigSchema.safeParse(outOfBounds).success,
    ).toBe(false);
    expect(
      precisionCircuitRotationServerConfigSchema.safeParse(unsupportedShape)
        .success,
    ).toBe(false);
  });

  it('keeps all five fixture variants solvable as movable tiles increase', () => {
    const fixture = loadCircuitFixture();
    expect(() =>
      validateEngineConfigs(
        fixture.engineId,
        fixture.clientConfig,
        fixture.serverConfig,
      ),
    ).not.toThrow();

    const serverConfig = precisionCircuitRotationServerConfigSchema.parse(
      fixture.serverConfig,
    );
    const solution = {
      'source-corner': 1,
      'bottom-turn': 3,
      'center-straight': 0,
      'top-turn': 1,
      'heart-corner': 3,
    };
    expect(
      serverConfig.variants?.map(
        (variant) => variant.tiles.filter((tile) => tile.movable).length,
      ),
    ).toEqual([1, 2, 3, 4, 5]);

    for (const variant of serverConfig.variants ?? []) {
      expect(
        evaluateCircuit({
          grid: variant.grid,
          source: variant.source,
          target: variant.target,
          tiles: variant.tiles,
          stationaryConnections: variant.stationaryConnections,
          tileQuarterTurns: solution,
          requireAllConfiguredTilesPowered:
            variant.requireAllConfiguredTilesPowered ??
            serverConfig.requireAllConfiguredTilesPowered,
        }).success,
      ).toBe(true);
    }
  });
});
