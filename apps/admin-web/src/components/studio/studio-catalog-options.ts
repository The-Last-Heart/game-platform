/**
 * Operator-facing catalogs for Challenge Studio.
 * Values match mobile bootstrap / contract keys — labels come from i18n.
 */

export type CatalogOption = { value: string; labelKey: string };

export const DEVICE_CAPABILITY_OPTIONS: CatalogOption[] = [
  { value: 'touch', labelKey: 'studio.capability.touch' },
  { value: 'multitouch', labelKey: 'studio.capability.multitouch' },
  { value: 'accelerometer', labelKey: 'studio.capability.accelerometer' },
  { value: 'gyroscope', labelKey: 'studio.capability.gyroscope' },
  { value: 'audio_output', labelKey: 'studio.capability.audio_output' },
  { value: 'haptics', labelKey: 'studio.capability.haptics' },
];

export const KNOWN_ASSET_OPTIONS: CatalogOption[] = [
  { value: 'sfx.success', labelKey: 'studio.asset.sfxSuccess' },
  { value: 'sfx.fail', labelKey: 'studio.asset.sfxFail' },
  { value: 'sfx.tick', labelKey: 'studio.asset.sfxTick' },
  { value: 'sfx.signal', labelKey: 'studio.asset.sfxSignal' },
  { value: 'sfx.pulse', labelKey: 'studio.asset.sfxPulse' },
  { value: 'sfx.strike', labelKey: 'studio.asset.sfxStrike' },
  { value: 'sfx.win', labelKey: 'studio.asset.sfxWin' },
  { value: 'sfx.lose', labelKey: 'studio.asset.sfxLose' },

  { value: 'neon_cable.panel_background', labelKey: 'studio.asset.neonPanel' },
  {
    value: 'neon_cable.socket_housing',
    labelKey: 'studio.asset.neonSocketHousing',
  },
  { value: 'neon_cable.plug_body', labelKey: 'studio.asset.neonPlugBody' },
  { value: 'neon_cable.cable_spark', labelKey: 'studio.asset.neonCableSpark' },
  { value: 'neon_cable.composition', labelKey: 'studio.asset.neonComposition' },
  {
    value: 'circuit_rotation.board_base',
    labelKey: 'studio.asset.circuitBoardBase',
  },
  {
    value: 'circuit_rotation.grid_plate',
    labelKey: 'studio.asset.circuitGridPlate',
  },
  {
    value: 'circuit_rotation.cable_connected',
    labelKey: 'studio.asset.circuitCableConnectSfx',
  },
  {
    value: 'circuit_rotation.heart_power_on',
    labelKey: 'studio.asset.circuitHeartPowerOnSfx',
  },

  {
    value: 'fog_wipe.reveal_content',
    labelKey: 'studio.asset.fogRevealContent',
  },
  { value: 'fog_wipe.fog_density', labelKey: 'studio.asset.fogDensity' },
  { value: 'fog_wipe.droplets_height', labelKey: 'studio.asset.fogDroplets' },
  { value: 'fog_wipe.frosted_edges', labelKey: 'studio.asset.fogFrostedEdges' },
  { value: 'fog_wipe.scratch_mask', labelKey: 'studio.asset.fogScratchMask' },
  { value: 'fog_wipe.wet_smudge_mask', labelKey: 'studio.asset.fogWetSmudge' },
  {
    value: 'fog_wipe.glass_reflections',
    labelKey: 'studio.asset.fogGlassReflections',
  },
  { value: 'fog_wipe.swipe', labelKey: 'studio.asset.fogSwipeSfx' },
  {
    value: 'cable_untangle.swing',
    labelKey: 'studio.asset.cableUntangleSwingSfx',
  },
  { value: 'fog_wipe.reveal.petsev', labelKey: 'studio.asset.fogRevealPetsev' },
  { value: 'fog_wipe.reveal.gta_vi', labelKey: 'studio.asset.fogRevealGtaVi' },
  {
    value: 'fog_wipe.reveal.snowman',
    labelKey: 'studio.asset.fogRevealSnowman',
  },
  {
    value: 'fog_wipe.reveal.cucumber',
    labelKey: 'studio.asset.fogRevealCucumber',
  },
  { value: 'fog_wipe.reveal.wrap', labelKey: 'studio.asset.fogRevealWrap' },
  {
    value: 'fog_wipe.reveal.watermelon',
    labelKey: 'studio.asset.fogRevealWatermelon',
  },

  { value: 'haptic.light', labelKey: 'studio.asset.hapticLight' },
  { value: 'haptic.medium', labelKey: 'studio.asset.hapticMedium' },
  { value: 'haptic.heavy', labelKey: 'studio.asset.hapticHeavy' },
  { value: 'shape.heart', labelKey: 'studio.asset.shapeHeart' },
  { value: 'shape.circle', labelKey: 'studio.asset.shapeCircle' },
  { value: 'shape.target', labelKey: 'studio.asset.shapeTarget' },
];

