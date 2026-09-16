import type { LaunchEngineId } from './engines';
import { ENGINE_RUNTIME_READINESS } from './engines';

export type StudioEngineRegistryEntry = {
  engineId: LaunchEngineId;
  familyId: string;
  categoryId: string;
  runtimeReadiness: 'live' | 'schema_only';
  labelKey: string;
};

export const STUDIO_ENGINE_REGISTRY: readonly StudioEngineRegistryEntry[] = [
  {
    engineId: 'reaction.wait_for_signal',
    familyId: 'reaction',
    categoryId: 'reaction.wait_for_signal',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['reaction.wait_for_signal'],
    labelKey: 'engine.reaction.wait_for_signal',
  },
  {
    engineId: 'trap.no_touch',
    familyId: 'trap',
    categoryId: 'trap.no_touch',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['trap.no_touch'],
    labelKey: 'engine.trap.no_touch',
  },
  {
    engineId: 'gesture.reverse_swipe',
    familyId: 'gesture',
    categoryId: 'gesture.reverse_swipe',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['gesture.reverse_swipe'],
    labelKey: 'engine.gesture.reverse_swipe',
  },
  {
    engineId: 'tap.precision',
    familyId: 'tap',
    categoryId: 'tap.precision',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['tap.precision'],
    labelKey: 'engine.tap.precision',
  },
  {
    engineId: 'memory.sequence',
    familyId: 'memory',
    categoryId: 'memory.sequence',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['memory.sequence'],
    labelKey: 'engine.memory.sequence',
  },
  {
    engineId: 'hold.multitouch',
    familyId: 'hold',
    categoryId: 'hold.multitouch',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['hold.multitouch'],
    labelKey: 'engine.hold.multitouch',
  },
  {
    engineId: 'motion.shake',
    familyId: 'motion',
    categoryId: 'motion.shake',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['motion.shake'],
    labelKey: 'engine.motion.shake',
  },
  {
    engineId: 'motion.tilt_balance',
    familyId: 'motion',
    categoryId: 'motion.tilt_balance',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['motion.tilt_balance'],
    labelKey: 'engine.motion.tilt_balance',
  },
  {
    engineId: 'audio.cue',
    familyId: 'audio',
    categoryId: 'audio.cue',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['audio.cue'],
    labelKey: 'engine.audio.cue',
  },
  {
    engineId: 'social.pair_sync',
    familyId: 'social',
    categoryId: 'social.pair_sync',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['social.pair_sync'],
    labelKey: 'engine.social.pair_sync',
  },
  {
    engineId: 'tactical.risk_choice',
    familyId: 'tactical',
    categoryId: 'tactical.risk_choice',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['tactical.risk_choice'],
    labelKey: 'engine.tactical.risk_choice',
  },
  {
    engineId: 'trivia.multiple_choice',
    familyId: 'trivia',
    categoryId: 'trivia.multiple_choice',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['trivia.multiple_choice'],
    labelKey: 'engine.trivia.multiple_choice',
  },
  {
    engineId: 'geography.select_on_map',
    familyId: 'geography',
    categoryId: 'geography.select_on_map',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['geography.select_on_map'],
    labelKey: 'engine.geography.select_on_map',
  },
  {
    engineId: 'focus.odd_one_out',
    familyId: 'focus',
    categoryId: 'focus.odd_one_out',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['focus.odd_one_out'],
    labelKey: 'engine.focus.odd_one_out',
  },
  {
    engineId: 'order.sequence_sort',
    familyId: 'order',
    categoryId: 'order.sequence_sort',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['order.sequence_sort'],
    labelKey: 'engine.order.sequence_sort',
  },
  {
    engineId: 'precision.maze_path',
    familyId: 'precision',
    categoryId: 'precision.maze_path',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['precision.maze_path'],
    labelKey: 'engine.precision.maze_path',
  },
  {
    engineId: 'precision.neon_cable',
    familyId: 'precision',
    categoryId: 'precision.neon_cable',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['precision.neon_cable'],
    labelKey: 'engine.precision.neon_cable',
  },
  {
    engineId: 'gesture.fog_wipe',
    familyId: 'gesture',
    categoryId: 'gesture.fog_wipe',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['gesture.fog_wipe'],
    labelKey: 'engine.gesture.fog_wipe',
  },
  {
    engineId: 'precision.circuit_rotation',
    familyId: 'precision',
    categoryId: 'precision.circuit_rotation',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['precision.circuit_rotation'],
    labelKey: 'engine.precision.circuit_rotation',
  },
  {
    engineId: 'precision.cable_untangle',
    familyId: 'precision',
    categoryId: 'precision.cable_untangle',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['precision.cable_untangle'],
    labelKey: 'engine.precision.cable_untangle',
  },
  {
    engineId: 'logic.balance_scale',
    familyId: 'logic',
    categoryId: 'logic.balance_scale',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['logic.balance_scale'],
    labelKey: 'engine.logic.balance_scale',
  },
  {
    engineId: 'logic.complete_sum',
    familyId: 'logic',
    categoryId: 'logic.complete_sum',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['logic.complete_sum'],
    labelKey: 'engine.logic.complete_sum',
  },
  {
    engineId: 'focus.stroop',
    familyId: 'focus',
    categoryId: 'focus.stroop',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['focus.stroop'],
    labelKey: 'engine.focus.stroop',
  },
  {
    engineId: 'search.select_occurrences',
    familyId: 'search',
    categoryId: 'search.select_occurrences',
    runtimeReadiness: ENGINE_RUNTIME_READINESS['search.select_occurrences'],
    labelKey: 'engine.search.select_occurrences',
  },
] as const;
