import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/circuit_rotation_solver.dart';

CircuitRotationEvaluationInput _twoTileCircuit({
  Map<String, int> tileQuarterTurns = const <String, int>{},
}) {
  return CircuitRotationEvaluationInput(
    grid: const CircuitRotationGrid(rows: 1, columns: 2),
    source: const CircuitRotationSource(
      cell: CircuitRotationCell(0, 0),
      side: CircuitRotationSide.west,
    ),
    target: const CircuitRotationTarget(
      cell: CircuitRotationCell(0, 1),
      side: CircuitRotationSide.east,
    ),
    tiles: const <CircuitRotationTile>[
      CircuitRotationTile(
        id: 'source-tile',
        cell: CircuitRotationCell(0, 0),
        shape: CircuitRotationShape.straight,
        initialQuarterTurns: 1,
        movable: true,
      ),
      CircuitRotationTile(
        id: 'target-tile',
        cell: CircuitRotationCell(0, 1),
        shape: CircuitRotationShape.straight,
        initialQuarterTurns: 1,
        movable: true,
      ),
    ],
    stationaryConnections: const <CircuitRotationStationaryConnection>[
      CircuitRotationStationaryConnection(
        cell: CircuitRotationCell(0, 0),
        side: CircuitRotationSide.west,
      ),
      CircuitRotationStationaryConnection(
        cell: CircuitRotationCell(0, 1),
        side: CircuitRotationSide.east,
      ),
    ],
    tileQuarterTurns: tileQuarterTurns,
    requireAllConfiguredTilesPowered: true,
  );
}