/** Default fog-wipe reveal pool for Challenge Studio. */
export const FOG_WIPE_REVEAL_VARIANT_OPTIONS: CatalogOption[] = [
  { value: 'fog_wipe.reveal.petsev', labelKey: 'studio.asset.fogRevealPetsev' },
  { value: 'fog_wipe.reveal.gta_vi', labelKey: 'studio.asset.fogRevealGtaVi' },
  {
    value: 'fog_wipe.reveal.snowman',
    labelKey: 'studio.asset.fogRevealSnowman',
  },
  {
    value: 'fog_wipe.reveal.cucumber',
    labelKey: 'studio.asset.fogRevealCucumber',
  },
  { value: 'fog_wipe.reveal.wrap', labelKey: 'studio.asset.fogRevealWrap' },
  {
    value: 'fog_wipe.reveal.watermelon',
    labelKey: 'studio.asset.fogRevealWatermelon',
  },
];

export const FOG_WIPE_LAYER_ASSET_IDS = [
  'fog_wipe.fog_density',
  'fog_wipe.droplets_height',
  'fog_wipe.frosted_edges',
  'fog_wipe.scratch_mask',
  'fog_wipe.wet_smudge_mask',
  'fog_wipe.glass_reflections',
  'fog_wipe.swipe',
] as const;

export const CATEGORY_KEY_OPTIONS: CatalogOption[] = [
  {
    value: 'challenge.category.reaction',
    labelKey: 'studio.catalog.category.reaction',
  },
  {
    value: 'challenge.category.trap',
    labelKey: 'studio.catalog.category.trap',
  },
  {
    value: 'challenge.category.gesture',
    labelKey: 'studio.catalog.category.gesture',
  },
  { value: 'challenge.category.tap', labelKey: 'studio.catalog.category.tap' },
  {
    value: 'challenge.category.memory',
    labelKey: 'studio.catalog.category.memory',
  },
  {
    value: 'challenge.category.hold',
    labelKey: 'studio.catalog.category.hold',
  },
  {
    value: 'challenge.category.motion',
    labelKey: 'studio.catalog.category.motion',
  },
  {
    value: 'challenge.category.audio',
    labelKey: 'studio.catalog.category.audio',
  },
  {
    value: 'challenge.category.social',
    labelKey: 'studio.catalog.category.social',
  },
  {
    value: 'challenge.category.tactical',
    labelKey: 'studio.catalog.category.tactical',
  },
  {
    value: 'challenge.category.trivia',
    labelKey: 'studio.catalog.category.trivia',
  },
  {
    value: 'challenge.category.geography',
    labelKey: 'studio.catalog.category.geography',
  },
  {
    value: 'challenge.category.focus',
    labelKey: 'studio.catalog.category.focus',
  },
  {
    value: 'challenge.category.order',
    labelKey: 'studio.catalog.category.order',
  },
  {
    value: 'challenge.category.precision',
    labelKey: 'studio.catalog.category.precision',
  },
  {
    value: 'challenge.category.logic',
    labelKey: 'studio.catalog.category.logic',
  },
  {
    value: 'challenge.category.search',
    labelKey: 'studio.catalog.category.search',
  },
];

