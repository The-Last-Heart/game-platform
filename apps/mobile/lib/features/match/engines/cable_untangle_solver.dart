/// Pure topology helpers for `precision.cable_untangle`.
///
/// Crossings are derived solely from left/right endpoint order for cables that
/// share the same horizontally-monotonic cubic Bézier model used by the painter.
library;

class CableUntangleSocket {
  const CableUntangleSocket({required this.id, required this.order});

  final String id;
  final int order;
}

class CableUntangleCable {
  const CableUntangleCable({
    required this.id,
    required this.leftSocketId,
    required this.initialRightSocketId,
  });

  final String id;
  final String leftSocketId;
  final String initialRightSocketId;
}

class CableUntangleLayout {
  const CableUntangleLayout({
    required this.leftColumnX,
    required this.rightColumnX,
    required this.topPadding,
    required this.bottomPadding,
  });

  final double leftColumnX;
  final double rightColumnX;
  final double topPadding;
  final double bottomPadding;
}

class CableUntangleTheme {
  const CableUntangleTheme({
    required this.backgroundColor,
    required this.gridColor,
    required this.cableColor,
    required this.cableCoreColor,
    required this.socketColor,
  });

  final String backgroundColor;
  final String gridColor;
  final String cableColor;
  final String cableCoreColor;
  final String socketColor;
}

class CableUntangleSwap {
  const CableUntangleSwap({
    required this.sequence,
    required this.draggedCableId,
    required this.displacedCableId,
    required this.fromRightSocketId,
    required this.toRightSocketId,
    required this.elapsedMs,
  });

  final int sequence;
  final String draggedCableId;
  final String displacedCableId;
  final String fromRightSocketId;
  final String toRightSocketId;
  final int elapsedMs;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'sequence': sequence,
    'draggedCableId': draggedCableId,
    'displacedCableId': displacedCableId,
    'fromRightSocketId': fromRightSocketId,
    'toRightSocketId': toRightSocketId,
    'elapsedMs': elapsedMs,
  };
}

class CableUntanglePuzzle {
  const CableUntanglePuzzle({
    required this.layout,
    required this.leftSockets,
    required this.rightSockets,
    required this.cables,
    required this.theme,
    required this.snapRadiusNorm,
    required this.mirrorHorizontally,
  });

  final CableUntangleLayout layout;
  final List<CableUntangleSocket> leftSockets;
  final List<CableUntangleSocket> rightSockets;
  final List<CableUntangleCable> cables;
  final CableUntangleTheme theme;
  final double snapRadiusNorm;
  final bool mirrorHorizontally;

  int get cableCount => cables.length;
}

class CableUntangleParseResult {
  const CableUntangleParseResult.ok(this.puzzle) : error = null;
  const CableUntangleParseResult.error(this.error) : puzzle = null;

  final CableUntanglePuzzle? puzzle;
  final String? error;

  bool get isValid => puzzle != null;
}

const int kCableUntangleMinCables = 2;
const int kCableUntangleMaxCables = 8;
const double kCableUntangleBezierControlRatio = 0.42;
const double kCableUntangleDefaultSnapRadiusNorm = 0.08;

/// Returns true when cable pair A/B crosses given left and right orders.
bool cablePairIntersects({
  required int leftA,
  required int rightA,
  required int leftB,
  required int rightB,
}) {
  return (leftA - leftB) * (rightA - rightB) < 0;
}

