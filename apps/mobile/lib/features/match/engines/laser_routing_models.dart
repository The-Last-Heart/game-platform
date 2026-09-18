class LaserRoutingSnapshot {
  const LaserRoutingSnapshot({
    required this.variant,
    required this.titleKey,
    required this.promptKey,
    required this.startDelayMs,
    required this.puzzleStartsAtMs,
    required this.width,
    required this.height,
    required this.components,
    required this.traces,
    required this.combinerCharged,
    required this.heartLit,
    required this.mirrorsHit,
    required this.mirrorsTotal,
    required this.gatesOpen,
    required this.gatesTotal,
    required this.connectedPaths,
    required this.totalPaths,
    required this.result,
    required this.stateSequence,
    required this.lastAcceptedCommandId,
    required this.lastRotatedComponentId,
    required this.reflectionOccurred,
    required this.isParticipant,
    required this.loopAssetId,
    required this.reflectionAssetId,
    required this.heartAssetId,
  });

  final String variant;
  final String titleKey;
  final String promptKey;
  final int startDelayMs;
  final int puzzleStartsAtMs;
  final int width;
  final int height;
  final List<LaserComponentView> components;
  final List<LaserTraceView> traces;
  final bool combinerCharged;
  final bool heartLit;
  final int mirrorsHit;
  final int mirrorsTotal;
  final int gatesOpen;
  final int gatesTotal;
  final int connectedPaths;
  final int totalPaths;
  final String result;
  final int stateSequence;
  final String? lastAcceptedCommandId;
  final String? lastRotatedComponentId;
  final bool reflectionOccurred;
  final bool isParticipant;
  final String loopAssetId;
  final String reflectionAssetId;
  final String heartAssetId;

  bool get isSuccess => result == 'success';
  bool get isTimeout => result == 'timeout';
}

class LaserComponentView {
  const LaserComponentView({
    required this.id,
    required this.kind,
    required this.row,
    required this.col,
    required this.interactive,
    this.orientation,
    this.axis,
    this.direction,
    this.color,
    this.cyanInput,
    this.amberInput,
    this.outputDirection,
  });

  final String id;
  final String kind;
  final int row;
  final int col;
  final bool interactive;
  final String? orientation;
  final String? axis;
  final String? direction;
  final String? color;
  final String? cyanInput;
  final String? amberInput;
  final String? outputDirection;
}

class LaserTraceView {
  const LaserTraceView({
    required this.sourceId,
    required this.color,
    required this.cells,
    required this.hitComponentIds,
    required this.termination,
    this.blockedComponentId,
  });

  final String sourceId;
  final String color;
  final List<({int row, int col})> cells;
  final List<String> hitComponentIds;
  final String termination;
  final String? blockedComponentId;
}

LaserRoutingSnapshot? parseLaserRoutingSnapshot(Map<String, dynamic> cfg) {
  final Object? boardRaw = cfg['board'];
  if (boardRaw is! Map<dynamic, dynamic>) {
    return null;
  }
  final Map<String, dynamic> board = Map<String, dynamic>.from(boardRaw);
  final Object? componentsRaw = board['components'];
  final Object? tracesRaw = cfg['traces'];
  final Map<String, dynamic> assets = cfg['assetIds'] is Map<dynamic, dynamic>
      ? Map<String, dynamic>.from(cfg['assetIds'] as Map<dynamic, dynamic>)
      : <String, dynamic>{};

  return LaserRoutingSnapshot(
    variant: cfg['variant'] as String? ?? board['variant'] as String? ?? 'classic',
    titleKey: cfg['titleKey'] as String? ?? 'challenge.laser.classic.title',
    promptKey: cfg['promptKey'] as String? ?? 'challenge.laser.classic.prompt',
    startDelayMs: (cfg['startDelayMs'] as num?)?.toInt() ?? 800,
    puzzleStartsAtMs: (cfg['puzzleStartsAtMs'] as num?)?.toInt() ?? 0,
    width: (board['width'] as num?)?.toInt() ?? 4,
    height: (board['height'] as num?)?.toInt() ?? 4,
    components: componentsRaw is List
        ? componentsRaw
            .whereType<Map<dynamic, dynamic>>()
            .map(
              (Map<dynamic, dynamic> raw) => LaserComponentView(
                id: raw['id'] as String? ?? '',
                kind: raw['kind'] as String? ?? 'empty',
                row: (raw['row'] as num?)?.toInt() ?? 0,
                col: (raw['col'] as num?)?.toInt() ?? 0,
                interactive: raw['interactive'] == true,
                orientation: raw['orientation'] as String?,
                axis: raw['axis'] as String?,
                direction: raw['direction'] as String?,
                color: raw['color'] as String?,
                cyanInput: raw['cyanInput'] as String?,
                amberInput: raw['amberInput'] as String?,
                outputDirection: raw['outputDirection'] as String?,
              ),
            )
            .where((LaserComponentView c) => c.id.isNotEmpty)
            .toList()
        : <LaserComponentView>[],
    traces: tracesRaw is List
        ? tracesRaw.whereType<Map<dynamic, dynamic>>().map(_parseTrace).toList()
        : <LaserTraceView>[],
    combinerCharged: cfg['combinerCharged'] == true,
    heartLit: cfg['heartLit'] == true,
    mirrorsHit: (cfg['mirrorsHit'] as num?)?.toInt() ?? 0,
    mirrorsTotal: (cfg['mirrorsTotal'] as num?)?.toInt() ?? 0,
    gatesOpen: (cfg['gatesOpen'] as num?)?.toInt() ?? 0,
    gatesTotal: (cfg['gatesTotal'] as num?)?.toInt() ?? 0,
    connectedPaths: (cfg['connectedPaths'] as num?)?.toInt() ?? 0,
    totalPaths: (cfg['totalPaths'] as num?)?.toInt() ?? 1,
    result: cfg['result'] as String? ?? 'active',
    stateSequence: (cfg['stateSequence'] as num?)?.toInt() ?? 0,
    lastAcceptedCommandId: cfg['lastAcceptedCommandId'] as String?,
    lastRotatedComponentId: cfg['lastRotatedComponentId'] as String?,
    reflectionOccurred: cfg['reflectionOccurred'] == true,
    isParticipant: cfg['isParticipant'] != false,
    loopAssetId: assets['laserLoopSfx'] as String? ?? 'laser_routing.laser_loop',
    reflectionAssetId:
        assets['reflectionSfx'] as String? ?? 'laser_routing.reflection',
    heartAssetId:
        assets['heartPowerOnSfx'] as String? ?? 'laser_routing.heart_power_on',
  );
}

LaserTraceView _parseTrace(Map<dynamic, dynamic> raw) {
  final Object? cellsRaw = raw['cells'];
  return LaserTraceView(
    sourceId: raw['sourceId'] as String? ?? '',
    color: raw['color'] as String? ?? 'cyan',
    cells: cellsRaw is List
        ? cellsRaw.whereType<Map<dynamic, dynamic>>().map((Map<dynamic, dynamic> cell) {
            return (
              row: (cell['row'] as num?)?.toInt() ?? 0,
              col: (cell['col'] as num?)?.toInt() ?? 0,
            );
          }).toList()
        : <({int row, int col})>[],
    hitComponentIds: (raw['hitComponentIds'] as List? ?? const <dynamic>[])
        .whereType<String>()
        .toList(),
    termination: raw['termination'] as String? ?? 'boundary',
    blockedComponentId: raw['blockedComponentId'] as String?,
  );
}