export const PROMPT_KEY_OPTIONS: CatalogOption[] = [
  {
    value: 'challenge.wait_for_signal.intro',
    labelKey: 'studio.catalog.prompt.waitIntro',
  },
  {
    value: 'challenge.wait_for_signal.waiting',
    labelKey: 'studio.catalog.prompt.waitWaiting',
  },
  {
    value: 'challenge.wait_for_signal.waiting_hint',
    labelKey: 'studio.catalog.prompt.waitWaitingHint',
  },
  {
    value: 'challenge.wait_for_signal.active',
    labelKey: 'studio.catalog.prompt.waitActive',
  },
  {
    value: 'challenge.wait_for_signal.action',
    labelKey: 'studio.catalog.prompt.waitAction',
  },
  {
    value: 'challenge.no_touch.intro',
    labelKey: 'studio.catalog.prompt.noTouchIntro',
  },
  {
    value: 'challenge.no_touch.prompt',
    labelKey: 'studio.catalog.prompt.noTouchPrompt',
  },
  {
    value: 'challenge.no_touch.bait',
    labelKey: 'studio.catalog.prompt.noTouchBait',
  },
  {
    value: 'challenge.no_touch.zone_hint',
    labelKey: 'studio.catalog.prompt.noTouchZone',
  },
  {
    value: 'challenge.reverse_swipe.intro',
    labelKey: 'studio.catalog.prompt.swipeIntro',
  },
  {
    value: 'challenge.reverse_swipe.prompt',
    labelKey: 'studio.catalog.prompt.swipePrompt',
  },
  {
    value: 'challenge.precision.intro',
    labelKey: 'studio.catalog.prompt.precisionIntro',
  },
  {
    value: 'challenge.precision.prompt',
    labelKey: 'studio.catalog.prompt.precisionPrompt',
  },
  {
    value: 'challenge.memory.intro',
    labelKey: 'studio.catalog.prompt.memoryIntro',
  },
  {
    value: 'challenge.memory.prompt',
    labelKey: 'studio.catalog.prompt.memoryPrompt',
  },
  {
    value: 'challenge.hold.intro',
    labelKey: 'studio.catalog.prompt.holdIntro',
  },
  {
    value: 'challenge.hold.prompt',
    labelKey: 'studio.catalog.prompt.holdPrompt',
  },
  {
    value: 'challenge.shake.prompt',
    labelKey: 'studio.catalog.prompt.shakePrompt',
  },
  {
    value: 'challenge.shake.progress',
    labelKey: 'studio.catalog.prompt.shakeProgress',
  },
  {
    value: 'challenge.tilt.prompt',
    labelKey: 'studio.catalog.prompt.tiltPrompt',
  },
  {
    value: 'challenge.audio.prompt',
    labelKey: 'studio.catalog.prompt.audioPrompt',
  },
  {
    value: 'challenge.audio.visual_fallback',
    labelKey: 'studio.catalog.prompt.audioVisual',
  },
  {
    value: 'challenge.audio.haptic_fallback',
    labelKey: 'studio.catalog.prompt.audioHaptic',
  },
  {
    value: 'challenge.audio_mc.intro',
    labelKey: 'studio.catalog.prompt.audioMcIntro',
  },
  {
    value: 'challenge.audio_mc.prompt_artist',
    labelKey: 'studio.catalog.prompt.audioMcArtist',
  },
  {
    value: 'challenge.audio_mc.prompt_track',
    labelKey: 'studio.catalog.prompt.audioMcTrack',
  },
  {
    value: 'challenge.pair_sync.prompt',
    labelKey: 'studio.catalog.prompt.pairPrompt',
  },
  {
    value: 'challenge.risk_choice.prompt',
    labelKey: 'studio.catalog.prompt.riskPrompt',
  },
];

export const FALLBACK_KEY_OPTIONS: CatalogOption[] = [
  {
    value: 'reaction.wait_for_signal.v1',
    labelKey: 'studio.catalog.fallback.wait',
  },
  { value: 'trap.no_touch.v1', labelKey: 'studio.catalog.fallback.noTouch' },
  {
    value: 'gesture.reverse_swipe.v1',
    labelKey: 'studio.catalog.fallback.swipe',
  },
  { value: 'tap.precision.v1', labelKey: 'studio.catalog.fallback.precision' },
  { value: 'memory.sequence.v1', labelKey: 'studio.catalog.fallback.memory' },
  { value: 'hold.multitouch.v1', labelKey: 'studio.catalog.fallback.hold' },
  { value: 'motion.shake.v1', labelKey: 'studio.catalog.fallback.shake' },
  { value: 'motion.tilt_balance.v1', labelKey: 'studio.catalog.fallback.tilt' },
  { value: 'audio.cue.v1', labelKey: 'studio.catalog.fallback.audio' },
  {
    value: 'challenge.audio_mc.a11y_fallback',
    labelKey: 'studio.catalog.fallback.audioMc',
  },
  { value: 'social.pair_sync.v1', labelKey: 'studio.catalog.fallback.pair' },
  {
    value: 'tactical.risk_choice.v1',
    labelKey: 'studio.catalog.fallback.risk',
  },
];

export const OUTCOME_REASON_CODES = [
  'success',
  'failure',
  'timeout',
  'early',
  'invalid',
  'prohibited',
] as const;

export const MEMORY_OPTION_PRESETS = [
  { value: 'opt.a', labelKey: 'studio.catalog.memory.optA' },
  { value: 'opt.b', labelKey: 'studio.catalog.memory.optB' },
  { value: 'opt.c', labelKey: 'studio.catalog.memory.optC' },
  { value: 'opt.d', labelKey: 'studio.catalog.memory.optD' },
] as const;

export const PAIR_ROLE_PRESETS = [
  { value: 'role.leader', labelKey: 'studio.catalog.pair.leader' },
  { value: 'role.follower', labelKey: 'studio.catalog.pair.follower' },
] as const;

export const RISK_OPTION_PRESETS = [
  { value: 'option.safe', labelKey: 'studio.catalog.risk.safe' },
  { value: 'option.risky', labelKey: 'studio.catalog.risk.risky' },
] as const;

