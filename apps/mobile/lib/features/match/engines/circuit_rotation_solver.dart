import 'dart:collection';

enum CircuitRotationSide { north, east, south, west }

enum CircuitRotationShape { straight, corner }

const List<CircuitRotationSide> circuitRotationSides = <CircuitRotationSide>[
  CircuitRotationSide.north,
  CircuitRotationSide.east,
  CircuitRotationSide.south,
  CircuitRotationSide.west,
];

CircuitRotationSide? circuitRotationSideFromName(String? name) {
  for (final CircuitRotationSide side in circuitRotationSides) {
    if (side.name == name) return side;
  }
  return null;
}

CircuitRotationShape? circuitRotationShapeFromName(String? name) {
  for (final CircuitRotationShape shape in CircuitRotationShape.values) {
    if (shape.name == name) return shape;
  }
  return null;
}

CircuitRotationSide oppositeCircuitRotationSide(CircuitRotationSide side) {
  return circuitRotationSides[(side.index + 2) % circuitRotationSides.length];
}

int normalizedCircuitQuarterTurns(int quarterTurns) {
  return ((quarterTurns % 4) + 4) % 4;
}

List<CircuitRotationSide> portsForCircuitShape(CircuitRotationShape shape) {
  return switch (shape) {
    CircuitRotationShape.straight => const <CircuitRotationSide>[
      CircuitRotationSide.north,
      CircuitRotationSide.south,
    ],
    CircuitRotationShape.corner => const <CircuitRotationSide>[
      CircuitRotationSide.north,
      CircuitRotationSide.east,
    ],
  };
}

List<CircuitRotationSide> rotateCircuitPorts(
  Iterable<CircuitRotationSide> ports,
  int quarterTurns,
) {
  final int turns = normalizedCircuitQuarterTurns(quarterTurns);
  return ports
      .map(
        (CircuitRotationSide port) =>
            circuitRotationSides[(port.index + turns) %
                circuitRotationSides.length],
      )
      .toList(growable: false);
}

class CircuitRotationCell {
  const CircuitRotationCell(this.row, this.column);

  final int row;
  final int column;

  String get key => '$row,$column';

  @override
  bool operator ==(Object other) {
    return other is CircuitRotationCell &&
        row == other.row &&
        column == other.column;
  }

  @override
  int get hashCode => Object.hash(row, column);
}

class CircuitRotationGrid {
  const CircuitRotationGrid({required this.rows, required this.columns});

  final int rows;
  final int columns;
}

class CircuitRotationSource {
  const CircuitRotationSource({required this.cell, required this.side});

  final CircuitRotationCell cell;
  final CircuitRotationSide side;
}

class CircuitRotationTarget {
  const CircuitRotationTarget({
    required this.cell,
    required this.side,
    this.kind = 'heart',
  });

  final CircuitRotationCell cell;
  final CircuitRotationSide side;
  final String kind;
}

class CircuitRotationTile {
  const CircuitRotationTile({
    required this.id,
    required this.cell,
    required this.shape,
    required this.initialQuarterTurns,
    required this.movable,
  });

  final String id;
  final CircuitRotationCell cell;
  final CircuitRotationShape shape;
  final int initialQuarterTurns;
  final bool movable;
}

class CircuitRotationStationaryConnection {
  const CircuitRotationStationaryConnection({
    required this.cell,
    required this.side,
  });

  final CircuitRotationCell cell;
  final CircuitRotationSide side;
}

class CircuitRotationEvaluationInput {
  const CircuitRotationEvaluationInput({
    required this.grid,
    required this.source,
    required this.target,
    required this.tiles,
    required this.stationaryConnections,
    required this.tileQuarterTurns,
    required this.requireAllConfiguredTilesPowered,
  });

  final CircuitRotationGrid grid;
  final CircuitRotationSource source;
  final CircuitRotationTarget target;
  final List<CircuitRotationTile> tiles;
  final List<CircuitRotationStationaryConnection> stationaryConnections;
  final Map<String, int> tileQuarterTurns;
  final bool requireAllConfiguredTilesPowered;
}

class CircuitRotationEvaluation {
  const CircuitRotationEvaluation({
    required this.success,
    required this.poweredTileIds,
    required this.targetReached,
  });

