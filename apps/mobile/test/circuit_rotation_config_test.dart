import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/precision_circuit_rotation_engine.dart';

void main() {
  test(
    'accepts jsonDecode nested maps and cell tuples from live clientConfig',
    () {
      const String raw = '''
{
  "categoryKey": "challenge.category.precision",
  "promptKey": "challenge.circuit_rotation.prompt",
  "footerKey": "challenge.circuit_rotation.footer",
  "assetIds": {
    "boardBase": "circuit_rotation.board_base",
    "gridPlate": "circuit_rotation.grid_plate",
    "sparkRive": "neon_cable.cable_spark",
    "cableConnectSfx": "circuit_rotation.cable_connected",
    "heartPowerOnSfx": "circuit_rotation.heart_power_on"
  },
  "grid": {"rows": 3, "columns": 3},
  "source": {"cell": [2, 0], "side": "south"},
  "target": {"cell": [0, 2], "side": "north", "kind": "heart"},
  "tiles": [
    {
      "id": "source-corner",
      "cell": [2, 0],
      "shape": "corner",
      "initialQuarterTurns": 1,
      "movable": false
    },
    {
      "id": "bottom-turn",
      "cell": [2, 1],
      "shape": "corner",
      "initialQuarterTurns": 0,
      "movable": true
    }
  ],
  "stationaryConnections": [
    {"cell": [2, 0], "side": "south"},
    {"cell": [0, 2], "side": "north"}
  ],
  "theme": {
    "inactivePipeColor": "#2A6174",
    "energyColor": "#55E9FF",
    "energyCoreColor": "#EFFFFF",
    "socketColor": "#C9D4DC"
  }
}
''';
      final Map<String, dynamic> config =
          jsonDecode(raw) as Map<String, dynamic>;
      expect(circuitRotationClientConfigIsPlayable(config), isTrue);
    },
  );

  test('rejects a fog-wipe payload that is not a circuit puzzle', () {
    final Map<String, dynamic> config =
        jsonDecode('{"promptKey":"challenge.fog_wipe.prompt","assetIds":{}}')
            as Map<String, dynamic>;
    expect(circuitRotationClientConfigIsPlayable(config), isFalse);
  });
}
