import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../../content/content_asset_cache.dart';

/// Gameplay SFX resolved from the downloaded content pack.
///
/// Never plays Flutter [AssetSource] for challenge/power audio — that would
/// embed those assets in the app bundle.
class ChallengeSfx {
  ChallengeSfx._();

  static final ChallengeSfx instance = ChallengeSfx._();

  AudioPlayer? _player;
  final Set<String> _missingLogged = <String>{};

  /// Bumped on [stop] / new [play] so an in-flight [play] cannot restart audio
  /// after the UI has already left the strike/power window.
  int _playGeneration = 0;

  /// Audio-cue pulse / heartbeat.
  static const String defaultPulseAssetId = 'sfx.pulse';

  /// Danger Pulse strike / incoming alarm.
  static const String defaultStrikeAssetId = 'sfx.strike';

  /// Match-end win (final results).
  static const String defaultWinAssetId = 'sfx.win';

  /// Match-end lose (final results).
  static const String defaultLoseAssetId = 'sfx.lose';

  /// Neon-cable snap spark (cyan or red).
  static const String defaultNeonCableSparkAssetId = 'neon_cable.spark';

  /// Cable-untangle head dock / swing.
  static const String defaultCableUntangleSwingAssetId = 'cable_untangle.swing';

  /// Circuit rotation: a pipe joined the powered path.
  static const String defaultCircuitCableConnectAssetId =
      'circuit_rotation.cable_connected';

  /// Circuit rotation: power reached the heart.
  static const String defaultCircuitHeartPowerOnAssetId =
      'circuit_rotation.heart_power_on';

  Future<void> pulse({String assetId = defaultPulseAssetId}) async {
    try {
      await HapticFeedback.mediumImpact();
    } catch (_) {}
    await _playCached(assetId);
  }

  Future<void> strike({String assetId = defaultStrikeAssetId}) async {
    try {
      await HapticFeedback.heavyImpact();
    } catch (_) {}
    await _playCached(assetId);
  }

  Future<void> win({String assetId = defaultWinAssetId}) async {
    try {
      await HapticFeedback.mediumImpact();
    } catch (_) {}
    await _playCached(assetId);
  }

  Future<void> lose({String assetId = defaultLoseAssetId}) async {
    try {
      await HapticFeedback.heavyImpact();
    } catch (_) {}
    await _playCached(assetId);
  }

  /// Play a content-pack SFX by asset id (no extra haptic).
  Future<void> play(String assetId) => _playCached(assetId);

  /// Play without stopping the current gameplay SFX (e.g. heart on + cable).
  Future<void> playOverlapping(String assetId) async {
    try {
      final file = await ContentAssetCache.instance.localFile(assetId);
      if (file == null) {
        if (_missingLogged.add(assetId)) {
          debugPrint('ChallengeSfx: missing cached asset $assetId');
        }
        return;
      }
      final AudioPlayer player = AudioPlayer();
      try {
        await player.play(DeviceFileSource(file.path));
        await player.onPlayerComplete.first.timeout(const Duration(seconds: 4));
      } finally {
        await player.dispose();
      }
    } catch (error) {
      debugPrint('ChallengeSfx overlap play failed ($assetId): $error');
    }
  }

  /// Halt any in-progress gameplay SFX (e.g. Danger Pulse alarm after resolve).
  Future<void> stop() async {
    _playGeneration++;
    final AudioPlayer? player = _player;
    if (player == null) return;
    try {
      await player.stop();
    } catch (error) {
      debugPrint('ChallengeSfx stop failed: $error');
    }
  }

  Future<void> _playCached(String assetId) async {
    final int generation = ++_playGeneration;
    try {
      final file = await ContentAssetCache.instance.localFile(assetId);
      if (file == null) {
        if (_missingLogged.add(assetId)) {
          debugPrint('ChallengeSfx: missing cached asset $assetId');
        }
        return;
      }
      if (generation != _playGeneration) return;
      final AudioPlayer player = _player ??= AudioPlayer();
      await player.stop();
      if (generation != _playGeneration) return;
      await player.play(DeviceFileSource(file.path));
      if (generation != _playGeneration) {
        await player.stop();
      }
    } catch (error) {
      debugPrint('ChallengeSfx play failed ($assetId): $error');
    }
  }
}
