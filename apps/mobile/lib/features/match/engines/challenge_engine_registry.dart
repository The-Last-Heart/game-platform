import 'challenge_engine.dart';
import 'reaction_wait_for_signal_engine.dart';
import 'unknown_engine.dart';

/// Registry mapping engineId → [ChallengeEngine].
///
/// Returns [UnknownEngine] for unrecognized engine identifiers.
class ChallengeEngineRegistry {
  ChallengeEngineRegistry() {
    register(ReactionWaitForSignalEngine());
  }

  final Map<String, ChallengeEngine> _engines = <String, ChallengeEngine>{};

  void register(ChallengeEngine engine) {
    _engines[engine.engineId] = engine;
  }

  ChallengeEngine resolve(String engineId) {
    return _engines[engineId] ?? UnknownEngine();
  }
}
