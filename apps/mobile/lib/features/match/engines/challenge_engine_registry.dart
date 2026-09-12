import 'challenge_engine.dart';
import 'gesture_reverse_swipe_engine.dart';
import 'hold_multitouch_engine.dart';
import 'memory_sequence_engine.dart';
import 'reaction_wait_for_signal_engine.dart';
import 'tap_precision_engine.dart';
import 'trap_no_touch_engine.dart';
import 'unknown_engine.dart';

/// Registry mapping engineId → [ChallengeEngine].
///
/// Returns [UnknownEngine] for unrecognized engine identifiers.
class ChallengeEngineRegistry {
  ChallengeEngineRegistry() {
    register(ReactionWaitForSignalEngine());
    register(TrapNoTouchEngine());
    register(GestureReverseSwipeEngine());
    register(TapPrecisionEngine());
    register(MemorySequenceEngine());
    register(HoldMultitouchEngine());
  }

  final Map<String, ChallengeEngine> _engines = <String, ChallengeEngine>{};

  void register(ChallengeEngine engine) {
    _engines[engine.engineId] = engine;
  }

  ChallengeEngine resolve(String engineId) {
    return _engines[engineId] ?? UnknownEngine();
  }
}