export const STROOP_WORD_KEY_OPTIONS: CatalogOption[] = [
  { value: 'color.red', labelKey: 'studio.catalog.stroop.word.red' },
  { value: 'color.blue', labelKey: 'studio.catalog.stroop.word.blue' },
  { value: 'color.cyan', labelKey: 'studio.catalog.stroop.word.cyan' },
  { value: 'color.yellow', labelKey: 'studio.catalog.stroop.word.yellow' },
];

export const STROOP_INK_COLOR_OPTIONS: CatalogOption[] = [
  { value: 'cyan', labelKey: 'studio.catalog.stroop.ink.cyan' },
  { value: 'red', labelKey: 'studio.catalog.stroop.ink.red' },
  { value: 'yellow', labelKey: 'studio.catalog.stroop.ink.yellow' },
];

export const ZONE_PRESETS: {
  id: string;
  labelKey: string;
  zone: { x: number; y: number; width: number; height: number };
}[] = [
  {
    id: 'full',
    labelKey: 'studio.preset.zone.full',
    zone: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
  },
  {
    id: 'center',
    labelKey: 'studio.preset.zone.center',
    zone: { x: 0.2, y: 0.25, width: 0.6, height: 0.5 },
  },
  {
    id: 'bottom',
    labelKey: 'studio.preset.zone.bottom',
    zone: { x: 0.1, y: 0.55, width: 0.8, height: 0.35 },
  },
  {
    id: 'top',
    labelKey: 'studio.preset.zone.top',
    zone: { x: 0.1, y: 0.1, width: 0.8, height: 0.35 },
  },
];

export const TIMING_DURATION_PRESETS_MS = [
  { ms: 3000, labelKey: 'studio.preset.duration.short' },
  { ms: 5000, labelKey: 'studio.preset.duration.standard' },
  { ms: 8000, labelKey: 'studio.preset.duration.long' },
  { ms: 10_000, labelKey: 'studio.preset.duration.extended' },
] as const;

export const INTRO_DURATION_PRESETS_MS = [
  { ms: 0, labelKey: 'studio.preset.intro.none' },
  { ms: 1000, labelKey: 'studio.preset.intro.brief' },
  { ms: 2000, labelKey: 'studio.preset.intro.standard' },
  { ms: 3000, labelKey: 'studio.preset.intro.clear' },
] as const;

export const RESULT_HOLD_PRESETS_MS = [
  { ms: 1500, labelKey: 'studio.preset.result.brief' },
  { ms: 3000, labelKey: 'studio.preset.result.standard' },
  { ms: 4500, labelKey: 'studio.preset.result.long' },
] as const;

export const WEIGHT_PRESETS = [
  { value: 50, labelKey: 'studio.preset.weight.rare' },
  { value: 100, labelKey: 'studio.preset.weight.normal' },
  { value: 200, labelKey: 'studio.preset.weight.common' },
  { value: 400, labelKey: 'studio.preset.weight.featured' },
] as const;

export const SIGNAL_FEEL_PRESETS = [
  {
    id: 'fast',
    labelKey: 'studio.preset.signal.fast',
    signalDelayMs: 800,
    signalWindowMs: 500,
  },
  {
    id: 'standard',
    labelKey: 'studio.preset.signal.standard',
    signalDelayMs: 1500,
    signalWindowMs: 1500,
  },
  {
    id: 'slow',
    labelKey: 'studio.preset.signal.slow',
    signalDelayMs: 2500,
    signalWindowMs: 1500,
  },
] as const;

export const SWIPE_DISTANCE_PRESETS = [
  { px: 60, labelKey: 'studio.preset.swipe.short' },
  { px: 100, labelKey: 'studio.preset.swipe.medium' },
  { px: 160, labelKey: 'studio.preset.swipe.long' },
] as const;

export const SHAKE_SENSITIVITY_PRESETS = [
  {
    id: 'easy',
    labelKey: 'studio.preset.shake.easy',
    noiseThreshold: 3,
    requiredShakeCount: 3,
  },
  {
    id: 'normal',
    labelKey: 'studio.preset.shake.normal',
    noiseThreshold: 5,
    requiredShakeCount: 5,
  },
  {
    id: 'hard',
    labelKey: 'studio.preset.shake.hard',
    noiseThreshold: 8,
    requiredShakeCount: 8,
  },
] as const;

export const APP_VERSION_PRESETS = [
  { value: '0.0.0', labelKey: 'studio.preset.app.any' },
  { value: '0.1.0', labelKey: 'studio.preset.app.v010' },
  { value: '1.0.0', labelKey: 'studio.preset.app.v100' },
] as const;

export function slugifyDefinitionId(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'challenge'
  );
}
