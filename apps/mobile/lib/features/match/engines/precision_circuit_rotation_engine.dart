import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../content/content_asset_cache.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';
import 'circuit_rotation_solver.dart';
import 'neon_cable_rive_spark.dart' deferred as rive_spark;

class PrecisionCircuitRotationEngine implements ChallengeEngine {
  @override
  String get engineId => 'precision.circuit_rotation';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _CircuitRotationWidget(challengeContext: challengeContext);
  }
}

class _CircuitRotationWidget extends StatefulWidget {
  const _CircuitRotationWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_CircuitRotationWidget> createState() => _CircuitRotationWidgetState();
}

class _CircuitRotationWidgetState extends State<_CircuitRotationWidget>
    with SingleTickerProviderStateMixin {
  static const int _decodeTargetPx = 720;

  final Map<String, ui.Image> _images = <String, ui.Image>{};
  final Map<String, int> _logicalQuarterTurns = <String, int>{};
  final Map<String, double> _animationQuarterTurns = <String, double>{};
  Set<String> _poweredTileIds = <String>{};

  late final AnimationController _sourcePulse;
  _CircuitPuzzle? _puzzle;
  String? _focusedTileId;
  bool _submitted = false;
  bool _loading = true;
  int _loadAttempts = 0;

  Object? _sparkRiveFile;
  Object? _sparkController;
  bool _riveLibraryLoaded = false;

  Map<String, dynamic> get _cfg =>
      widget.challengeContext.challenge.clientConfig;

  Map<String, dynamic> get _assetIds =>
      _stringKeyedMap(_cfg['assetIds']) ?? const <String, dynamic>{};

  @override
  void initState() {
    super.initState();
    _sourcePulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..repeat(reverse: true);
    _puzzle = _parseCircuitPuzzle(_cfg);
    final _CircuitPuzzle? puzzle = _puzzle;
    if (puzzle == null) {
      _loading = false;
      debugPrint('precision.circuit_rotation invalid clientConfig');
      return;
    }
    for (final CircuitRotationTile tile in puzzle.tiles) {
      final int turns = normalizedCircuitQuarterTurns(tile.initialQuarterTurns);
      _logicalQuarterTurns[tile.id] = turns;
      _animationQuarterTurns[tile.id] = turns.toDouble();
    }
    _refreshEvaluation();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _submitIfSolved();
    });
    unawaited(_loadAssets());
  }

  @override
  void dispose() {
    _sourcePulse.dispose();
    for (final ui.Image image in _images.values) {
      image.dispose();
    }
    _images.clear();
    if (_riveLibraryLoaded) {
      rive_spark.disposeCableSparkController(_sparkController);
      rive_spark.disposeCableSparkFile(_sparkRiveFile);
    }
    super.dispose();
  }

  Future<void> _loadAssets() async {
    try {
      final String boardBaseId = _assetIds['boardBase']?.toString() ?? '';
      final String gridPlateId = _assetIds['gridPlate']?.toString() ?? '';
      if (boardBaseId.isEmpty || gridPlateId.isEmpty) {
        throw StateError('circuit rotation image asset ids are missing');
      }

      final Map<String, File> files = <String, File>{};
      for (final MapEntry<String, String> entry in <String, String>{
        'boardBase': boardBaseId,
        'gridPlate': gridPlateId,
      }.entries) {
        final File? file = await ContentAssetCache.instance.ensureAsset(
          entry.value,
        );
        if (file == null || !await file.exists()) {
          throw StateError('circuit rotation asset not cached: ${entry.value}');
        }
        files[entry.key] = file;
        await Future<void>.delayed(Duration.zero);
        if (!mounted) return;
      }

      final Map<String, ui.Image> decoded = <String, ui.Image>{};
      try {
        for (final MapEntry<String, File> entry in files.entries) {
          decoded[entry.key] = await _decodeImageFile(entry.value);
          await Future<void>.delayed(Duration.zero);
          if (!mounted) {
            for (final ui.Image image in decoded.values) {
              image.dispose();
            }
            return;
          }
        }
      } catch (_) {
        for (final ui.Image image in decoded.values) {
          image.dispose();
        }
        rethrow;
      }

      await _loadSpark();
      if (!mounted) {
        for (final ui.Image image in decoded.values) {
          image.dispose();
        }
        return;
      }
      for (final ui.Image image in _images.values) {
        image.dispose();
      }
      _images
        ..clear()
        ..addAll(decoded);
      setState(() => _loading = false);
    } catch (error, stack) {
      debugPrint('precision.circuit_rotation load failed: $error\n$stack');
      if (!mounted) return;
      _loadAttempts += 1;
      if (_loadAttempts >= 4) return;
      await Future<void>.delayed(Duration(milliseconds: 200 * _loadAttempts));
      if (!mounted || !_loading) return;
      unawaited(_loadAssets());
    }
  }

  Future<ui.Image> _decodeImageFile(File file) async {
    final Uint8List bytes = await file.readAsBytes();
    await Future<void>.delayed(Duration.zero);
    final ui.Codec codec = await ui.instantiateImageCodec(
      bytes,
      targetWidth: _decodeTargetPx,
      targetHeight: _decodeTargetPx,
    );
    try {
      final ui.FrameInfo frame = await codec.getNextFrame();
      return frame.image;
    } finally {
      codec.dispose();
    }
  }

  Future<void> _loadSpark() async {
    final String sparkId = _assetIds['sparkRive']?.toString() ?? '';
    if (sparkId.isEmpty) return;
    try {
      final File? file = await ContentAssetCache.instance.ensureAsset(sparkId);
      if (file == null || !await file.exists()) return;
      if (!_riveLibraryLoaded) {
        await rive_spark.loadLibrary();
        _riveLibraryLoaded = true;
      }
      if (!mounted) return;
      final Object? decoded = await rive_spark.decodeCableSparkRive(
        await file.readAsBytes(),
      );
      if (decoded == null) return;
      if (!mounted) {
        rive_spark.disposeCableSparkFile(decoded);
        return;
      }
      final Object controller = rive_spark.createCableSparkController(
        decoded,
        kind: 'cyan',
      );
      if (!mounted) {
        rive_spark.disposeCableSparkController(controller);
        rive_spark.disposeCableSparkFile(decoded);
        return;
      }
      rive_spark.disposeCableSparkController(_sparkController);
      rive_spark.disposeCableSparkFile(_sparkRiveFile);
      _sparkRiveFile = decoded;
      _sparkController = controller;
    } catch (error, stack) {
      debugPrint('Circuit rotation Rive spark load failed: $error\n$stack');
    }
  }

  CircuitRotationEvaluation _evaluate() {
    final _CircuitPuzzle puzzle = _puzzle!;
    return evaluateCircuitRotation(
      CircuitRotationEvaluationInput(
        grid: puzzle.grid,
        source: puzzle.source,
        target: puzzle.target,
        tiles: puzzle.tiles,
        stationaryConnections: puzzle.stationaryConnections,
        tileQuarterTurns: Map<String, int>.unmodifiable(_logicalQuarterTurns),
        requireAllConfiguredTilesPowered:
            puzzle.requireAllConfiguredTilesPowered,
      ),
    );
  }

  void _refreshEvaluation() {
    _poweredTileIds = _evaluate().poweredTileIds.toSet();
  }

  void _rotateTile(CircuitRotationTile tile) {
    if (_submitted ||
        _loading ||
        !tile.movable ||
        widget.challengeContext.isInteractionLocked) {
      return;
    }
    try {
      HapticFeedback.selectionClick();
    } catch (_) {}

    final int current =
        _logicalQuarterTurns[tile.id] ?? tile.initialQuarterTurns;
    _logicalQuarterTurns[tile.id] = normalizedCircuitQuarterTurns(current + 1);
    _animationQuarterTurns[tile.id] =
        (_animationQuarterTurns[tile.id] ?? current.toDouble()) + 1;
    final CircuitRotationEvaluation result = _evaluate();
    setState(() {
      _focusedTileId = tile.id;
      _poweredTileIds = result.poweredTileIds.toSet();
      if (result.success) _submitted = true;
    });
    if (result.success) {
      _submitAnswer();
    }
  }

  void _submitIfSolved() {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    final CircuitRotationEvaluation result = _evaluate();
    if (!result.success) return;
    setState(() {
      _submitted = true;
      _poweredTileIds = result.poweredTileIds.toSet();
    });
    _submitAnswer();
  }

  void _submitAnswer() {
    final _CircuitPuzzle? puzzle = _puzzle;
    if (puzzle == null) return;
    widget.challengeContext.onSubmit(<String, dynamic>{
      'tileQuarterTurns': <String, int>{
        for (final CircuitRotationTile tile in puzzle.tiles)
          tile.id:
              _logicalQuarterTurns[tile.id] ??
              normalizedCircuitQuarterTurns(tile.initialQuarterTurns),
      },
    });
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final _CircuitPuzzle? puzzle = _puzzle;
    // Title comes from definition promptKey (أكمل الدائرة); instruction/footer
    // come from clientConfig — matching the neon reference chrome.
    final String titleKey = widget.challengeContext.challenge.promptKey;
    final String instructionKey =
        (_cfg['promptKey'] as String?) ?? titleKey;
    final String footerKey = (_cfg['footerKey'] as String?) ?? '';
    final _CircuitThemeColors colors = _parseThemeColors(_cfg['theme']);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: colors.energyColor,
          ),
          Expanded(
            child: puzzle == null
                ? Center(
                    child: Text(
                      resolver.resolve(
                        TranslationKeys.errorsContentUnavailable,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  )
                : _loading
                ? const Center(child: CircularProgressIndicator())
                : LayoutBuilder(
                    builder: (BuildContext context, BoxConstraints c) {
                      const double promptBlock = 96;
                      final double availableHeight = math.max(
                        1,
                        c.maxHeight - promptBlock,
                      );
                      final double cellExtent = math.max(
                        1,
                        math.min(
                          c.maxWidth * 0.84 / puzzle.grid.columns,
                          availableHeight * 0.84 / puzzle.grid.rows,
                        ),
                      );
                      final double boardWidth =
                          cellExtent * puzzle.grid.columns / 0.84;
                      final double boardHeight =
                          cellExtent * puzzle.grid.rows / 0.84;
                      return Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            Text(
                              resolver.resolve(titleKey),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.headlineMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: colors.energyColor,
                                    shadows: <Shadow>[
                                      Shadow(
                                        color: colors.energyColor.withValues(
                                          alpha: 0.85,
                                        ),
                                        blurRadius: 14,
                                      ),
                                      Shadow(
                                        color: colors.energyColor.withValues(
                                          alpha: 0.45,
                                        ),
                                        blurRadius: 28,
                                      ),
                                    ],
                                  ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              resolver.resolve(instructionKey),
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(
                                    color: const Color(0xFFE8F7FF),
                                    fontWeight: FontWeight.w500,
                                  ),
                            ),
                            if (footerKey.isNotEmpty) ...<Widget>[
                              const SizedBox(height: 2),
                              Text(
                                resolver.resolve(footerKey),
                                textAlign: TextAlign.center,
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: LhColors.textMuted),
                              ),
                            ],
                            const SizedBox(height: 10),
                            SizedBox(
                              width: boardWidth,
                              height: boardHeight,
                              child: RepaintBoundary(
                                child: AnimatedBuilder(
                                  animation: _sourcePulse,
                                  builder:
                                      (BuildContext context, Widget? child) {
                                    return _buildBoard(
                                      context,
                                      puzzle,
                                      resolver,
                                      colors,
                                      _sourcePulse.value,
                                    );
                                  },
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildBoard(
    BuildContext context,
    _CircuitPuzzle puzzle,
    TranslationResolver resolver,
    _CircuitThemeColors colors,
    double neonPulse,
  ) {
    final bool locked =
        _submitted || widget.challengeContext.isInteractionLocked;
    final Widget? spark = _sparkController == null
        ? null
        : rive_spark.buildCableSparkView(_sparkController!);
    final Map<String, CircuitRotationTile> tileByCell =
        <String, CircuitRotationTile>{
          for (final CircuitRotationTile tile in puzzle.tiles)
            tile.cell.key: tile,
        };
    final String accessibilityLabel = resolver.resolve(
      'challenge.circuit_rotation.a11y_fallback',
    );

    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        // Opaque fill so match cave chrome does not bleed through the board.
        const ColoredBox(color: Color(0xFF05080C)),
        RawImage(image: _images['boardBase'], fit: BoxFit.fill),
        Positioned.fill(
          child: FractionallySizedBox(
            widthFactor: 0.84,
            heightFactor: 0.84,
            child: LayoutBuilder(
              builder: (BuildContext context, BoxConstraints constraints) {
                final double cellWidth =
                    constraints.maxWidth / puzzle.grid.columns;
                final double cellHeight =
                    constraints.maxHeight / puzzle.grid.rows;
                return Stack(
                  children: <Widget>[
                    for (int row = 0; row < puzzle.grid.rows; row++)
                      for (
                        int column = 0;
                        column < puzzle.grid.columns;
                        column++
                      )
                        Positioned(
                          left: column * cellWidth,
                          top: row * cellHeight,
                          width: cellWidth,
                          height: cellHeight,
                          child: _buildCell(
                            puzzle: puzzle,
                            tile: tileByCell['$row,$column'],
                            cell: CircuitRotationCell(row, column),
                            colors: colors,
                            neonPulse: neonPulse,
                            locked: locked,
                            accessibilityLabel: accessibilityLabel,
                            spark: spark,
                          ),
                        ),
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCell({
    required _CircuitPuzzle puzzle,
    required CircuitRotationTile? tile,
    required CircuitRotationCell cell,
    required _CircuitThemeColors colors,
    required double neonPulse,
    required bool locked,
    required String accessibilityLabel,
    required Widget? spark,
  }) {
    final bool isSource = cell == puzzle.source.cell;
    final bool isTarget = cell == puzzle.target.cell;
    final bool targetPowered =
        isTarget && tile != null && _poweredTileIds.contains(tile.id);
    final Set<CircuitRotationSide> socketSides = <CircuitRotationSide>{
      for (final CircuitRotationStationaryConnection connection
          in puzzle.stationaryConnections)
        if (connection.cell == cell) connection.side,
      if (isSource) puzzle.source.side,
      if (isTarget) puzzle.target.side,
    };
    // Couplers stay stationary; they light only when this cell is energized.
    final bool cellEnergized = (tile != null &&
            _poweredTileIds.contains(tile.id)) ||
        (isSource && (tile == null || _poweredTileIds.contains(tile.id))) ||
        targetPowered;
    final Set<CircuitRotationSide> energizedSocketSides = cellEnergized
        ? socketSides
        : (isSource ? <CircuitRotationSide>{puzzle.source.side} : <CircuitRotationSide>{});

    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        RawImage(image: _images['gridPlate'], fit: BoxFit.fill),
        CustomPaint(
          painter: _CircuitSocketPainter(
            sides: socketSides,
            energizedSides: energizedSocketSides,
            socketColor: colors.socketColor,
            energyColor: colors.energyColor,
            neonPulse: neonPulse,
          ),
        ),
        if (tile != null)
          Semantics(
            button: tile.movable,
            enabled: tile.movable && !locked,
            label: accessibilityLabel,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: tile.movable && !locked ? () => _rotateTile(tile) : null,
              child: Stack(
                fit: StackFit.expand,
                children: <Widget>[
                  TweenAnimationBuilder<double>(
                    key: ValueKey<String>('circuit-rotation-${tile.id}'),
                    tween: Tween<double>(
                      end:
                          _animationQuarterTurns[tile.id] ??
                          tile.initialQuarterTurns.toDouble(),
                    ),
                    duration: const Duration(milliseconds: 160),
                    curve: Curves.easeOut,
                    builder:
                        (
                          BuildContext context,
                          double quarterTurns,
                          Widget? child,
                        ) {
                          return Transform.rotate(
                            angle: quarterTurns * math.pi / 2,
                            child: child,
                          );
                        },
                    child: CustomPaint(
                      painter: _CircuitPipePainter(
                        shape: tile.shape,
                        powered: _poweredTileIds.contains(tile.id),
                        colors: colors,
                        neonPulse: neonPulse,
                      ),
                    ),
                  ),
                  IgnorePointer(
                    child: CustomPaint(
                      painter: _CircuitFocusPainter(
                        visible: tile.movable,
                        focused: _focusedTileId == tile.id,
                        locked: locked,
                        color: colors.energyColor,
                        neonPulse: neonPulse,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (isSource)
          IgnorePointer(
            child: _CircuitEndpointBadge(
              icon: Icons.bolt_rounded,
              powered: true,
              colors: colors,
              neonPulse: neonPulse,
            ),
          ),
        if (isTarget)
          IgnorePointer(
            child: _CircuitEndpointBadge(
              icon: Icons.favorite_rounded,
              powered: targetPowered,
              colors: colors,
              neonPulse: neonPulse,
              bloom: targetPowered,
            ),
          ),
        if (isSource && spark != null)
          IgnorePointer(
            child: Align(
              alignment: _alignmentForSide(puzzle.source.side, inward: true),
              child: FractionallySizedBox(
                widthFactor: 0.52,
                heightFactor: 0.52,
                child: _CircuitScreenBlend(child: spark),
              ),
            ),
          ),
      ],
    );
  }
}

class _CircuitPuzzle {
  const _CircuitPuzzle({
    required this.grid,
    required this.source,
    required this.target,
    required this.tiles,
    required this.stationaryConnections,
    required this.requireAllConfiguredTilesPowered,
  });

  final CircuitRotationGrid grid;
  final CircuitRotationSource source;
  final CircuitRotationTarget target;
  final List<CircuitRotationTile> tiles;
  final List<CircuitRotationStationaryConnection> stationaryConnections;
  final bool requireAllConfiguredTilesPowered;
}

_CircuitPuzzle? _parseCircuitPuzzle(Map<String, dynamic> config) {
  final Map<String, dynamic>? gridMap = _stringKeyedMap(config['grid']);
  final int? rows = _wholeNumber(gridMap?['rows']);
  final int? columns = _wholeNumber(gridMap?['columns']);
  if (rows == null ||
      columns == null ||
      rows < 1 ||
      rows > 8 ||
      columns < 1 ||
      columns > 8) {
    return null;
  }
  final CircuitRotationGrid grid = CircuitRotationGrid(
    rows: rows,
    columns: columns,
  );

  CircuitRotationCell? parseCell(Object? raw) {
    if (raw is! List<Object?> || raw.length < 2) return null;
    final int? row = _wholeNumber(raw[0]);
    final int? column = _wholeNumber(raw[1]);
    if (row == null ||
        column == null ||
        row < 0 ||
        column < 0 ||
        row >= rows ||
        column >= columns) {
      return null;
    }
    return CircuitRotationCell(row, column);
  }

  final Map<String, dynamic>? sourceMap = _stringKeyedMap(config['source']);
  final CircuitRotationCell? sourceCell = parseCell(sourceMap?['cell']);
  final CircuitRotationSide? sourceSide = circuitRotationSideFromName(
    sourceMap?['side']?.toString(),
  );
  if (sourceCell == null || sourceSide == null) return null;

  final Map<String, dynamic>? targetMap = _stringKeyedMap(config['target']);
  final CircuitRotationCell? targetCell = parseCell(targetMap?['cell']);
  final CircuitRotationSide? targetSide = circuitRotationSideFromName(
    targetMap?['side']?.toString(),
  );
  if (targetCell == null ||
      targetSide == null ||
      targetMap?['kind']?.toString() != 'heart') {
    return null;
  }

  final Object? tilesRaw = config['tiles'];
  if (tilesRaw is! List<Object?> || tilesRaw.isEmpty) return null;
  final List<CircuitRotationTile> tiles = <CircuitRotationTile>[];
  final Set<String> ids = <String>{};
  final Set<String> cells = <String>{};
  for (final Object? raw in tilesRaw) {
    final Map<String, dynamic>? tileMap = _stringKeyedMap(raw);
    final String id = tileMap?['id']?.toString() ?? '';
    final CircuitRotationCell? cell = parseCell(tileMap?['cell']);
    final CircuitRotationShape? shape = circuitRotationShapeFromName(
      tileMap?['shape']?.toString(),
    );
    final int? turns = _wholeNumber(tileMap?['initialQuarterTurns']);
    final Object? movable = tileMap?['movable'];
    if (id.isEmpty ||
        cell == null ||
        shape == null ||
        turns == null ||
        turns < 0 ||
        turns > 3 ||
        movable is! bool ||
        !ids.add(id) ||
        !cells.add(cell.key)) {
      return null;
    }
    tiles.add(
      CircuitRotationTile(
        id: id,
        cell: cell,
        shape: shape,
        initialQuarterTurns: turns,
        movable: movable,
      ),
    );
  }

  final Object? stationaryRaw = config['stationaryConnections'];
  if (stationaryRaw is! List<Object?>) return null;
  final List<CircuitRotationStationaryConnection> stationaryConnections =
      <CircuitRotationStationaryConnection>[];
  final Set<String> connectionKeys = <String>{};
  for (final Object? raw in stationaryRaw) {
    final Map<String, dynamic>? connectionMap = _stringKeyedMap(raw);
    final CircuitRotationCell? cell = parseCell(connectionMap?['cell']);
    final CircuitRotationSide? side = circuitRotationSideFromName(
      connectionMap?['side']?.toString(),
    );
    if (cell == null ||
        side == null ||
        !connectionKeys.add('${cell.key}:${side.name}')) {
      return null;
    }
    stationaryConnections.add(
      CircuitRotationStationaryConnection(cell: cell, side: side),
    );
  }

  return _CircuitPuzzle(
    grid: grid,
    source: CircuitRotationSource(cell: sourceCell, side: sourceSide),
    target: CircuitRotationTarget(cell: targetCell, side: targetSide),
    tiles: List<CircuitRotationTile>.unmodifiable(tiles),
    stationaryConnections:
        List<CircuitRotationStationaryConnection>.unmodifiable(
          stationaryConnections,
        ),
    requireAllConfiguredTilesPowered:
        config['requireAllConfiguredTilesPowered'] is bool
        ? config['requireAllConfiguredTilesPowered'] as bool
        : true,
  );
}

Map<String, dynamic>? _stringKeyedMap(Object? raw) {
  if (raw is! Map<Object?, Object?>) return null;
  return raw.map<String, dynamic>(
    (Object? key, Object? value) =>
        MapEntry<String, dynamic>(key.toString(), value),
  );
}

int? _wholeNumber(Object? raw) {
  if (raw is! num || !raw.isFinite) return null;
  final int value = raw.toInt();
  return raw == value ? value : null;
}

class _CircuitThemeColors {
  const _CircuitThemeColors({
    required this.inactivePipeColor,
    required this.energyColor,
    required this.energyCoreColor,
    required this.socketColor,
  });

  final Color inactivePipeColor;
  final Color energyColor;
  final Color energyCoreColor;
  final Color socketColor;
}

_CircuitThemeColors _parseThemeColors(Object? raw) {
  final Map<String, dynamic>? theme = _stringKeyedMap(raw);
  return _CircuitThemeColors(
    inactivePipeColor: _parseHexColor(
      theme?['inactivePipeColor'],
      const Color(0xFF2A6174),
    ),
    energyColor: _parseHexColor(theme?['energyColor'], const Color(0xFF55E9FF)),
    energyCoreColor: _parseHexColor(
      theme?['energyCoreColor'],
      const Color(0xFFEFFFFF),
    ),
    socketColor: _parseHexColor(theme?['socketColor'], const Color(0xFFC9D4DC)),
  );
}

Color _parseHexColor(Object? raw, Color fallback) {
  final String value = raw?.toString() ?? '';
  if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)) return fallback;
  final int? rgb = int.tryParse(value.substring(1), radix: 16);
  return rgb == null ? fallback : Color(0xFF000000 | rgb);
}

class _CircuitSocketPainter extends CustomPainter {
  const _CircuitSocketPainter({
    required this.sides,
    required this.energizedSides,
    required this.socketColor,
    required this.energyColor,
    required this.neonPulse,
  });

  final Set<CircuitRotationSide> sides;
  final Set<CircuitRotationSide> energizedSides;
  final Color socketColor;
  final Color energyColor;
  final double neonPulse;

  @override
  void paint(Canvas canvas, Size size) {
    final double unit = size.shortestSide;
    for (final CircuitRotationSide side in sides) {
      final bool energized = energizedSides.contains(side);
      final Offset edge = _pointForSide(size, side, unit * 0.01);
      final Offset inner = _pointForSide(size, side, unit * 0.22);
      final Offset mid = Offset.lerp(edge, inner, 0.55)!;
      final Offset tangent = switch (side) {
        CircuitRotationSide.north || CircuitRotationSide.south =>
          Offset(unit * 0.11, 0),
        CircuitRotationSide.east || CircuitRotationSide.west =>
          Offset(0, unit * 0.11),
      };

      // Metallic coupler body (stationary clamps from the reference).
      final Path clamp = Path()
        ..moveTo(mid.dx - tangent.dx, mid.dy - tangent.dy)
        ..lineTo(mid.dx + tangent.dx, mid.dy + tangent.dy);
      canvas.drawPath(
        clamp,
        Paint()
          ..color = const Color(0xFF1A242C)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.16
          ..strokeCap = StrokeCap.round,
      );
      canvas.drawPath(
        clamp,
        Paint()
          ..color = socketColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.095
          ..strokeCap = StrokeCap.round,
      );
      canvas.drawPath(
        clamp,
        Paint()
          ..color = const Color(0xFFE8EEF2)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.028
          ..strokeCap = StrokeCap.round,
      );

      // Short conduit stub toward the cell center.
      canvas.drawLine(
        edge,
        inner,
        Paint()
          ..color = energized
              ? energyColor.withValues(alpha: 0.55 + neonPulse * 0.25)
              : const Color(0xFF33444F)
          ..strokeWidth = unit * (energized ? 0.085 : 0.07)
          ..strokeCap = StrokeCap.round
          ..maskFilter = energized
              ? MaskFilter.blur(BlurStyle.normal, unit * 0.04)
              : null,
      );
      if (energized) {
        canvas.drawLine(
          edge,
          inner,
          Paint()
            ..color = energyColor
            ..strokeWidth = unit * 0.045
            ..strokeCap = StrokeCap.round,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _CircuitSocketPainter oldDelegate) {
    return oldDelegate.sides != sides ||
        oldDelegate.energizedSides != energizedSides ||
        oldDelegate.neonPulse != neonPulse ||
        oldDelegate.socketColor != socketColor ||
        oldDelegate.energyColor != energyColor;
  }
}

class _CircuitPipePainter extends CustomPainter {
  const _CircuitPipePainter({
    required this.shape,
    required this.powered,
    required this.colors,
    required this.neonPulse,
  });

  final CircuitRotationShape shape;
  final bool powered;
  final _CircuitThemeColors colors;
  final double neonPulse;

  Path _pipePath(Size size) {
    final double unit = size.shortestSide;
    final Offset center = size.center(Offset.zero);
    return switch (shape) {
      CircuitRotationShape.straight =>
        (Path()
          ..moveTo(center.dx, -unit * 0.04)
          ..lineTo(center.dx, size.height + unit * 0.04)),
      CircuitRotationShape.corner =>
        (Path()
          ..moveTo(center.dx, -unit * 0.04)
          ..lineTo(center.dx, center.dy - unit * 0.08)
          ..quadraticBezierTo(
            center.dx,
            center.dy,
            center.dx + unit * 0.08,
            center.dy,
          )
          ..lineTo(size.width + unit * 0.04, center.dy)),
    };
  }

  @override
  void paint(Canvas canvas, Size size) {
    final double unit = size.shortestSide;
    final Path path = _pipePath(size);

    // Soft contact shadow under the tube.
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0x99000000)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 0.2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 0.03),
    );

    if (!powered) {
      // Dim "cold tube" — readable cyan glass, not muddy charcoal.
      canvas.drawPath(
        path,
        Paint()
          ..color = colors.inactivePipeColor.withValues(alpha: 0.95)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.145
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
      canvas.drawPath(
        path,
        Paint()
          ..color = const Color(0xFF7EB8C8).withValues(alpha: 0.35)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.055
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
      canvas.drawPath(
        path,
        Paint()
          ..color = const Color(0xFFD7F6FF).withValues(alpha: 0.18)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.02
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
      return;
    }

    final double pulse = 0.72 + neonPulse * 0.28;
    // Layered neon: halo → body → hot core (prompt + reference).
    canvas.drawPath(
      path,
      Paint()
        ..color = colors.energyColor.withValues(alpha: 0.22 * pulse)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 0.34
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 0.12),
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = colors.energyColor.withValues(alpha: 0.55 * pulse)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 0.22
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, unit * 0.055),
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = colors.energyColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 0.125
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = colors.energyCoreColor.withValues(alpha: 0.75 + neonPulse * 0.25)
        ..style = PaintingStyle.stroke
        ..strokeWidth = unit * 0.042
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant _CircuitPipePainter oldDelegate) {
    return oldDelegate.shape != shape ||
        oldDelegate.powered != powered ||
        oldDelegate.neonPulse != neonPulse ||
        oldDelegate.colors != colors;
  }
}

class _CircuitFocusPainter extends CustomPainter {
  const _CircuitFocusPainter({
    required this.visible,
    required this.focused,
    required this.locked,
    required this.color,
    required this.neonPulse,
  });

  final bool visible;
  final bool focused;
  final bool locked;
  final Color color;
  final double neonPulse;

  @override
  void paint(Canvas canvas, Size size) {
    if (!visible) return;
    final double unit = size.shortestSide;
    final RRect focus = RRect.fromRectAndRadius(
      (Offset.zero & size).deflate(unit * 0.07),
      Radius.circular(unit * 0.1),
    );
    final double alpha = locked
        ? 0.12
        : focused
            ? 0.95
            : 0.55 + neonPulse * 0.2;
    final Paint dashPaint = Paint()
      ..color = Color.lerp(Colors.white, color, focused ? 0.35 : 0.55)!
          .withValues(alpha: alpha)
      ..style = PaintingStyle.stroke
      ..strokeWidth = focused ? unit * 0.028 : unit * 0.02
      ..strokeCap = StrokeCap.round;
    _drawDashedRRect(canvas, focus, dashPaint, unit * 0.055, unit * 0.04);

    if (!locked) {
      final Offset center = Offset(
        focus.right - unit * 0.12,
        focus.top + unit * 0.12,
      );
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: unit * 0.06),
        -math.pi * 0.75,
        math.pi * 1.4,
        false,
        Paint()
          ..color = Colors.white.withValues(alpha: focused ? 0.95 : 0.55)
          ..style = PaintingStyle.stroke
          ..strokeWidth = unit * 0.018
          ..strokeCap = StrokeCap.round,
      );
      // Arrow tip.
      final Offset tip = Offset(
        center.dx + unit * 0.045,
        center.dy - unit * 0.01,
      );
      canvas.drawLine(
        tip,
        Offset(tip.dx - unit * 0.03, tip.dy - unit * 0.02),
        Paint()
          ..color = Colors.white.withValues(alpha: focused ? 0.95 : 0.55)
          ..strokeWidth = unit * 0.018
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  void _drawDashedRRect(
    Canvas canvas,
    RRect rrect,
    Paint paint,
    double dash,
    double gap,
  ) {
    final Path path = Path()..addRRect(rrect);
    for (final ui.PathMetric metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        final double next = math.min(distance + dash, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance = next + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _CircuitFocusPainter oldDelegate) {
    return oldDelegate.visible != visible ||
        oldDelegate.focused != focused ||
        oldDelegate.locked != locked ||
        oldDelegate.neonPulse != neonPulse ||
        oldDelegate.color != color;
  }
}

class _CircuitEndpointBadge extends StatelessWidget {
  const _CircuitEndpointBadge({
    required this.icon,
    required this.powered,
    required this.colors,
    required this.neonPulse,
    this.bloom = false,
  });

  final IconData icon;
  final bool powered;
  final _CircuitThemeColors colors;
  final double neonPulse;
  final bool bloom;

  @override
  Widget build(BuildContext context) {
    final double pulse = powered ? 0.85 + neonPulse * 0.15 : 0.55;
    final Color frame = powered ? colors.energyColor : colors.socketColor;
    final Color fill = powered
        ? colors.energyColor.withValues(alpha: 0.18 + neonPulse * 0.12)
        : const Color(0x66101820);
    final double scale = bloom ? 1 + neonPulse * 0.08 : 1;

    return Align(
      alignment: Alignment.center,
      child: FractionallySizedBox(
        widthFactor: 0.42,
        heightFactor: 0.42,
        child: Transform.scale(
          scale: scale,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: fill,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: frame, width: 2.2 * pulse),
              boxShadow: powered
                  ? <BoxShadow>[
                      BoxShadow(
                        color: colors.energyColor.withValues(alpha: 0.55 * pulse),
                        blurRadius: 14 + neonPulse * 10,
                        spreadRadius: 1,
                      ),
                      BoxShadow(
                        color: colors.energyColor.withValues(alpha: 0.25),
                        blurRadius: 28,
                      ),
                    ]
                  : null,
            ),
            child: Center(
              child: Icon(
                icon,
                color: powered ? colors.energyCoreColor : colors.socketColor,
                size: 28,
                shadows: powered
                    ? <Shadow>[
                        Shadow(color: colors.energyColor, blurRadius: 10),
                        Shadow(color: colors.energyColor, blurRadius: 18),
                      ]
                    : null,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Offset _pointForSide(Size size, CircuitRotationSide side, double inset) {
  return switch (side) {
    CircuitRotationSide.north => Offset(size.width / 2, inset),
    CircuitRotationSide.east => Offset(size.width - inset, size.height / 2),
    CircuitRotationSide.south => Offset(size.width / 2, size.height - inset),
    CircuitRotationSide.west => Offset(inset, size.height / 2),
  };
}

Alignment _alignmentForSide(CircuitRotationSide side, {required bool inward}) {
  final double amount = inward ? 0.62 : 1;
  return switch (side) {
    CircuitRotationSide.north => Alignment(0, -amount),
    CircuitRotationSide.east => Alignment(amount, 0),
    CircuitRotationSide.south => Alignment(0, amount),
    CircuitRotationSide.west => Alignment(-amount, 0),
  };
}

class _CircuitScreenBlend extends SingleChildRenderObjectWidget {
  const _CircuitScreenBlend({required Widget child}) : super(child: child);

  @override
  RenderObject createRenderObject(BuildContext context) {
    return _RenderCircuitScreenBlend();
  }
}

class _RenderCircuitScreenBlend extends RenderProxyBox {
  @override
  void paint(PaintingContext context, Offset offset) {
    context.canvas.saveLayer(
      offset & size,
      Paint()..blendMode = BlendMode.screen,
    );
    super.paint(context, offset);
    context.canvas.restore();
  }
}