/// Count pairwise inversions for an assignment map: cableId → rightSocketId.
int countCableIntersections({
  required CableUntanglePuzzle puzzle,
  required Map<String, String> rightAssignment,
}) {
  final Map<String, int> leftOrderById = <String, int>{
    for (final CableUntangleSocket s in puzzle.leftSockets) s.id: s.order,
  };
  final Map<String, int> rightOrderById = <String, int>{
    for (final CableUntangleSocket s in puzzle.rightSockets) s.id: s.order,
  };

  final List<({int left, int right})> endpoints = <({int left, int right})>[];
  for (final CableUntangleCable cable in puzzle.cables) {
    final String? rightId = rightAssignment[cable.id];
    if (rightId == null) return -1;
    final int? left = leftOrderById[cable.leftSocketId];
    final int? right = rightOrderById[rightId];
    if (left == null || right == null) return -1;
    endpoints.add((left: left, right: right));
  }

  int count = 0;
  for (int i = 0; i < endpoints.length; i += 1) {
    for (int j = i + 1; j < endpoints.length; j += 1) {
      if (cablePairIntersects(
        leftA: endpoints[i].left,
        rightA: endpoints[i].right,
        leftB: endpoints[j].left,
        rightB: endpoints[j].right,
      )) {
        count += 1;
      }
    }
  }
  return count;
}

Map<String, String> initialRightAssignment(CableUntanglePuzzle puzzle) {
  return <String, String>{
    for (final CableUntangleCable c in puzzle.cables)
      c.id: c.initialRightSocketId,
  };
}

/// Atomically swap two occupied right sockets. Returns null on invalid request.
Map<String, String>? applyCableSwap({
  required Map<String, String> assignment,
  required String draggedCableId,
  required String toRightSocketId,
}) {
  final String? fromRight = assignment[draggedCableId];
  if (fromRight == null) return null;
  if (fromRight == toRightSocketId) {
    return Map<String, String>.from(assignment);
  }

  String? displacedCableId;
  for (final MapEntry<String, String> entry in assignment.entries) {
    if (entry.value == toRightSocketId) {
      displacedCableId = entry.key;
      break;
    }
  }
  if (displacedCableId == null || displacedCableId == draggedCableId) {
    return null;
  }

  final Map<String, String> next = Map<String, String>.from(assignment);
  next[draggedCableId] = toRightSocketId;
  next[displacedCableId] = fromRight;

  if (!_isBijection(next)) return null;
  return next;
}

bool _isBijection(Map<String, String> assignment) {
  if (assignment.isEmpty) return false;
  final Set<String> rights = assignment.values.toSet();
  return rights.length == assignment.length;
}

bool assignmentsEqual(Map<String, String> a, Map<String, String> b) {
  if (a.length != b.length) return false;
  for (final MapEntry<String, String> e in a.entries) {
    if (b[e.key] != e.value) return false;
  }
  return true;
}

/// Replay swaps from the initial assignment. Returns null if any swap is illegal.
Map<String, String>? replayCableSwaps({
  required CableUntanglePuzzle puzzle,
  required List<CableUntangleSwap> swaps,
}) {
  Map<String, String> current = initialRightAssignment(puzzle);
  for (int i = 0; i < swaps.length; i += 1) {
    final CableUntangleSwap swap = swaps[i];
    if (swap.sequence != i + 1) return null;
    final String? expectedFrom = current[swap.draggedCableId];
    if (expectedFrom != swap.fromRightSocketId) return null;
    if (current[swap.displacedCableId] != swap.toRightSocketId) return null;
    final Map<String, String>? next = applyCableSwap(
      assignment: current,
      draggedCableId: swap.draggedCableId,
      toRightSocketId: swap.toRightSocketId,
    );
    if (next == null) return null;
    if (next[swap.draggedCableId] != swap.toRightSocketId) return null;
    if (next[swap.displacedCableId] != swap.fromRightSocketId) return null;
    current = next;
  }
  return current;
}

double clampUnit(double value, {double min = 0, double max = 1}) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