void main() {
  test('rotates straight and corner ports clockwise', () {
    expect(
      rotateCircuitPorts(
        portsForCircuitShape(CircuitRotationShape.straight),
        1,
      ),
      <CircuitRotationSide>[CircuitRotationSide.east, CircuitRotationSide.west],
    );
    expect(
      rotateCircuitPorts(
        portsForCircuitShape(CircuitRotationShape.straight),
        2,
      ),
      <CircuitRotationSide>[
        CircuitRotationSide.south,
        CircuitRotationSide.north,
      ],
    );
    expect(
      rotateCircuitPorts(portsForCircuitShape(CircuitRotationShape.corner), -1),
      <CircuitRotationSide>[
        CircuitRotationSide.west,
        CircuitRotationSide.north,
      ],
    );
  });

  test('requires reciprocal ports between neighboring tiles', () {
    final CircuitRotationEvaluation result = evaluateCircuitRotation(
      _twoTileCircuit(tileQuarterTurns: const <String, int>{'target-tile': 0}),
    );

    expect(result.poweredTileIds, <String>['source-tile']);
    expect(result.targetReached, isFalse);
    expect(result.success, isFalse);
  });

  test('leaves a correctly oriented tile unlit across a disconnected gap', () {
    final CircuitRotationEvaluation result = evaluateCircuitRotation(
      CircuitRotationEvaluationInput(
        grid: const CircuitRotationGrid(rows: 1, columns: 3),
        source: const CircuitRotationSource(
          cell: CircuitRotationCell(0, 0),
          side: CircuitRotationSide.west,
        ),
        target: const CircuitRotationTarget(
          cell: CircuitRotationCell(0, 2),
          side: CircuitRotationSide.east,
        ),
        tiles: const <CircuitRotationTile>[
          CircuitRotationTile(
            id: 'source-tile',
            cell: CircuitRotationCell(0, 0),
            shape: CircuitRotationShape.straight,
            initialQuarterTurns: 1,
            movable: false,
          ),
          CircuitRotationTile(
            id: 'gap-tile',
            cell: CircuitRotationCell(0, 1),
            shape: CircuitRotationShape.straight,
            initialQuarterTurns: 0,
            movable: false,
          ),
          CircuitRotationTile(
            id: 'target-tile',
            cell: CircuitRotationCell(0, 2),
            shape: CircuitRotationShape.straight,
            initialQuarterTurns: 1,
            movable: false,
          ),
        ],
        stationaryConnections: const <CircuitRotationStationaryConnection>[
          CircuitRotationStationaryConnection(
            cell: CircuitRotationCell(0, 0),
            side: CircuitRotationSide.west,
          ),
          CircuitRotationStationaryConnection(
            cell: CircuitRotationCell(0, 2),
            side: CircuitRotationSide.east,
          ),
        ],
        tileQuarterTurns: const <String, int>{},
        requireAllConfiguredTilesPowered: true,
      ),
    );

    expect(result.poweredTileIds, <String>['source-tile']);
    expect(result.poweredTileIds, isNot(contains('target-tile')));
    expect(result.success, isFalse);
  });

  test('powers the primary fixture solution through all five tiles', () {
    final CircuitRotationEvaluation result = evaluateCircuitRotation(
      CircuitRotationEvaluationInput(
        grid: const CircuitRotationGrid(rows: 3, columns: 3),
        source: const CircuitRotationSource(
          cell: CircuitRotationCell(2, 0),
          side: CircuitRotationSide.south,
        ),
        target: const CircuitRotationTarget(
          cell: CircuitRotationCell(0, 2),
          side: CircuitRotationSide.north,
        ),
        tiles: const <CircuitRotationTile>[
          CircuitRotationTile(
            id: 'source-corner',
            cell: CircuitRotationCell(2, 0),
            shape: CircuitRotationShape.corner,
            initialQuarterTurns: 1,
            movable: false,
          ),
          CircuitRotationTile(
            id: 'bottom-turn',
            cell: CircuitRotationCell(2, 1),
            shape: CircuitRotationShape.corner,
            initialQuarterTurns: 0,
            movable: true,
          ),
          CircuitRotationTile(
            id: 'center-straight',
            cell: CircuitRotationCell(1, 1),
            shape: CircuitRotationShape.straight,
            initialQuarterTurns: 0,
            movable: false,
          ),
          CircuitRotationTile(
            id: 'top-turn',
            cell: CircuitRotationCell(0, 1),
            shape: CircuitRotationShape.corner,
            initialQuarterTurns: 2,
            movable: true,
          ),
          CircuitRotationTile(
            id: 'heart-corner',
            cell: CircuitRotationCell(0, 2),
            shape: CircuitRotationShape.corner,
            initialQuarterTurns: 3,
            movable: false,
          ),
        ],
        stationaryConnections: const <CircuitRotationStationaryConnection>[
          CircuitRotationStationaryConnection(
            cell: CircuitRotationCell(2, 0),
            side: CircuitRotationSide.south,
          ),
          CircuitRotationStationaryConnection(
            cell: CircuitRotationCell(0, 2),
            side: CircuitRotationSide.north,
          ),
        ],
        tileQuarterTurns: const <String, int>{
          'source-corner': 1,
          'bottom-turn': 3,
          'center-straight': 0,
          'top-turn': 1,
          'heart-corner': 3,
        },
        requireAllConfiguredTilesPowered: true,
      ),
    );

    expect(result.poweredTileIds, <String>[
      'source-corner',
      'bottom-turn',
      'center-straight',
      'top-turn',
      'heart-corner',
    ]);
    expect(result.targetReached, isTrue);
    expect(result.success, isTrue);
  });

  test('power delta fires only for newly connected tiles and heart', () {
    final CircuitRotationEvaluation disconnected = evaluateCircuitRotation(
      _twoTileCircuit(
        tileQuarterTurns: const <String, int>{
          'source-tile': 0,
          'target-tile': 1,
        },
      ),
    );
    expect(disconnected.poweredTileIds, isEmpty);
    expect(disconnected.targetReached, isFalse);

    final CircuitRotationEvaluation rotatedWithoutConnect =
        evaluateCircuitRotation(
          _twoTileCircuit(
            tileQuarterTurns: const <String, int>{
              'source-tile': 2,
              'target-tile': 1,
            },
          ),
        );
    final CircuitRotationPowerDelta rotateOnly = circuitRotationPowerDelta(
      previousPoweredTileIds: disconnected.poweredTileIds.toSet(),
      previousTargetReached: disconnected.targetReached,
      next: rotatedWithoutConnect,
    );
    expect(rotateOnly.newlyPoweredCount, 0);
    expect(rotateOnly.heartNewlyReached, isFalse);

    final CircuitRotationEvaluation solved = evaluateCircuitRotation(
      _twoTileCircuit(),
    );
    final CircuitRotationPowerDelta connected = circuitRotationPowerDelta(
      previousPoweredTileIds: disconnected.poweredTileIds.toSet(),
      previousTargetReached: disconnected.targetReached,
      next: solved,
    );
    expect(connected.newlyPoweredCount, greaterThan(0));
    expect(connected.heartNewlyReached, isTrue);

    final CircuitRotationPowerDelta alreadyOn = circuitRotationPowerDelta(
      previousPoweredTileIds: solved.poweredTileIds.toSet(),
      previousTargetReached: solved.targetReached,
      next: solved,
    );
    expect(alreadyOn.newlyPoweredCount, 0);
    expect(alreadyOn.heartNewlyReached, isFalse);
  });
}