  final bool success;
  final List<String> poweredTileIds;
  final bool targetReached;
}

CircuitRotationEvaluation evaluateCircuitRotation(
  CircuitRotationEvaluationInput input,
) {
  final Map<String, CircuitRotationTile> tileByCell =
      <String, CircuitRotationTile>{};
  final Map<String, Set<CircuitRotationSide>> portsByTileId =
      <String, Set<CircuitRotationSide>>{};

  for (final CircuitRotationTile tile in input.tiles) {
    tileByCell[tile.cell.key] = tile;
    final int? submittedTurns = input.tileQuarterTurns[tile.id];
    final int quarterTurns = tile.movable && submittedTurns != null
        ? submittedTurns
        : tile.initialQuarterTurns;
    portsByTileId[tile.id] = rotateCircuitPorts(
      portsForCircuitShape(tile.shape),
      quarterTurns,
    ).toSet();
  }

  final CircuitRotationTile? sourceTile = tileByCell[input.source.cell.key];
  if (sourceTile == null ||
      !(portsByTileId[sourceTile.id]?.contains(input.source.side) ?? false)) {
    return const CircuitRotationEvaluation(
      success: false,
      poweredTileIds: <String>[],
      targetReached: false,
    );
  }

  final List<String> poweredTileIds = <String>[];
  final Set<String> powered = <String>{sourceTile.id};
  final Queue<CircuitRotationTile> queue = Queue<CircuitRotationTile>()
    ..add(sourceTile);

  while (queue.isNotEmpty) {
    final CircuitRotationTile tile = queue.removeFirst();
    poweredTileIds.add(tile.id);
    final Set<CircuitRotationSide> ports = portsByTileId[tile.id]!;

    for (final CircuitRotationSide side in ports) {
      final CircuitRotationCell neighborCell = switch (side) {
        CircuitRotationSide.north => CircuitRotationCell(
          tile.cell.row - 1,
          tile.cell.column,
        ),
        CircuitRotationSide.east => CircuitRotationCell(
          tile.cell.row,
          tile.cell.column + 1,
        ),
        CircuitRotationSide.south => CircuitRotationCell(
          tile.cell.row + 1,
          tile.cell.column,
        ),
        CircuitRotationSide.west => CircuitRotationCell(
          tile.cell.row,
          tile.cell.column - 1,
        ),
      };
      final CircuitRotationTile? neighbor = tileByCell[neighborCell.key];
      if (neighbor == null ||
          powered.contains(neighbor.id) ||
          !(portsByTileId[neighbor.id]?.contains(
                oppositeCircuitRotationSide(side),
              ) ??
              false)) {
        continue;
      }
      powered.add(neighbor.id);
      queue.add(neighbor);
    }
  }

  final CircuitRotationTile? targetTile = tileByCell[input.target.cell.key];
  final bool targetReached =
      targetTile != null &&
      powered.contains(targetTile.id) &&
      (portsByTileId[targetTile.id]?.contains(input.target.side) ?? false);
  final bool allConfiguredTilesPowered = input.tiles.every(
    (CircuitRotationTile tile) => powered.contains(tile.id),
  );
  final bool success =
      targetReached &&
      (!input.requireAllConfiguredTilesPowered || allConfiguredTilesPowered);

  return CircuitRotationEvaluation(
    success: success,
    poweredTileIds: poweredTileIds,
    targetReached: targetReached,
  );
}

class CircuitRotationPowerDelta {
  const CircuitRotationPowerDelta({
    required this.newlyPoweredCount,
    required this.heartNewlyReached,
  });

  final int newlyPoweredCount;
  final bool heartNewlyReached;
}

/// Sound triggers: new tiles joining the live path, not a rotate by itself.
CircuitRotationPowerDelta circuitRotationPowerDelta({
  required Set<String> previousPoweredTileIds,
  required bool previousTargetReached,
  required CircuitRotationEvaluation next,
}) {
  final int newlyPoweredCount = next.poweredTileIds
      .where((String id) => !previousPoweredTileIds.contains(id))
      .length;
  return CircuitRotationPowerDelta(
    newlyPoweredCount: newlyPoweredCount,
    heartNewlyReached: next.targetReached && !previousTargetReached,
  );
}