CableUntangleParseResult parseCableUntanglePuzzle(Map<String, dynamic> cfg) {
  final Object? layoutRaw = cfg['layout'];
  if (layoutRaw is! Map) {
    return const CableUntangleParseResult.error('layout missing');
  }
  final Map<String, dynamic> layoutMap = _stringKeyed(layoutRaw);

  final double leftColumnX = clampUnit(
    _asDouble(layoutMap['leftColumnX'], 0.1),
    min: 0.05,
    max: 0.35,
  );
  final double rightColumnX = clampUnit(
    _asDouble(layoutMap['rightColumnX'], 0.9),
    min: 0.65,
    max: 0.95,
  );
  if (rightColumnX - leftColumnX < 0.35) {
    return const CableUntangleParseResult.error('columns too close');
  }
  final double topPadding = clampUnit(
    _asDouble(layoutMap['topPadding'], 0.1),
    min: 0.05,
    max: 0.25,
  );
  final double bottomPadding = clampUnit(
    _asDouble(layoutMap['bottomPadding'], 0.1),
    min: 0.05,
    max: 0.25,
  );
  if (topPadding + bottomPadding >= 0.85) {
    return const CableUntangleParseResult.error('vertical padding too large');
  }

  final Object? socketsRaw = cfg['sockets'];
  if (socketsRaw is! Map) {
    return const CableUntangleParseResult.error('sockets missing');
  }
  final Map<String, dynamic> socketsMap = _stringKeyed(socketsRaw);
  final List<CableUntangleSocket>? left = _parseSockets(socketsMap['left']);
  final List<CableUntangleSocket>? right = _parseSockets(socketsMap['right']);
  if (left == null || right == null) {
    return const CableUntangleParseResult.error('invalid sockets');
  }
  if (left.length != right.length) {
    return const CableUntangleParseResult.error('socket counts mismatch');
  }
  if (left.length < kCableUntangleMinCables ||
      left.length > kCableUntangleMaxCables) {
    return const CableUntangleParseResult.error('cable count out of range');
  }
  if (!_ordersContiguousUnique(left) || !_ordersContiguousUnique(right)) {
    return const CableUntangleParseResult.error('socket orders invalid');
  }

  final Object? cablesRaw = cfg['cables'];
  if (cablesRaw is! List) {
    return const CableUntangleParseResult.error('cables missing');
  }
  final List<CableUntangleCable> cables = <CableUntangleCable>[];
  final Set<String> cableIds = <String>{};
  final Set<String> leftUsed = <String>{};
  final Set<String> rightUsed = <String>{};
  final Set<String> leftIds = left.map((CableUntangleSocket s) => s.id).toSet();
  final Set<String> rightIds = right
      .map((CableUntangleSocket s) => s.id)
      .toSet();

  for (final Object? entry in cablesRaw) {
    if (entry is! Map) {
      return const CableUntangleParseResult.error('invalid cable entry');
    }
    final Map<String, dynamic> map = _stringKeyed(entry);
    final String id = map['id']?.toString() ?? '';
    final String leftSocketId = map['leftSocketId']?.toString() ?? '';
    final String initialRightSocketId =
        map['initialRightSocketId']?.toString() ?? '';
    if (id.isEmpty || leftSocketId.isEmpty || initialRightSocketId.isEmpty) {
      return const CableUntangleParseResult.error('cable fields missing');
    }
    if (!cableIds.add(id)) {
      return const CableUntangleParseResult.error('duplicate cable id');
    }
    if (!leftIds.contains(leftSocketId) || !leftUsed.add(leftSocketId)) {
      return const CableUntangleParseResult.error(
        'left socket assignment invalid',
      );
    }
    if (!rightIds.contains(initialRightSocketId) ||
        !rightUsed.add(initialRightSocketId)) {
      return const CableUntangleParseResult.error(
        'right socket assignment invalid',
      );
    }
    cables.add(
      CableUntangleCable(
        id: id,
        leftSocketId: leftSocketId,
        initialRightSocketId: initialRightSocketId,
      ),
    );
  }

  if (cables.length != left.length) {
    return const CableUntangleParseResult.error('cable/socket count mismatch');
  }
  if (leftUsed.length != left.length || rightUsed.length != right.length) {
    return const CableUntangleParseResult.error('incomplete occupancy');
  }

  final Object? themeRaw = cfg['theme'];
  if (themeRaw is! Map) {
    return const CableUntangleParseResult.error('theme missing');
  }
  final Map<String, dynamic> themeMap = _stringKeyed(themeRaw);
  final CableUntangleTheme? theme = _parseTheme(themeMap);
  if (theme == null) {
    return const CableUntangleParseResult.error('invalid theme colors');
  }

  final double snapRadiusNorm = clampUnit(
    _asDouble(cfg['snapRadiusNorm'], kCableUntangleDefaultSnapRadiusNorm),
    min: 0.04,
    max: 0.18,
  );
  final bool mirrorHorizontally = cfg['mirrorHorizontally'] == true;

  final CableUntanglePuzzle puzzle = CableUntanglePuzzle(
    layout: CableUntangleLayout(
      leftColumnX: leftColumnX,
      rightColumnX: rightColumnX,
      topPadding: topPadding,
      bottomPadding: bottomPadding,
    ),
    leftSockets: List<CableUntangleSocket>.unmodifiable(left),
    rightSockets: List<CableUntangleSocket>.unmodifiable(right),
    cables: List<CableUntangleCable>.unmodifiable(cables),
    theme: theme,
    snapRadiusNorm: snapRadiusNorm,
    mirrorHorizontally: mirrorHorizontally,
  );

  final int crossings = countCableIntersections(
    puzzle: puzzle,
    rightAssignment: initialRightAssignment(puzzle),
  );
  if (crossings <= 0) {
    return const CableUntangleParseResult.error('already solved');
  }

  return CableUntangleParseResult.ok(puzzle);
}

