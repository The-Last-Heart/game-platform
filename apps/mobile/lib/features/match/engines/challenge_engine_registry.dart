import 'audio_cue_engine.dart';
import 'audio_multiple_choice_engine.dart';
import 'challenge_engine.dart';
import 'focus_odd_one_out_engine.dart';
import 'focus_stroop_engine.dart';
import 'geography_select_on_map_engine.dart';
import 'gesture_reverse_swipe_engine.dart';
import 'hold_multitouch_engine.dart';
import 'logic_balance_scale_engine.dart';
import 'logic_complete_sum_engine.dart';
import 'laser_routing_engine.dart';
import 'memory_sequence_engine.dart';
import 'motion_shake_engine.dart';
import 'motion_tilt_balance_engine.dart';
import 'order_sequence_sort_engine.dart';
import 'precision_circuit_rotation_engine.dart';
import 'precision_cable_untangle_engine.dart';
import 'precision_maze_path_engine.dart';
import 'precision_neon_cable_engine.dart';
import 'gesture_fog_wipe_engine.dart';
import 'precision_ring_lock_engine.dart';
import 'reaction_wait_for_signal_engine.dart';
import 'search_select_occurrences_engine.dart';
import 'social_pair_sync_engine.dart';
import 'social_pass_the_pulse_engine.dart';
import 'tap_precision_engine.dart';
import 'tactical_risk_choice_engine.dart';
import 'trap_no_touch_engine.dart';
import 'trivia_multiple_choice_engine.dart';
import 'common_word_engine.dart';
import 'three_doors_engine.dart';
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
    register(MotionShakeEngine());
    register(MotionTiltBalanceEngine());
    register(AudioCueEngine());
    register(AudioMultipleChoiceEngine());
    register(SocialPairSyncEngine());
    register(SocialPassThePulseEngine());
    register(TacticalRiskChoiceEngine());
    register(TriviaMultipleChoiceEngine());
    register(CommonWordEngine());
    register(GeographySelectOnMapEngine());
    register(FocusOddOneOutEngine());
    register(OrderSequenceSortEngine());
    register(PrecisionMazePathEngine());
    register(PrecisionNeonCableEngine());
    register(PrecisionCircuitRotationEngine());
    register(PrecisionCableUntangleEngine());
    register(GestureFogWipeEngine());
    register(PrecisionRingLockEngine());
    register(LaserRoutingEngine());
    register(LogicBalanceScaleEngine());
    register(LogicCompleteSumEngine());
    register(ThreeDoorsLogicEngine());
    register(FocusStroopEngine());
    register(SearchSelectOccurrencesEngine());
  }

  final Map<String, ChallengeEngine> _engines = <String, ChallengeEngine>{};

  void register(ChallengeEngine engine) {
    _engines[engine.engineId] = engine;
  }

  ChallengeEngine resolve(String engineId) {
    return _engines[engineId] ?? UnknownEngine();
  }
}
