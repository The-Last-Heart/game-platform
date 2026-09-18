import 'dart:async';

import '../ui/widgets/challenge_sfx.dart';

abstract class LaserRoutingSfx {
  Future<void> play(String assetId);
  Future<void> playOverlapping(String assetId);
  Future<bool> playLoop(String assetId);
  Future<void> stop();
  Future<void> stopLoop();
  Future<void> stopAll();
}

class ChallengeSfxLaserAdapter implements LaserRoutingSfx {
  ChallengeSfxLaserAdapter(this._sfx);

  final ChallengeSfx _sfx;

  @override
  Future<void> play(String assetId) => _sfx.play(assetId);

  @override
  Future<void> playOverlapping(String assetId) => _sfx.playOverlapping(assetId);

  @override
  Future<bool> playLoop(String assetId) => _sfx.playLoop(assetId);

  @override
  Future<void> stop() => _sfx.stop();

  @override
  Future<void> stopLoop() => _sfx.stopLoop();

  @override
  Future<void> stopAll() => _sfx.stopAll();
}

class LaserRoutingAudioMachine {
  LaserRoutingAudioMachine({LaserRoutingSfx? sfx})
      : _sfx = sfx ?? ChallengeSfxLaserAdapter(ChallengeSfx.instance);

  final LaserRoutingSfx _sfx;
  String? _challengeId;
  int _terminalSequence = -1;
  bool _looping = false;
  bool _successPlayed = false;
  bool _muted = false;
  String? _lastReflectionKey;

  bool get looping => _looping;
  bool get successPlayed => _successPlayed;

  void setMuted(bool muted) {
    _muted = muted;
    if (muted) {
      _looping = false;
      unawaited(_sfx.stopAll());
    }
  }

  Future<void> sync({
    required String challengeId,
    required bool reconnect,
    required bool playable,
    required bool success,
    required bool timeout,
    required int stateSequence,
    required bool reflectionOccurred,
    required String? lastAcceptedCommandId,
    required String loopAssetId,
    required String reflectionAssetId,
    required String heartAssetId,
  }) async {
    if (_challengeId != challengeId) {
      _challengeId = challengeId;
      _terminalSequence = -1;
      _looping = false;
      _successPlayed = false;
      _lastReflectionKey = null;
      await _sfx.stopAll();
    }

    if (_muted) {
      return;
    }

    if (timeout || success) {
      if (_looping) {
        await _sfx.stopLoop();
        _looping = false;
      }
      await _sfx.stop();
    }

    if (success && !_successPlayed && stateSequence != _terminalSequence) {
      _successPlayed = true;
      _terminalSequence = stateSequence;
      if (!reconnect) {
        try {
          await _sfx.play(heartAssetId);
        } catch (_) {}
      }
      return;
    }

    if (timeout) {
      _terminalSequence = stateSequence;
      return;
    }

    if (!playable || success) {
      return;
    }

    if (!_looping) {
      try {
        final bool started = await _sfx.playLoop(loopAssetId);
        _looping = started;
      } catch (_) {
        _looping = false;
      }
    }

    if (reconnect || !reflectionOccurred || lastAcceptedCommandId == null) {
      return;
    }
    final String key = '$challengeId:$lastAcceptedCommandId:$stateSequence';
    if (key == _lastReflectionKey) {
      return;
    }
    _lastReflectionKey = key;
    try {
      await _sfx.playOverlapping(reflectionAssetId);
    } catch (_) {}
  }

  Future<void> dispose() async {
    _looping = false;
    await _sfx.stopAll();
  }
}
