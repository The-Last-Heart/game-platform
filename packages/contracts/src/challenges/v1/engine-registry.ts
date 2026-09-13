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
] as const;
