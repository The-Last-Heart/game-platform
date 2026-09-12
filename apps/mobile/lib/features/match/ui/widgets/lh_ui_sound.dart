import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Lightweight UI chrome tap feedback (not challenge/game audio).
class LhUiSound {
  LhUiSound._();

  static final LhUiSound instance = LhUiSound._();

  AudioPlayer? _player;
  bool _failed = false;

  Future<void> playTap() async {
    try {
      await HapticFeedback.selectionClick();
    } catch (_) {
      // Haptics unavailable on some hosts — ignore.
    }
    if (_failed) return;
    try {
      final AudioPlayer player = _player ??= AudioPlayer();
      await player.stop();
      await player.play(AssetSource('sfx/ui_tap.mp3'));
    } catch (error) {
      _failed = true;
      debugPrint('LhUiSound play failed: $error');
    }
  }
}