List<CableUntangleSocket>? _parseSockets(Object? raw) {
  if (raw is! List) return null;
  final List<CableUntangleSocket> out = <CableUntangleSocket>[];
  final Set<String> ids = <String>{};
  for (final Object? entry in raw) {
    if (entry is! Map) return null;
    final Map<String, dynamic> map = _stringKeyed(entry);
    final String id = map['id']?.toString() ?? '';
    final int? order = _asInt(map['order']);
    if (id.isEmpty || order == null || order < 0) return null;
    if (!ids.add(id)) return null;
    out.add(CableUntangleSocket(id: id, order: order));
  }
  out.sort((CableUntangleSocket a, CableUntangleSocket b) => a.order - b.order);
  return out;
}

bool _ordersContiguousUnique(List<CableUntangleSocket> sockets) {
  final Set<int> orders = <int>{};
  for (final CableUntangleSocket s in sockets) {
    if (!orders.add(s.order)) return false;
  }
  for (int i = 0; i < sockets.length; i += 1) {
    if (!orders.contains(i)) return false;
  }
  return true;
}

CableUntangleTheme? _parseTheme(Map<String, dynamic> map) {
  String? read(String key) {
    final String? v = map[key]?.toString();
    if (v == null || !_hexColor.hasMatch(v)) return null;
    return v.toUpperCase();
  }

  final String? backgroundColor = read('backgroundColor');
  final String? gridColor = read('gridColor');
  final String? cableColor = read('cableColor');
  final String? cableCoreColor = read('cableCoreColor');
  final String? socketColor = read('socketColor');
  if (backgroundColor == null ||
      gridColor == null ||
      cableColor == null ||
      cableCoreColor == null ||
      socketColor == null) {
    return null;
  }
  return CableUntangleTheme(
    backgroundColor: backgroundColor,
    gridColor: gridColor,
    cableColor: cableColor,
    cableCoreColor: cableCoreColor,
    socketColor: socketColor,
  );
}

final RegExp _hexColor = RegExp(r'^#[0-9A-Fa-f]{6}$');

Map<String, dynamic> _stringKeyed(Map<dynamic, dynamic> raw) {
  return raw.map((dynamic k, dynamic v) => MapEntry(k.toString(), v));
}

double _asDouble(Object? value, double fallback) {
  if (value is num && value.isFinite) return value.toDouble();
  return fallback;
}

int? _asInt(Object? value) {
  if (value is int) return value;
  if (value is num && value.isFinite) return value.round();
  return null;
}
