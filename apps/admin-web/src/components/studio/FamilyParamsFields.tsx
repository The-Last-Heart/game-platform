'use client';

import { useMemo, useState } from 'react';
import type { LaunchEngineId } from '@thelastheart/contracts';
import {
  AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
  oppositeSwipeDirection,
} from '@thelastheart/contracts';
import type { SwipeDirection } from '@thelastheart/contracts';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages/en';
import { adminApiFetch } from '@/lib/api/client';
import {
  FieldCheckboxGroup,
  FieldGroup,
  FieldInput,
  FieldSelect,
  readFieldInputValue,
} from './Field';
import {
  CatalogKeyField,
  ChipMultiSelect,
  CollapsibleGroup,
  DurationSecondsField,
  FractionPercentField,
  OrderedChipEditor,
  PresetChips,
  SegmentedChoice,
  TargetPad,
  ZonePad,
} from './OperatorControls';
import {
  CATEGORY_KEY_OPTIONS,
  FOG_WIPE_LAYER_ASSET_IDS,
  FOG_WIPE_REVEAL_VARIANT_OPTIONS,
  MEMORY_OPTION_PRESETS,
  PAIR_ROLE_PRESETS,
  PROMPT_KEY_OPTIONS,
  RISK_OPTION_PRESETS,
  SHAKE_SENSITIVITY_PRESETS,
  SIGNAL_FEEL_PRESETS,
  STROOP_INK_COLOR_OPTIONS,
  STROOP_WORD_KEY_OPTIONS,
  SWIPE_DISTANCE_PRESETS,
  ZONE_PRESETS,
} from './studio-catalog-options';
import { AudioMultipleChoiceFields } from './AudioMultipleChoiceFields';
import {
  audioClientPreview,
  defaultAudioQuestions,
  serializeAudioQuestions,
} from './audio-question-bank';
import {
  addTriviaOption,
  createTriviaQuestion,
  defaultTriviaQuestions,
  parseTriviaQuestions,
  removeTriviaOption,
  serializeTriviaQuestions,
  triviaClientPreview,
  triviaQuestionBankSignature,
  type TriviaStudioQuestion,
} from './trivia-question-bank';
import {
  createStroopVariant,
  normalizeStroopVariant,
  parseStroopVariants,
  serializeStroopVariants,
  stroopClientPreview,
  type StroopStudioVariant,
} from './stroop-variant-bank';

const DEFAULT_FOG_WIPE_REVEAL_VARIANTS = FOG_WIPE_REVEAL_VARIANT_OPTIONS.map(
  (o) => o.value,
);

function defaultFogWipeAssetIds(revealContent: string): Record<string, string> {
  return {
    revealContent,
    fogDensity: 'fog_wipe.fog_density',
    dropletHeight: 'fog_wipe.droplets_height',
    frostedEdges: 'fog_wipe.frosted_edges',
    scratchMask: 'fog_wipe.scratch_mask',
    wetSmudgeMask: 'fog_wipe.wet_smudge_mask',
    glassReflections: 'fog_wipe.glass_reflections',
    swipeSfx: 'fog_wipe.swipe',
  };
}

/** Ensure Pass the Pulse references shared pack heartbeat (no duplicate file). */
export function ensurePassThePulseRequiredAssets(current: string[]): string[] {
  if (current.includes('sfx.pulse')) return current;
  return ['sfx.pulse', ...current];
}

/** Merge fog layers + reveal variants into requiredAssetIds (preserve extras). */
export function mergeFogWipeRequiredAssets(
  current: string[],
  variants: string[],
  revealContent?: string,
): string[] {
  const required = new Set<string>([
    ...FOG_WIPE_LAYER_ASSET_IDS,
    ...variants,
    ...(revealContent ? [revealContent] : []),
  ]);
  const extras = current.filter(
    (id) => !required.has(id) && !id.startsWith('fog_wipe.'),
  );
  return [...required, ...extras];
}

function defaultCircuitRotationSharedConfig(): Record<string, unknown> {
  return {
    assetIds: {
      boardBase: 'circuit_rotation.board_base',
      gridPlate: 'circuit_rotation.grid_plate',
      sparkRive: 'neon_cable.cable_spark',
    },
    grid: { rows: 3, columns: 3 },
    source: { cell: [2, 0], side: 'south' },
    target: { cell: [0, 2], side: 'north', kind: 'heart' },
    tiles: [
      {
        id: 'source-corner',
        cell: [2, 0],
        shape: 'corner',
        initialQuarterTurns: 1,
        movable: false,
      },
      {
        id: 'bottom-turn',
        cell: [2, 1],
        shape: 'corner',
        initialQuarterTurns: 0,
        movable: true,
      },
      {
        id: 'center-straight',
        cell: [1, 1],
        shape: 'straight',
        initialQuarterTurns: 0,
        movable: false,
      },
      {
        id: 'top-turn',
        cell: [0, 1],
        shape: 'corner',
        initialQuarterTurns: 2,
        movable: true,
      },
      {
        id: 'heart-corner',
        cell: [0, 2],
        shape: 'corner',
        initialQuarterTurns: 3,
        movable: false,
      },
    ],
    stationaryConnections: [
      { cell: [2, 0], side: 'south' },
      { cell: [0, 2], side: 'north' },
    ],
    theme: {
      inactivePipeColor: '#173746',
      energyColor: '#55E9FF',
      energyCoreColor: '#EFFFFF',
      socketColor: '#B7C3CB',
    },
    rotationDegrees: 90,
  };
}

function defaultCableUntangleSharedConfig(): Record<string, unknown> {
  return {
    layout: {
      leftColumnX: 0.12,
      rightColumnX: 0.88,
      topPadding: 0.1,
      bottomPadding: 0.1,
    },
    sockets: {
      left: [
        { id: 'left-1', order: 0 },
        { id: 'left-2', order: 1 },
        { id: 'left-3', order: 2 },
        { id: 'left-4', order: 3 },
      ],
      right: [
        { id: 'right-1', order: 0 },
        { id: 'right-2', order: 1 },
        { id: 'right-3', order: 2 },
        { id: 'right-4', order: 3 },
      ],
    },
    cables: [
      {
        id: 'cable-1',
        leftSocketId: 'left-1',
        initialRightSocketId: 'right-3',
      },
      {
        id: 'cable-2',
        leftSocketId: 'left-2',
        initialRightSocketId: 'right-1',
      },
      {
        id: 'cable-3',
        leftSocketId: 'left-3',
        initialRightSocketId: 'right-4',
      },
      {
        id: 'cable-4',
        leftSocketId: 'left-4',
        initialRightSocketId: 'right-2',
      },
    ],
    theme: {
      backgroundColor: '#07131D',
      gridColor: '#143143',
      cableColor: '#69E7FF',
      cableCoreColor: '#E8FCFF',
      socketColor: '#91EFFF',
    },
    assetIds: {
      swingSfx: 'cable_untangle.swing',
    },
    snapRadiusNorm: 0.08,
    mirrorHorizontally: false,
  };
}

export function defaultClientConfig(
  engineId: LaunchEngineId,
): Record<string, unknown> {
  switch (engineId) {
    case 'reaction.wait_for_signal':
      return {
        categoryKey: 'challenge.category.reaction',
        waitingPromptKey: 'challenge.wait_for_signal.waiting',
        waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
        activePromptKey: 'challenge.wait_for_signal.active',
        actionKey: 'challenge.wait_for_signal.action',
      };
    case 'trap.no_touch':
      return {
        categoryKey: 'challenge.category.trap',
        promptKey: 'challenge.no_touch.prompt',
        zoneHintKey: 'challenge.no_touch.zone_hint',
        zone: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      };
    case 'gesture.reverse_swipe':
      return {
        categoryKey: 'challenge.category.gesture',
        promptKey: 'challenge.reverse_swipe.prompt',
        displayedDirection: 'up' as SwipeDirection,
        minDistancePx: 100,
      };
    case 'tap.precision':
      return {
        categoryKey: 'challenge.category.tap',
        promptKey: 'challenge.precision.prompt',
        targets: [{ id: 't1', x: 0.5, y: 0.5 }],
        attemptCount: 1,
      };
    case 'memory.sequence':
      return {
        categoryKey: 'challenge.category.memory',
        promptKey: 'challenge.memory.prompt',
        optionKeys: ['opt.a', 'opt.b', 'opt.c'],
        previewMs: 2000,
      };
    case 'hold.multitouch':
      return {
        categoryKey: 'challenge.category.hold',
        promptKey: 'challenge.hold.prompt',
        requiredContacts: 2,
        holdMs: 3000,
      };
    case 'motion.shake':
      return {
        categoryKey: 'challenge.category.motion',
        promptKey: 'challenge.shake.prompt',
        progressKey: 'challenge.shake.progress',
      };
    case 'motion.tilt_balance':
      return {
        categoryKey: 'challenge.category.motion',
        promptKey: 'challenge.tilt.prompt',
      };
    case 'audio.cue':
      return {
        categoryKey: 'challenge.category.audio',
        promptKey: 'challenge.audio.prompt',
        visualFallbackKey: 'challenge.audio.visual_fallback',
        hapticFallbackKey: 'challenge.audio.haptic_fallback',
      };
    case 'social.pair_sync':
      return {
        categoryKey: 'challenge.category.social',
        promptKey: 'challenge.pair_sync.prompt',
        partnerRoleKeys: ['role.leader', 'role.follower'],
      };
    case 'tactical.risk_choice':
      return {
        categoryKey: 'challenge.category.tactical',
        promptKey: 'challenge.risk_choice.prompt',
        optionKeys: ['option.safe', 'option.risky'],
      };
    case 'trivia.multiple_choice':
      return {
        categoryKey: 'challenge.category.trivia',
        promptKey: 'challenge.trivia.prompt',
        questionKey: 'trivia.q.japan_capital',
        optionKeys: [
          'trivia.opt.osaka',
          'trivia.opt.tokyo',
          'trivia.opt.seoul',
          'trivia.opt.kyoto',
        ],
        footerKey: 'challenge.trivia.footer',
      };
    case 'audio.multiple_choice':
      return audioClientPreview(defaultAudioQuestions()[0], {
        categoryKey: 'challenge.category.audio',
        promptKey: 'challenge.audio_mc.prompt_artist',
        titleKey: 'challenge.audio_mc.intro',
        footerKey: 'challenge.audio_mc.footer',
      });
    case 'geography.select_on_map':
      return {
        categoryKey: 'challenge.category.geography',
        promptKey: 'challenge.map.prompt',
        footerKey: 'challenge.map.footer',
        mapId: 'map.levant',
        assetId: 'map.levant',
        imageWidth: 1233,
        imageHeight: 1276,
        targetLabelKey: 'geo.country.jordan',
        regions: [
          {
            regionId: 'jordan',
            labelKey: 'geo.country.jordan',
            polygon: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ],
      };
    case 'focus.odd_one_out':
      return {
        categoryKey: 'challenge.category.focus',
        promptKey: 'challenge.odd.prompt',
        footerKey: 'challenge.odd.footer',
        columns: 4,
        glyphKeys: [
          'pulse.a',
          'pulse.a',
          'pulse.a',
          'pulse.b',
          'pulse.a',
          'pulse.a',
          'pulse.a',
          'pulse.a',
        ],
      };
    case 'order.sequence_sort':
      return {
        categoryKey: 'challenge.category.order',
        promptKey: 'challenge.order.prompt',
        footerKey: 'challenge.order.footer',
        itemKeys: ['num.4', 'num.9', 'num.2', 'num.7'],
        ascending: true,
      };
    case 'precision.maze_path':
      return {
        categoryKey: 'challenge.category.precision',
        promptKey: 'challenge.maze.prompt',
        footerKey: 'challenge.maze.footer',
        cols: 5,
        rows: 5,
        cells: [
          1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0,
          1, 1,
        ],
        startIndex: 0,
        goalIndex: 24,
      };
    case 'precision.neon_cable':
      return {
        categoryKey: 'challenge.category.precision',
        promptKey: 'challenge.neon_cable.prompt',
        footerKey: 'challenge.neon_cable.footer',
        assetIds: {
          panel: 'neon_cable.panel_background',
          socketHousing: 'neon_cable.socket_housing',
          socketRingCyan: 'neon_cable.socket_ring_cyan',
          socketRingRed: 'neon_cable.socket_ring_red',
          socketGlowCyan: 'neon_cable.socket_glow_cyan',
          socketGlowRed: 'neon_cable.socket_glow_red',
          plugBody: 'neon_cable.plug_body',
          plugGlow: 'neon_cable.plug_glow_cyan',
          plugShadow: 'neon_cable.plug_shadow',
          snapSparksCyan: 'neon_cable.snap_sparks_cyan',
          snapSparksRed: 'neon_cable.snap_sparks_red',
          sparkRive: 'neon_cable.cable_spark',
          sparkSfx: 'neon_cable.spark',
          composition: 'neon_cable.composition',
        },
        sockets: [
          { socketId: 'socket.cyan', color: 'cyan', xNorm: 0.78, yNorm: 0.34 },
          { socketId: 'socket.red', color: 'red', xNorm: 0.78, yNorm: 0.66 },
        ],
        plugStartXNorm: 0.28,
        plugStartYNorm: 0.5,
        cableAnchorXNorm: 0.08,
        cableAnchorYNorm: 0.5,
        plugCableAnchorNorm: [0.105, 0.5],
        plugTipAnchorNorm: [0.895, 0.5],
        socketTargetAnchorNorm: [0.5, 0.5],
        snapRadiusNorm: 0.09,
        wrongDropPolicy: 'fail_final',
        correctSocketId: 'socket.cyan',
        plugColor: 'cyan',
      };
    case 'gesture.fog_wipe': {
      const reveal = DEFAULT_FOG_WIPE_REVEAL_VARIANTS[0]!;
      return {
        categoryKey: 'challenge.category.gesture',
        promptKey: 'challenge.fog_wipe.prompt',
        footerKey: 'challenge.fog_wipe.footer',
        assetIds: defaultFogWipeAssetIds(reveal),
        brushDiameterNorm: 0.12,
        brushFeatherNorm: 0.28,
        clearanceRatioMin: 0.55,
      };
    }
    case 'precision.circuit_rotation':
      return {
        categoryKey: 'challenge.category.precision',
        promptKey: 'challenge.circuit_rotation.prompt',
        footerKey: 'challenge.circuit_rotation.footer',
        ...defaultCircuitRotationSharedConfig(),
      };
    case 'precision.cable_untangle':
      return {
        categoryKey: 'challenge.category.precision',
        titleKey: 'challenge.cable_untangle.intro',
        promptKey: 'challenge.cable_untangle.prompt',
        footerKey: 'challenge.cable_untangle.footer',
        ...defaultCableUntangleSharedConfig(),
      };
    case 'logic.balance_scale':
      return {
        categoryKey: 'challenge.category.logic',
        promptKey: 'challenge.balance.prompt',
        footerKey: 'challenge.balance.footer',
        leftWeights: [1, 2],
        rightKnownWeights: [1],
        optionWeights: [1, 2, 3],
      };
    case 'focus.stroop':
      return {
        categoryKey: 'challenge.category.focus',
        promptKey: 'challenge.stroop.prompt',
        footerKey: 'challenge.stroop.footer',
        wordKey: 'color.red',
        inkColorId: 'cyan',
        optionKeys: ['cyan', 'red', 'yellow'],
      };
    case 'search.select_occurrences':
      return {
        categoryKey: 'challenge.category.search',
        promptKey: 'challenge.search.prompt',
        footerKey: 'challenge.search.footer',
        columns: 4,
        cells: [
          '3',
          '8',
          '0',
          '5',
          '2',
          '9',
          '6',
          '8',
          '0',
          '5',
          '8',
          '2',
          '9',
          '3',
          '6',
          '0',
        ],
        targetValue: '8',
      };
    case 'logic.complete_sum':
      return {
        categoryKey: 'challenge.category.logic',
        titleKey: 'challenge.complete_sum.intro',
        promptKey: 'challenge.complete_sum.prompt',
        currentTotalKey: 'challenge.complete_sum.current_total',
        chooseNumberKey: 'challenge.complete_sum.choose',
        readyKey: 'challenge.complete_sum.ready',
        thinkingKey: 'challenge.complete_sum.thinking',
        youKey: 'challenge.complete_sum.you',
        footerKey: 'challenge.complete_sum.footer',
      };
    case 'social.pass_the_pulse':
      return {
        categoryKey: 'challenge.category.social',
        titleKey: 'challenge.pass_the_pulse.intro',
        promptKey: 'challenge.pass_the_pulse.prompt',
        actionKey: 'challenge.pass_the_pulse.action',
        youKey: 'challenge.pass_the_pulse.you',
        timeRemainingKey: 'challenge.pass_the_pulse.time_remaining',
        turnAnnounceKey: 'challenge.pass_the_pulse.turn_announce',
        a11yTapReadyKey: 'challenge.pass_the_pulse.a11y_tap_ready',
        a11yTapWaitKey: 'challenge.pass_the_pulse.a11y_tap_wait',
        pulseSfxAssetId: 'sfx.pulse',
      };
    case 'precision.ring_lock':
      return {
        categoryKey: 'challenge.category.precision',
        titleKey: 'challenge.ring_lock.intro',
        promptKey: 'challenge.ring_lock.prompt',
        actionKey: 'challenge.ring_lock.action',
        timeRemainingKey: 'challenge.ring_lock.time_remaining',
        ring1Key: 'challenge.ring_lock.ring_1',
        ring2Key: 'challenge.ring_lock.ring_2',
        ring3Key: 'challenge.ring_lock.ring_3',
        statusLockedKey: 'challenge.ring_lock.locked',
        statusRotatingKey: 'challenge.ring_lock.rotating',
        statusFailedKey: 'challenge.ring_lock.failed',
        a11yLockButtonKey: 'challenge.ring_lock.a11y_lock',
      };
    default:
      return {};
  }
}

export function defaultServerConfig(
  engineId: LaunchEngineId,
): Record<string, unknown> {
  switch (engineId) {
    case 'reaction.wait_for_signal':
      return { signalDelayMs: 1500, signalWindowMs: 1500 };
    case 'trap.no_touch':
      return {};
    case 'gesture.reverse_swipe':
      return {
        requiredDirection: 'down' as SwipeDirection,
        minDistancePx: 100,
        maxDurationMs: 3000,
      };
    case 'tap.precision':
      return { targetIds: ['t1'], attemptCount: 1 };
    case 'memory.sequence':
      return {
        sequence: ['opt.a', 'opt.b', 'opt.c'],
        previewMs: 2000,
        optionKeys: ['opt.a', 'opt.b', 'opt.c'],
      };
    case 'hold.multitouch':
      return { requiredContacts: 2, holdMs: 3000, resetOnLift: true };
    case 'motion.shake':
      return { requiredShakeCount: 5, noiseThreshold: 5 };
    case 'motion.tilt_balance':
      return { targetX: 0, targetY: 0, holdMs: 2000, varianceTolerance: 0.15 };
    case 'audio.cue':
      return { pulseCount: 3 };
    case 'social.pair_sync':
      return {
        partnerRoleKeys: ['role.leader', 'role.follower'],
        togetherMs: 5000,
        syncWindowMs: 2000,
      };
    case 'tactical.risk_choice':
      return {
        optionKeys: ['option.safe', 'option.risky'],
        riskWeights: [30, 70],
      };
    case 'trivia.multiple_choice':
      return {
        questions: serializeTriviaQuestions(defaultTriviaQuestions()),
      };
    case 'audio.multiple_choice':
      return {
        maxAudioDurationMs: AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
        questions: serializeAudioQuestions(defaultAudioQuestions()),
      };
    case 'geography.select_on_map':
      return {
        maps: [
          {
            mapId: 'map.levant',
            assetId: 'map.levant',
            imageWidth: 1233,
            imageHeight: 1276,
            regions: [
              {
                regionId: 'jordan',
                labelKey: 'geo.country.jordan',
                polygon: [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                  { x: 1, y: 1 },
                ],
              },
            ],
          },
        ],
        questions: [
          {
            mapId: 'map.levant',
            targetRegionId: 'jordan',
            targetLabelKey: 'geo.country.jordan',
          },
        ],
      };
    case 'focus.odd_one_out':
      return {
        columns: 4,
        glyphKeys: [
          'pulse.a',
          'pulse.a',
          'pulse.a',
          'pulse.b',
          'pulse.a',
          'pulse.a',
          'pulse.a',
          'pulse.a',
        ],
        oddIndex: 3,
      };
    case 'order.sequence_sort':
      return {
        itemKeys: ['num.4', 'num.9', 'num.2', 'num.7'],
        correctOrder: ['num.2', 'num.4', 'num.7', 'num.9'],
        ascending: true,
      };
    case 'precision.maze_path':
      return {
        cols: 5,
        rows: 5,
        cells: [
          1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0,
          1, 1,
        ],
        startIndex: 0,
        goalIndex: 24,
      };
    case 'precision.neon_cable':
      return {
        assetIds: {
          panel: 'neon_cable.panel_background',
          socketHousing: 'neon_cable.socket_housing',
          socketRingCyan: 'neon_cable.socket_ring_cyan',
          socketRingRed: 'neon_cable.socket_ring_red',
          socketGlowCyan: 'neon_cable.socket_glow_cyan',
          socketGlowRed: 'neon_cable.socket_glow_red',
          plugBody: 'neon_cable.plug_body',
          plugGlow: 'neon_cable.plug_glow_cyan',
          plugShadow: 'neon_cable.plug_shadow',
          snapSparksCyan: 'neon_cable.snap_sparks_cyan',
          snapSparksRed: 'neon_cable.snap_sparks_red',
          sparkRive: 'neon_cable.cable_spark',
          sparkSfx: 'neon_cable.spark',
          composition: 'neon_cable.composition',
        },
        sockets: [
          { socketId: 'socket.cyan', color: 'cyan', xNorm: 0.78, yNorm: 0.34 },
          { socketId: 'socket.red', color: 'red', xNorm: 0.78, yNorm: 0.66 },
        ],
        plugStartXNorm: 0.28,
        plugStartYNorm: 0.5,
        cableAnchorXNorm: 0.08,
        cableAnchorYNorm: 0.5,
        plugCableAnchorNorm: [0.105, 0.5],
        plugTipAnchorNorm: [0.895, 0.5],
        socketTargetAnchorNorm: [0.5, 0.5],
        snapRadiusNorm: 0.09,
        wrongDropPolicy: 'fail_final',
        correctSocketId: 'socket.cyan',
        plugColor: 'cyan',
      };
    case 'gesture.fog_wipe': {
      const reveal = DEFAULT_FOG_WIPE_REVEAL_VARIANTS[0]!;
      return {
        assetIds: defaultFogWipeAssetIds(reveal),
        revealContentVariants: [...DEFAULT_FOG_WIPE_REVEAL_VARIANTS],
        brushDiameterNorm: 0.12,
        brushFeatherNorm: 0.28,
        clearanceRatioMin: 0.55,
      };
    }
    case 'precision.circuit_rotation':
      return {
        ...defaultCircuitRotationSharedConfig(),
        requireAllConfiguredTilesPowered: true,
      };
    case 'precision.cable_untangle':
      return {
        ...defaultCableUntangleSharedConfig(),
      };
    case 'logic.balance_scale':
      return {
        leftWeights: [1, 2],
        rightKnownWeights: [1],
        optionWeights: [1, 2, 3],
        correctWeight: 2,
      };
    case 'focus.stroop':
      return {
        wordKey: 'color.red',
        inkColorId: 'cyan',
        optionKeys: ['cyan', 'red', 'yellow'],
        correctOptionKey: 'cyan',
        variants: [
          {
            wordKey: 'color.red',
            inkColorId: 'cyan',
            optionKeys: ['cyan', 'red', 'yellow'],
            correctOptionKey: 'cyan',
          },
          {
            wordKey: 'color.blue',
            inkColorId: 'yellow',
            optionKeys: ['cyan', 'red', 'yellow'],
            correctOptionKey: 'yellow',
          },
        ],
      };
    case 'search.select_occurrences':
      return {
        columns: 4,
        cells: [
          '3',
          '8',
          '0',
          '5',
          '2',
          '9',
          '6',
          '8',
          '0',
          '5',
          '8',
          '2',
          '9',
          '3',
          '6',
          '0',
        ],
        targetValue: '8',
        requiredIndices: [1, 7, 10],
      };
    case 'logic.complete_sum':
      return {
        maxGenerationAttempts: 48,
        generationRules: {
          '2': { minValue: 0, maxValue: 8, choicesPerPlayer: 4 },
          '3': { minValue: 0, maxValue: 6, choicesPerPlayer: 4 },
          '4': { minValue: 0, maxValue: 5, choicesPerPlayer: 4 },
          '5': { minValue: 0, maxValue: 4, choicesPerPlayer: 4 },
          '6': { minValue: 0, maxValue: 3, choicesPerPlayer: 4 },
        },
      };
    case 'social.pass_the_pulse':
      return {
        minPlayers: 2,
        maxPlayers: 6,
        startDelayMs: 800,
        segmentDurationMs: 1800,
        hitWindowEarlyMs: 280,
        hitWindowLateMs: 320,
        resultTransitionMs: 900,
      };
    case 'precision.ring_lock':
      return {
        ringCount: 3,
        startDelayMs: 700,
        minAngularVelocityDegPerSec: 45,
        maxAngularVelocityDegPerSec: 90,
        allowClockwise: true,
        allowCounterClockwise: true,
        targetAngleDeg: 0,
        alignmentToleranceDeg: 24,
        transitionDelayMs: 180,
        safetyMarginMs: 600,
        maxGenerationAttempts: 48,
        difficulty: 'medium',
      };
    default:
      return {};
  }
}

type FamilyParamsFieldsProps = {
  locale: Locale;
  engineId: LaunchEngineId;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
  onClientChange: (config: Record<string, unknown>) => void;
  onServerChange: (config: Record<string, unknown>) => void;
  requiredAssetIds?: string[];
  onRequiredAssetIdsChange?: (ids: string[]) => void;
  disabled?: boolean;
};

function L(locale: Locale, key: string): string {
  return t(locale, key as MessageKey);
}

function lbl(locale: Locale, key: string): string {
  return t(locale, `studio.field.${key}` as MessageKey);
}

function CopyKeysBlock({
  locale,
  clientConfig,
  onClientChange,
  disabled,
  keys,
}: {
  locale: Locale;
  clientConfig: Record<string, unknown>;
  onClientChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
  keys: { field: string; labelKey: string }[];
}) {
  return (
    <CollapsibleGroup
      title={lbl(locale, 'fp.copyKeysGroup')}
      defaultOpen={false}
    >
      <FieldGroup>
        <CatalogKeyField
          id="fp-categoryKey"
          label={lbl(locale, 'fp.categoryKey')}
          hint={lbl(locale, 'fp.categoryKeyHint')}
          value={(clientConfig.categoryKey as string) ?? ''}
          onChange={(v) => onClientChange({ ...clientConfig, categoryKey: v })}
          options={CATEGORY_KEY_OPTIONS}
          localize={(k) => L(locale, k)}
          disabled={disabled}
        />
        {keys.map(({ field, labelKey }) => (
          <CatalogKeyField
            key={field}
            id={`fp-${field}`}
            label={lbl(locale, labelKey)}
            value={(clientConfig[field] as string) ?? ''}
            onChange={(v) => onClientChange({ ...clientConfig, [field]: v })}
            options={PROMPT_KEY_OPTIONS}
            localize={(k) => L(locale, k)}
            disabled={disabled}
          />
        ))}
      </FieldGroup>
    </CollapsibleGroup>
  );
}

function ReactionWaitForSignalFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const sc = serverConfig as Record<string, number>;
  const delay = sc.signalDelayMs ?? 1500;
  const windowMs = sc.signalWindowMs ?? 1500;
  const activeFeel =
    SIGNAL_FEEL_PRESETS.find(
      (p) => p.signalDelayMs === delay && p.signalWindowMs === windowMs,
    )?.id ?? null;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.waitLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.signalFeel')}
        hint={lbl(locale, 'fp.signalFeelHint')}
        value={activeFeel ?? 'custom'}
        options={[
          ...SIGNAL_FEEL_PRESETS.map((p) => ({
            value: p.id,
            label: L(locale, p.labelKey),
          })),
          { value: 'custom', label: L(locale, 'studio.field.customValue') },
        ]}
        onChange={(id) => {
          const preset = SIGNAL_FEEL_PRESETS.find((p) => p.id === id);
          if (preset) {
            onServerChange({
              ...serverConfig,
              signalDelayMs: preset.signalDelayMs,
              signalWindowMs: preset.signalWindowMs,
            });
          }
        }}
        disabled={disabled}
      />
      <FieldGroup horizontal>
        <DurationSecondsField
          id="fp-signalDelayMs"
          label={lbl(locale, 'fp.signalDelayMs')}
          hint={lbl(locale, 'fp.signalDelayHint')}
          valueMs={delay}
          onChangeMs={(ms) =>
            onServerChange({ ...serverConfig, signalDelayMs: ms })
          }
          minSec={0}
          maxSec={8}
          disabled={disabled}
        />
        <DurationSecondsField
          id="fp-signalWindowMs"
          label={lbl(locale, 'fp.signalWindowMs')}
          hint={lbl(locale, 'fp.signalWindowHint')}
          valueMs={windowMs}
          onChangeMs={(ms) =>
            onServerChange({ ...serverConfig, signalWindowMs: Math.max(1, ms) })
          }
          minSec={0.1}
          maxSec={5}
          disabled={disabled}
        />
      </FieldGroup>
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'waitingPromptKey', labelKey: 'fp.waitingPromptKey' },
          { field: 'waitingHintKey', labelKey: 'fp.waitingHintKey' },
          { field: 'activePromptKey', labelKey: 'fp.activePromptKey' },
          { field: 'actionKey', labelKey: 'fp.actionKey' },
        ]}
      />
    </>
  );
}

function TrapNoTouchFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const zone = (clientConfig.zone as {
    x: number;
    y: number;
    width: number;
    height: number;
  }) ?? {
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.8,
  };
  const sc = serverConfig as Record<string, unknown>;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.noTouchLead')}</p>
      <div className="studio-preset-chips">
        {ZONE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="studio-preset-chip"
            disabled={disabled}
            onClick={() => onClientChange({ ...clientConfig, zone: p.zone })}
          >
            {L(locale, p.labelKey)}
          </button>
        ))}
      </div>
      <ZonePad
        label={lbl(locale, 'fp.forbiddenZone')}
        hint={lbl(locale, 'fp.forbiddenZoneHint')}
        zone={zone}
        onChange={(next) => onClientChange({ ...clientConfig, zone: next })}
        disabled={disabled}
      />
      <FieldCheckboxGroup
        label={lbl(locale, 'fp.allowSystemGestures')}
        options={[
          { value: 'true', label: lbl(locale, 'fp.allowSystemGesturesLabel') },
        ]}
        selected={sc.allowSystemGestures === true ? ['true'] : []}
        onChange={(sel) => {
          if (sel.includes('true'))
            onServerChange({ allowSystemGestures: true });
          else onServerChange({});
        }}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'zoneHintKey', labelKey: 'fp.zoneHintKey' },
        ]}
      />
    </>
  );
}

function GestureReverseSwipeFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const displayedDirection =
    (clientConfig.displayedDirection as SwipeDirection) ?? 'up';
  const minDistancePx = (clientConfig.minDistancePx as number) ?? 100;
  const maxDurationMs = (serverConfig.maxDurationMs as number) ?? 3000;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.swipeLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.displayedDirection')}
        hint={lbl(locale, 'fp.displayedDirectionHint')}
        value={displayedDirection}
        options={[
          { value: 'up', label: lbl(locale, 'fp.direction.up') },
          { value: 'down', label: lbl(locale, 'fp.direction.down') },
          { value: 'left', label: lbl(locale, 'fp.direction.left') },
          { value: 'right', label: lbl(locale, 'fp.direction.right') },
        ]}
        onChange={(dir) => {
          const d = dir as SwipeDirection;
          onClientChange({ ...clientConfig, displayedDirection: d });
          onServerChange({
            ...serverConfig,
            requiredDirection: oppositeSwipeDirection(d),
          });
        }}
        disabled={disabled}
      />
      <p className="studio-inline-hint">
        {lbl(locale, 'fp.requiredDirection')}:{' '}
        <strong>
          {lbl(
            locale,
            `fp.direction.${oppositeSwipeDirection(displayedDirection)}`,
          )}
        </strong>
      </p>
      <div>
        <span className="studio-sublabel">
          {lbl(locale, 'fp.minDistancePx')}
        </span>
        <PresetChips
          presets={SWIPE_DISTANCE_PRESETS.map((p) => ({
            value: p.px,
            label: L(locale, p.labelKey),
          }))}
          activeValue={minDistancePx}
          onSelect={(v) => {
            const px = Number(v);
            onClientChange({ ...clientConfig, minDistancePx: px });
            onServerChange({ ...serverConfig, minDistancePx: px });
          }}
          disabled={disabled}
        />
      </div>
      <DurationSecondsField
        id="fp-rs-maxDurationMs"
        label={lbl(locale, 'fp.maxDurationMs')}
        hint={lbl(locale, 'fp.maxDurationHint')}
        valueMs={maxDurationMs}
        onChangeMs={(ms) =>
          onServerChange({ ...serverConfig, maxDurationMs: ms })
        }
        minSec={0.5}
        maxSec={8}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

type TapTarget = { id: string; x: number; y: number };

function TapPrecisionFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const targets = (clientConfig.targets as TapTarget[]) ?? [
    { id: 't1', x: 0.5, y: 0.5 },
  ];
  const attemptCount = (clientConfig.attemptCount as number) ?? 1;

  function sync(newTargets: TapTarget[], attempts: number) {
    onClientChange({
      ...clientConfig,
      targets: newTargets,
      attemptCount: attempts,
    });
    onServerChange({
      targetIds: newTargets.map((t) => t.id),
      attemptCount: attempts,
    });
  }

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.precisionLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.attemptCount')}
        hint={lbl(locale, 'fp.attemptCountHint')}
        value={String(attemptCount)}
        options={[1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(v) => sync(targets, Number(v))}
        disabled={disabled}
      />
      <TargetPad
        label={lbl(locale, 'fp.targets')}
        hint={lbl(locale, 'fp.targetsHint')}
        targets={targets}
        onChange={(next) => sync(next, attemptCount)}
        disabled={disabled}
        addLabel={lbl(locale, 'fp.addTarget')}
        removeLabel={lbl(locale, 'fp.removeTarget')}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function MemorySequenceFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const optionKeys = (clientConfig.optionKeys as string[]) ?? [];
  const sequence = (serverConfig.sequence as string[]) ?? [];

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.memoryLead')}</p>
      <p className="studio-inline-hint">{lbl(locale, 'fp.memoryTimingNote')}</p>
      <OrderedChipEditor
        label={lbl(locale, 'fp.optionKeys')}
        hint={lbl(locale, 'fp.optionKeysHint')}
        values={optionKeys}
        options={MEMORY_OPTION_PRESETS}
        onChange={(keys) => {
          onClientChange({ ...clientConfig, optionKeys: keys });
          onServerChange({ ...serverConfig, optionKeys: keys });
        }}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <OrderedChipEditor
        label={lbl(locale, 'fp.sequence')}
        hint={lbl(locale, 'fp.sequenceHint')}
        values={sequence}
        options={MEMORY_OPTION_PRESETS}
        onChange={(seq) => onServerChange({ ...serverConfig, sequence: seq })}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function HoldMultitouchFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const holdMs = (clientConfig.holdMs as number) ?? 3000;
  const sc = serverConfig as Record<string, unknown>;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.holdLead')}</p>
      <DurationSecondsField
        id="fp-hm-holdMs"
        label={lbl(locale, 'fp.holdMs')}
        hint={lbl(locale, 'fp.holdMsHint')}
        valueMs={holdMs}
        onChangeMs={(ms) => {
          onClientChange({ ...clientConfig, holdMs: ms, requiredContacts: 2 });
          onServerChange({ ...serverConfig, holdMs: ms, requiredContacts: 2 });
        }}
        minSec={1}
        maxSec={8}
        presets={[
          { ms: 2000, label: L(locale, 'studio.preset.hold.short') },
          { ms: 3000, label: L(locale, 'studio.preset.hold.standard') },
          { ms: 4500, label: L(locale, 'studio.preset.hold.long') },
        ]}
        disabled={disabled}
      />
      <FieldCheckboxGroup
        label={lbl(locale, 'fp.resetOnLift')}
        options={[{ value: 'true', label: lbl(locale, 'fp.resetOnLiftLabel') }]}
        selected={sc.resetOnLift === true ? ['true'] : []}
        onChange={(sel) =>
          onServerChange({ ...serverConfig, resetOnLift: sel.includes('true') })
        }
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function MotionShakeFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const count = (serverConfig.requiredShakeCount as number) ?? 5;
  const noise = (serverConfig.noiseThreshold as number) ?? 5;
  const active =
    SHAKE_SENSITIVITY_PRESETS.find(
      (p) => p.requiredShakeCount === count && p.noiseThreshold === noise,
    )?.id ?? 'custom';

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.shakeLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.shakeDifficulty')}
        hint={lbl(locale, 'fp.shakeDifficultyHint')}
        value={active}
        options={[
          ...SHAKE_SENSITIVITY_PRESETS.map((p) => ({
            value: p.id,
            label: L(locale, p.labelKey),
          })),
          { value: 'custom', label: L(locale, 'studio.field.customValue') },
        ]}
        onChange={(id) => {
          const preset = SHAKE_SENSITIVITY_PRESETS.find((p) => p.id === id);
          if (preset) {
            onServerChange({
              ...serverConfig,
              requiredShakeCount: preset.requiredShakeCount,
              noiseThreshold: preset.noiseThreshold,
            });
          }
        }}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'progressKey', labelKey: 'fp.progressKey' },
        ]}
      />
    </>
  );
}

function MotionTiltBalanceFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const holdMs = (serverConfig.holdMs as number) ?? 2000;
  const tolerance = (serverConfig.varianceTolerance as number) ?? 0.15;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.tiltLead')}</p>
      <DurationSecondsField
        id="fp-tb-holdMs"
        label={lbl(locale, 'fp.holdMs')}
        hint={lbl(locale, 'fp.tiltHoldHint')}
        valueMs={holdMs}
        onChangeMs={(ms) => onServerChange({ ...serverConfig, holdMs: ms })}
        minSec={0.5}
        maxSec={8}
        disabled={disabled}
      />
      <FractionPercentField
        id="fp-tb-tolerance"
        label={lbl(locale, 'fp.varianceTolerance')}
        hint={lbl(locale, 'fp.varianceToleranceHint')}
        value={tolerance}
        onChange={(v) =>
          onServerChange({ ...serverConfig, varianceTolerance: v })
        }
        disabled={disabled}
      />
      <SegmentedChoice
        label={lbl(locale, 'fp.tiltTarget')}
        hint={lbl(locale, 'fp.tiltTargetHint')}
        value={
          (serverConfig.targetX as number) === 0 &&
          (serverConfig.targetY as number) === 0
            ? 'center'
            : 'custom'
        }
        options={[
          { value: 'center', label: L(locale, 'studio.preset.tilt.center') },
          { value: 'custom', label: L(locale, 'studio.field.customValue') },
        ]}
        onChange={(v) => {
          if (v === 'center')
            onServerChange({ ...serverConfig, targetX: 0, targetY: 0 });
        }}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function AudioCueFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const pulseCount = (serverConfig.pulseCount as number) ?? 3;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.audioLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.pulseCount')}
        hint={lbl(locale, 'fp.pulseCountHint')}
        value={String(pulseCount)}
        options={[1, 2, 3, 4, 5].map((n) => ({
          value: String(n),
          label: String(n),
        }))}
        onChange={(v) =>
          onServerChange({ ...serverConfig, pulseCount: Number(v) })
        }
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'visualFallbackKey', labelKey: 'fp.visualFallbackKey' },
          { field: 'hapticFallbackKey', labelKey: 'fp.hapticFallbackKey' },
        ]}
      />
    </>
  );
}

function SocialPairSyncFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const partnerRoleKeys = (clientConfig.partnerRoleKeys as string[]) ?? [];
  const togetherMs = (serverConfig.togetherMs as number) ?? 5000;
  const syncWindowMs = (serverConfig.syncWindowMs as number) ?? 2000;

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.pairLead')}</p>
      <OrderedChipEditor
        label={lbl(locale, 'fp.partnerRoleKeys')}
        hint={lbl(locale, 'fp.partnerRoleKeysHint')}
        values={partnerRoleKeys}
        options={PAIR_ROLE_PRESETS}
        onChange={(keys) => {
          onClientChange({ ...clientConfig, partnerRoleKeys: keys });
          onServerChange({ ...serverConfig, partnerRoleKeys: keys });
        }}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <DurationSecondsField
        id="fp-ps-togetherMs"
        label={lbl(locale, 'fp.togetherMs')}
        hint={lbl(locale, 'fp.togetherMsHint')}
        valueMs={togetherMs}
        onChangeMs={(ms) => onServerChange({ ...serverConfig, togetherMs: ms })}
        minSec={1}
        maxSec={15}
        disabled={disabled}
      />
      <DurationSecondsField
        id="fp-ps-syncWindowMs"
        label={lbl(locale, 'fp.syncWindowMs')}
        hint={lbl(locale, 'fp.syncWindowHint')}
        valueMs={syncWindowMs}
        onChangeMs={(ms) =>
          onServerChange({ ...serverConfig, syncWindowMs: ms })
        }
        minSec={0.5}
        maxSec={8}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function TacticalRiskChoiceFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const optionKeys = (clientConfig.optionKeys as string[]) ?? [];
  const riskWeights = (serverConfig.riskWeights as number[]) ?? [];

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.riskLead')}</p>
      <OrderedChipEditor
        label={lbl(locale, 'fp.optionKeys')}
        hint={lbl(locale, 'fp.riskOptionsHint')}
        values={optionKeys}
        options={RISK_OPTION_PRESETS}
        onChange={(keys) => {
          onClientChange({ ...clientConfig, optionKeys: keys });
          const newWeights = keys.map(
            (_, i) => riskWeights[i] ?? (i === 0 ? 30 : 70),
          );
          onServerChange({
            ...serverConfig,
            optionKeys: keys,
            riskWeights: newWeights,
          });
        }}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <div className="studio-risk-weights">
        {optionKeys.map((key, idx) => {
          const opt = RISK_OPTION_PRESETS.find((o) => o.value === key);
          const weight = riskWeights[idx] ?? 50;
          return (
            <div key={key} className="studio-slider-block">
              <span className="studio-sublabel">
                {opt ? L(locale, opt.labelKey) : key}
              </span>
              <div className="studio-slider-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={weight}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = [...riskWeights];
                    next[idx] = Number(e.currentTarget.value);
                    onServerChange({ ...serverConfig, riskWeights: next });
                  }}
                />
                <span className="studio-unit">{weight}</span>
              </div>
            </div>
          );
        })}
      </div>
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[{ field: 'promptKey', labelKey: 'fp.promptKey' }]}
      />
    </>
  );
}

function GestureFogWipeFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    requiredAssetIds,
    onRequiredAssetIdsChange,
    disabled,
  } = props;

  const variants = (serverConfig.revealContentVariants as
    | string[]
    | undefined) ?? [...DEFAULT_FOG_WIPE_REVEAL_VARIANTS];
  const brushDiameterNorm = (clientConfig.brushDiameterNorm as number) ?? 0.12;
  const brushFeatherNorm = (clientConfig.brushFeatherNorm as number) ?? 0.28;
  const clearanceRatioMin = (clientConfig.clearanceRatioMin as number) ?? 0.55;

  const [customVariant, setCustomVariant] = useState('');
  const [uploadAssetId, setUploadAssetId] = useState('fog_wipe.reveal.custom');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function syncRevealVariants(nextVariants: string[]) {
    const reveal = nextVariants[0] ?? DEFAULT_FOG_WIPE_REVEAL_VARIANTS[0]!;
    const clientAssets = {
      ...defaultFogWipeAssetIds(reveal),
      ...((clientConfig.assetIds as Record<string, string> | undefined) ?? {}),
      revealContent: reveal,
    };
    const serverAssets = {
      ...defaultFogWipeAssetIds(reveal),
      ...((serverConfig.assetIds as Record<string, string> | undefined) ?? {}),
      revealContent: reveal,
    };
    onClientChange({
      ...clientConfig,
      assetIds: clientAssets,
      brushDiameterNorm,
      brushFeatherNorm,
      clearanceRatioMin,
    });
    onServerChange({
      ...serverConfig,
      assetIds: serverAssets,
      revealContentVariants: nextVariants,
      brushDiameterNorm,
      brushFeatherNorm,
      clearanceRatioMin,
    });
    if (onRequiredAssetIdsChange) {
      onRequiredAssetIdsChange(
        mergeFogWipeRequiredAssets(
          requiredAssetIds ?? [],
          nextVariants,
          reveal,
        ),
      );
    }
  }

  function syncBrush(partial: {
    brushDiameterNorm?: number;
    brushFeatherNorm?: number;
    clearanceRatioMin?: number;
  }) {
    const nextClient = { ...clientConfig, ...partial };
    const nextServer = { ...serverConfig, ...partial };
    onClientChange(nextClient);
    onServerChange(nextServer);
  }

  async function handleUpload(file: File | null) {
    if (!file || disabled) return;
    const assetId = uploadAssetId.trim();
    if (!assetId) {
      setUploadError(lbl(locale, 'fp.fogUploadAssetIdRequired'));
      return;
    }
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('assetId', assetId);
    const result = await adminApiFetch<{
      packVersion: number;
      asset: { assetId: string };
    }>(`/content/pack/assets?assetId=${encodeURIComponent(assetId)}`, {
      method: 'POST',
      body: form,
    });
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error.message);
      return;
    }
    const registeredId = result.data.asset.assetId;
    const nextVariants = variants.includes(registeredId)
      ? variants
      : [...variants, registeredId];
    syncRevealVariants(nextVariants);
  }

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.fogWipeLead')}</p>
      <OrderedChipEditor
        label={lbl(locale, 'fp.revealContentVariants')}
        hint={lbl(locale, 'fp.revealContentVariantsHint')}
        values={variants}
        options={FOG_WIPE_REVEAL_VARIANT_OPTIONS}
        onChange={syncRevealVariants}
        localize={(k) => L(locale, k)}
        disabled={disabled}
      />
      <FieldGroup horizontal>
        <FieldInput
          id="fp-fog-custom-variant"
          label={lbl(locale, 'fp.revealVariantCustom')}
          value={customVariant}
          disabled={disabled}
          placeholder="fog_wipe.reveal.my_image"
          onChange={(e) => setCustomVariant(e.currentTarget.value)}
        />
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <label htmlFor="fp-fog-add-custom">&nbsp;</label>
          <button
            id="fp-fog-add-custom"
            type="button"
            className="btn btn-ghost"
            disabled={disabled || !customVariant.trim()}
            onClick={() => {
              const id = customVariant.trim();
              if (!id || variants.includes(id)) return;
              syncRevealVariants([...variants, id]);
              setCustomVariant('');
            }}
          >
            {lbl(locale, 'fp.revealVariantAdd')}
          </button>
        </div>
      </FieldGroup>

      <FieldGroup horizontal>
        <FractionPercentField
          id="fp-fog-brush"
          label={lbl(locale, 'fp.brushDiameterNorm')}
          hint={lbl(locale, 'fp.brushDiameterHint')}
          value={brushDiameterNorm}
          min={4}
          max={30}
          onChange={(v) =>
            syncBrush({ brushDiameterNorm: Math.min(0.3, Math.max(0.04, v)) })
          }
          disabled={disabled}
        />
        <FractionPercentField
          id="fp-fog-feather"
          label={lbl(locale, 'fp.brushFeatherNorm')}
          hint={lbl(locale, 'fp.brushFeatherHint')}
          value={brushFeatherNorm}
          min={10}
          max={60}
          onChange={(v) =>
            syncBrush({ brushFeatherNorm: Math.min(0.6, Math.max(0.1, v)) })
          }
          disabled={disabled}
        />
        <FractionPercentField
          id="fp-fog-clearance"
          label={lbl(locale, 'fp.clearanceRatioMin')}
          hint={lbl(locale, 'fp.clearanceRatioHint')}
          value={clearanceRatioMin}
          min={20}
          max={95}
          onChange={(v) =>
            syncBrush({ clearanceRatioMin: Math.min(0.95, Math.max(0.2, v)) })
          }
          disabled={disabled}
        />
      </FieldGroup>

      <CollapsibleGroup title={lbl(locale, 'fp.fogUploadGroup')} defaultOpen>
        <FieldGroup>
          <FieldInput
            id="fp-fog-upload-asset-id"
            label={lbl(locale, 'fp.fogUploadAssetId')}
            hint={lbl(locale, 'fp.fogUploadAssetIdHint')}
            value={uploadAssetId}
            disabled={disabled || uploading}
            onChange={(e) => setUploadAssetId(e.currentTarget.value)}
          />
          <div className="field">
            <label htmlFor="fp-fog-upload-file">
              {lbl(locale, 'fp.fogUploadFile')}
            </label>
            <input
              id="fp-fog-upload-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              disabled={disabled || uploading}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0] ?? null;
                void handleUpload(file);
                e.currentTarget.value = '';
              }}
            />
            <span
              className="field-hint"
              style={{ color: 'var(--lh-text-muted)', fontSize: '0.8rem' }}
            >
              {uploading
                ? lbl(locale, 'fp.fogUploading')
                : lbl(locale, 'fp.fogUploadHint')}
            </span>
            {uploadError ? (
              <span className="field-error">{uploadError}</span>
            ) : null}
          </div>
        </FieldGroup>
      </CollapsibleGroup>

      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

type GeoStudioRegion = { regionId: string; labelKey: string };
type GeoStudioMap = { mapId: string; regions: GeoStudioRegion[] };
type GeoStudioQuestion = {
  mapId: string;
  targetRegionId: string;
  targetLabelKey?: string;
};

const GEO_MAP_LABELS: Record<string, MessageKey> = {
  'map.africa': 'studio.geo.map.africa',
  'map.gcc': 'studio.geo.map.gcc',
  'map.gcc_mena': 'studio.geo.map.gcc_mena',
  'map.levant': 'studio.geo.map.levant',
};

const GEO_COUNTRY_LABELS: Record<string, MessageKey> = {
  mauritania: 'studio.geo.country.mauritania',
  algeria: 'studio.geo.country.algeria',
  morocco: 'studio.geo.country.morocco',
  tunisia: 'studio.geo.country.tunisia',
  libya: 'studio.geo.country.libya',
  egypt: 'studio.geo.country.egypt',
  sudan: 'studio.geo.country.sudan',
  saudi_arabia: 'studio.geo.country.saudi_arabia',
  kuwait: 'studio.geo.country.kuwait',
  bahrain: 'studio.geo.country.bahrain',
  qatar: 'studio.geo.country.qatar',
  uae: 'studio.geo.country.uae',
  oman: 'studio.geo.country.oman',
  yemen: 'studio.geo.country.yemen',
  jordan: 'studio.geo.country.jordan',
  syria: 'studio.geo.country.syria',
  lebanon: 'studio.geo.country.lebanon',
  palestine: 'studio.geo.country.palestine',
};

function geoMapLabel(locale: Locale, mapId: string): string {
  const key = GEO_MAP_LABELS[mapId];
  return key ? t(locale, key) : mapId;
}

function geoCountryLabel(
  locale: Locale,
  regionId: string,
  labelKey?: string,
): string {
  const slug =
    regionId ||
    (labelKey?.startsWith('geo.country.') ? labelKey.slice(12) : '');
  const key = GEO_COUNTRY_LABELS[slug];
  return key ? t(locale, key) : slug.replace(/_/g, ' ') || regionId;
}

function parseGeoMaps(serverConfig: Record<string, unknown>): GeoStudioMap[] {
  const raw = serverConfig.maps;
  if (!Array.isArray(raw)) return [];
  const maps: GeoStudioMap[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const mapId = (item as { mapId?: unknown }).mapId;
    const regionsRaw = (item as { regions?: unknown }).regions;
    if (
      typeof mapId !== 'string' ||
      mapId.length === 0 ||
      !Array.isArray(regionsRaw)
    ) {
      continue;
    }
    const regions: GeoStudioRegion[] = [];
    for (const region of regionsRaw) {
      if (!region || typeof region !== 'object') continue;
      const regionId = (region as { regionId?: unknown }).regionId;
      const labelKey = (region as { labelKey?: unknown }).labelKey;
      if (typeof regionId !== 'string' || typeof labelKey !== 'string')
        continue;
      regions.push({ regionId, labelKey });
    }
    if (regions.length > 0) {
      maps.push({ mapId, regions });
    }
  }
  return maps;
}

function parseStoredGeoQuestions(
  serverConfig: Record<string, unknown>,
): GeoStudioQuestion[] {
  const raw = serverConfig.questions;
  if (!Array.isArray(raw)) return [];
  const out: GeoStudioQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const mapId = (item as { mapId?: unknown }).mapId;
    const targetRegionId = (item as { targetRegionId?: unknown })
      .targetRegionId;
    if (typeof mapId !== 'string' || typeof targetRegionId !== 'string')
      continue;
    const targetLabelKey = (item as { targetLabelKey?: unknown })
      .targetLabelKey;
    out.push({
      mapId,
      targetRegionId,
      targetLabelKey:
        typeof targetLabelKey === 'string' ? targetLabelKey : undefined,
    });
  }
  return out;
}

function deriveGeoQuestions(maps: GeoStudioMap[]): GeoStudioQuestion[] {
  return maps.flatMap((map) =>
    map.regions.map((region) => ({
      mapId: map.mapId,
      targetRegionId: region.regionId,
      targetLabelKey: region.labelKey,
    })),
  );
}

function serializeGeoQuestion(
  question: GeoStudioQuestion,
  maps: GeoStudioMap[],
): GeoStudioQuestion {
  const region = maps
    .find((m) => m.mapId === question.mapId)
    ?.regions.find((r) => r.regionId === question.targetRegionId);
  return {
    mapId: question.mapId,
    targetRegionId: question.targetRegionId,
    targetLabelKey: region?.labelKey ?? question.targetLabelKey,
  };
}

function FocusStroopFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const variants = parseStroopVariants(serverConfig);

  function commit(next: StroopStudioVariant[]) {
    const normalized = next
      .map((v) => normalizeStroopVariant(v))
      .filter((v): v is StroopStudioVariant => v != null);
    const safe = normalized.length > 0 ? normalized : [createStroopVariant([])];
    const first = safe[0]!;
    const rest = { ...serverConfig };
    onServerChange({
      ...rest,
      wordKey: first.wordKey,
      inkColorId: first.inkColorId,
      optionKeys: first.optionKeys,
      correctOptionKey: first.correctOptionKey,
      variants: serializeStroopVariants(safe),
    });
    onClientChange(stroopClientPreview(first, clientConfig));
  }

  function updateVariant(
    index: number,
    patch: Partial<StroopStudioVariant>,
  ): void {
    const current = variants[index];
    if (!current) return;
    const next = [...variants];
    const merged = normalizeStroopVariant({ ...current, ...patch });
    if (!merged) return;
    // Keep correct answer aligned with ink when ink changes and still selectable.
    if (
      patch.inkColorId &&
      merged.optionKeys.includes(patch.inkColorId) &&
      patch.correctOptionKey == null
    ) {
      merged.correctOptionKey = patch.inkColorId;
    }
    next[index] = merged;
    commit(next);
  }

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.stroopLead')}</p>
      {variants.map((variant, index) => (
        <section
          key={`stroop-${index}-${variant.wordKey}-${variant.inkColorId}`}
          className="studio-trivia-question"
        >
          <div className="studio-geo-map-head">
            <h3 className="studio-geo-map-title">
              {lbl(locale, 'fp.stroopQuestionN').replace(
                '{n}',
                String(index + 1),
              )}
            </h3>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={disabled || variants.length <= 1}
              onClick={() => commit(variants.filter((_, i) => i !== index))}
            >
              {lbl(locale, 'fp.stroopRemoveQuestion')}
            </button>
          </div>
          <FieldGroup>
            <CatalogKeyField
              id={`fp-stroop-word-${index}`}
              label={lbl(locale, 'fp.stroopWordKey')}
              hint={lbl(locale, 'fp.stroopWordKeyHint')}
              value={variant.wordKey}
              onChange={(wordKey) => updateVariant(index, { wordKey })}
              options={STROOP_WORD_KEY_OPTIONS}
              localize={(k) => L(locale, k)}
              disabled={disabled}
            />
            <SegmentedChoice
              label={lbl(locale, 'fp.stroopInkColor')}
              hint={lbl(locale, 'fp.stroopInkColorHint')}
              value={variant.inkColorId}
              options={STROOP_INK_COLOR_OPTIONS.map((o) => ({
                value: o.value,
                label: L(locale, o.labelKey),
              }))}
              onChange={(inkColorId) => updateVariant(index, { inkColorId })}
              disabled={disabled}
            />
          </FieldGroup>
          <ChipMultiSelect
            label={lbl(locale, 'fp.stroopOptionKeys')}
            hint={lbl(locale, 'fp.stroopOptionKeysHint')}
            options={STROOP_INK_COLOR_OPTIONS}
            selected={variant.optionKeys}
            localize={(k) => L(locale, k)}
            disabled={disabled}
            onChange={(optionKeys) => {
              if (optionKeys.length < 2) return;
              updateVariant(index, { optionKeys });
            }}
          />
          <SegmentedChoice
            label={lbl(locale, 'fp.stroopCorrect')}
            value={variant.correctOptionKey}
            options={variant.optionKeys.map((key) => {
              const opt = STROOP_INK_COLOR_OPTIONS.find((o) => o.value === key);
              return {
                value: key,
                label: opt ? L(locale, opt.labelKey) : key,
              };
            })}
            onChange={(correctOptionKey) =>
              updateVariant(index, { correctOptionKey })
            }
            disabled={disabled}
          />
        </section>
      ))}
      {variants.length < 32 ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => commit([...variants, createStroopVariant(variants)])}
        >
          {lbl(locale, 'fp.stroopAddQuestion')}
        </button>
      ) : null}
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

function TriviaMultipleChoiceFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const parsedQuestions = useMemo(
    () => parseTriviaQuestions(serverConfig),
    [serverConfig],
  );
  const parsedSignature = triviaQuestionBankSignature(parsedQuestions);
  const [questions, setQuestions] = useState(parsedQuestions);
  const [syncedSignature, setSyncedSignature] = useState(parsedSignature);
  if (parsedSignature !== syncedSignature) {
    setSyncedSignature(parsedSignature);
    setQuestions(parsedQuestions);
  }

  function commit(next: TriviaStudioQuestion[]) {
    setQuestions(next);
    const serialized = serializeTriviaQuestions(next);
    const rest = { ...serverConfig };
    delete rest.questionKey;
    delete rest.optionKeys;
    delete rest.correctOptionKey;
    onServerChange({ ...rest, questions: serialized });
    onClientChange(triviaClientPreview(next[0], clientConfig));
  }

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.triviaLead')}</p>
      {questions.map((question, index) => (
        <section key={question.questionKey} className="studio-trivia-question">
          <div className="studio-geo-map-head">
            <h3 className="studio-geo-map-title">
              {lbl(locale, 'fp.triviaQuestionN').replace(
                '{n}',
                String(index + 1),
              )}
            </h3>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={disabled || questions.length <= 1}
              onClick={() => commit(questions.filter((q) => q !== question))}
            >
              {lbl(locale, 'fp.triviaRemoveQuestion')}
            </button>
          </div>
          <FieldGroup>
            <FieldInput
              id={`fp-trivia-q-ar-${index}`}
              label={lbl(locale, 'fp.triviaQuestionAr')}
              value={question.questionAr}
              disabled={disabled}
              dir="rtl"
              onChange={(e) => {
                const next = [...questions];
                next[index] = {
                  ...question,
                  questionAr: readFieldInputValue(e),
                };
                commit(next);
              }}
            />
            <FieldInput
              id={`fp-trivia-q-en-${index}`}
              label={lbl(locale, 'fp.triviaQuestionEn')}
              value={question.questionEn}
              disabled={disabled}
              onChange={(e) => {
                const next = [...questions];
                next[index] = {
                  ...question,
                  questionEn: readFieldInputValue(e),
                };
                commit(next);
              }}
            />
          </FieldGroup>
          <fieldset className="studio-trivia-answers">
            <legend>{lbl(locale, 'fp.triviaAnswers')}</legend>
            {question.options.map((option, optionIndex) => (
              <div key={option.key} className="studio-trivia-option-row">
                <label className="studio-trivia-correct">
                  <input
                    type="radio"
                    name={`fp-trivia-correct-${index}`}
                    checked={question.correctOptionKey === option.key}
                    disabled={disabled}
                    onChange={() => {
                      const next = [...questions];
                      next[index] = {
                        ...question,
                        correctOptionKey: option.key,
                      };
                      commit(next);
                    }}
                  />
                  <span>{lbl(locale, 'fp.triviaCorrectAnswer')}</span>
                </label>
                <FieldInput
                  id={`fp-trivia-opt-ar-${index}-${optionIndex}`}
                  label={lbl(locale, 'fp.triviaAnswerAr')}
                  value={option.ar}
                  disabled={disabled}
                  dir="rtl"
                  onChange={(e) => {
                    const value = readFieldInputValue(e);
                    const nextOptions = question.options.map((o) =>
                      o.key === option.key ? { ...o, ar: value } : o,
                    );
                    const next = [...questions];
                    next[index] = { ...question, options: nextOptions };
                    commit(next);
                  }}
                />
                <FieldInput
                  id={`fp-trivia-opt-en-${index}-${optionIndex}`}
                  label={lbl(locale, 'fp.triviaAnswerEn')}
                  value={option.en}
                  disabled={disabled}
                  onChange={(e) => {
                    const value = readFieldInputValue(e);
                    const nextOptions = question.options.map((o) =>
                      o.key === option.key ? { ...o, en: value } : o,
                    );
                    const next = [...questions];
                    next[index] = { ...question, options: nextOptions };
                    commit(next);
                  }}
                />
                <div className="field studio-geo-remove">
                  <label
                    htmlFor={`fp-trivia-opt-remove-${index}-${optionIndex}`}
                  >
                    &nbsp;
                  </label>
                  <button
                    id={`fp-trivia-opt-remove-${index}-${optionIndex}`}
                    type="button"
                    className="btn btn-ghost"
                    disabled={disabled || question.options.length <= 2}
                    onClick={() => {
                      const next = [...questions];
                      next[index] = removeTriviaOption(question, option.key);
                      commit(next);
                    }}
                  >
                    {lbl(locale, 'fp.triviaRemoveAnswer')}
                  </button>
                </div>
              </div>
            ))}
            {question.options.length < 6 ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={disabled}
                onClick={() => {
                  const next = [...questions];
                  next[index] = addTriviaOption(question);
                  commit(next);
                }}
              >
                {lbl(locale, 'fp.triviaAddAnswer')}
              </button>
            ) : null}
          </fieldset>
        </section>
      ))}
      {questions.length < 64 ? (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() =>
            commit([...questions, createTriviaQuestion(questions)])
          }
        >
          {lbl(locale, 'fp.triviaAddQuestion')}
        </button>
      ) : null}
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

function GeographySelectOnMapFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const maps = parseGeoMaps(serverConfig);
  const stored = parseStoredGeoQuestions(serverConfig);
  const questions = stored.length > 0 ? stored : deriveGeoQuestions(maps);
  const [pendingByMap, setPendingByMap] = useState<Record<string, string>>({});

  function commit(next: GeoStudioQuestion[]) {
    const serialized = next
      .map((q) => serializeGeoQuestion(q, maps))
      .filter((q) =>
        maps.some(
          (m) =>
            m.mapId === q.mapId &&
            m.regions.some((r) => r.regionId === q.targetRegionId),
        ),
      );
    const rest = { ...serverConfig };
    delete rest.questions;
    if (serialized.length === 0) {
      onServerChange(rest);
      return;
    }
    onServerChange({ ...rest, questions: serialized });
  }

  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.geoLead')}</p>
      {maps.length === 0 ? (
        <p className="studio-inline-hint">{lbl(locale, 'fp.geoNoMaps')}</p>
      ) : (
        maps.map((map) => {
          const mapQuestions = questions.filter((q) => q.mapId === map.mapId);
          const used = new Set(mapQuestions.map((q) => q.targetRegionId));
          const unused = map.regions.filter((r) => !used.has(r.regionId));
          const pending =
            pendingByMap[map.mapId] &&
            unused.some((r) => r.regionId === pendingByMap[map.mapId])
              ? pendingByMap[map.mapId]!
              : (unused[0]?.regionId ?? '');

          return (
            <section key={map.mapId} className="studio-geo-map">
              <div className="studio-geo-map-head">
                <h3 className="studio-geo-map-title">
                  {geoMapLabel(locale, map.mapId)}
                </h3>
                <span className="studio-geo-map-count">
                  {mapQuestions.length} / {map.regions.length}
                </span>
              </div>
              {mapQuestions.length === 0 ? (
                <p className="studio-inline-hint">
                  {lbl(locale, 'fp.geoEmptyMap')}
                </p>
              ) : (
                mapQuestions.map((question, index) => {
                  const currentUnusedPlusSelf = map.regions.filter(
                    (r) =>
                      r.regionId === question.targetRegionId ||
                      !used.has(r.regionId),
                  );
                  return (
                    <div
                      key={`${map.mapId}-${question.targetRegionId}-${index}`}
                      className="studio-geo-question-row"
                    >
                      <FieldSelect
                        id={`fp-geo-${map.mapId}-${index}`}
                        label={lbl(locale, 'fp.geoCorrectAnswer')}
                        value={question.targetRegionId}
                        disabled={disabled}
                        options={currentUnusedPlusSelf.map((r) => ({
                          value: r.regionId,
                          label: geoCountryLabel(
                            locale,
                            r.regionId,
                            r.labelKey,
                          ),
                        }))}
                        onChange={(e) => {
                          const nextId = e.currentTarget.value;
                          const region = map.regions.find(
                            (r) => r.regionId === nextId,
                          );
                          if (!region) return;
                          const globalIndex = questions.indexOf(question);
                          if (globalIndex < 0) return;
                          const next = [...questions];
                          next[globalIndex] = {
                            mapId: map.mapId,
                            targetRegionId: region.regionId,
                            targetLabelKey: region.labelKey,
                          };
                          commit(next);
                        }}
                      />
                      <div className="field studio-geo-remove">
                        <label htmlFor={`fp-geo-remove-${map.mapId}-${index}`}>
                          &nbsp;
                        </label>
                        <button
                          id={`fp-geo-remove-${map.mapId}-${index}`}
                          type="button"
                          className="btn btn-ghost"
                          disabled={disabled}
                          onClick={() => {
                            commit(questions.filter((q) => q !== question));
                          }}
                        >
                          {lbl(locale, 'fp.geoRemoveQuestion')}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              {unused.length > 0 ? (
                <div className="studio-geo-add-row">
                  <FieldSelect
                    id={`fp-geo-add-${map.mapId}`}
                    label={lbl(locale, 'fp.geoAddQuestion')}
                    value={pending}
                    disabled={disabled}
                    options={unused.map((r) => ({
                      value: r.regionId,
                      label: geoCountryLabel(locale, r.regionId, r.labelKey),
                    }))}
                    onChange={(e) =>
                      setPendingByMap((prev) => ({
                        ...prev,
                        [map.mapId]: e.currentTarget.value,
                      }))
                    }
                  />
                  <div className="field studio-geo-add-actions">
                    <label htmlFor={`fp-geo-add-btn-${map.mapId}`}>
                      &nbsp;
                    </label>
                    <div className="studio-geo-add-buttons">
                      <button
                        id={`fp-geo-add-btn-${map.mapId}`}
                        type="button"
                        className="btn btn-secondary"
                        disabled={disabled || !pending}
                        onClick={() => {
                          const region = map.regions.find(
                            (r) => r.regionId === pending,
                          );
                          if (!region) return;
                          commit([
                            ...questions,
                            {
                              mapId: map.mapId,
                              targetRegionId: region.regionId,
                              targetLabelKey: region.labelKey,
                            },
                          ]);
                          const leftover = unused.filter(
                            (r) => r.regionId !== region.regionId,
                          );
                          setPendingByMap((prev) => ({
                            ...prev,
                            [map.mapId]: leftover[0]?.regionId ?? '',
                          }));
                        }}
                      >
                        {lbl(locale, 'fp.geoAddQuestion')}
                      </button>
                      {unused.length > 1 ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={disabled}
                          onClick={() => {
                            commit([
                              ...questions,
                              ...unused.map((region) => ({
                                mapId: map.mapId,
                                targetRegionId: region.regionId,
                                targetLabelKey: region.labelKey,
                              })),
                            ]);
                            setPendingByMap((prev) => ({
                              ...prev,
                              [map.mapId]: '',
                            }));
                          }}
                        >
                          {lbl(locale, 'fp.geoAddRemaining')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          );
        })
      )}
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

function SnapRadiusFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const snapRadiusNorm = (clientConfig.snapRadiusNorm as number) ?? 0.09;
  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.snapLead')}</p>
      <FractionPercentField
        id="fp-snapRadiusNorm"
        label={lbl(locale, 'fp.snapRadiusNorm')}
        hint={lbl(locale, 'fp.snapRadiusHint')}
        value={snapRadiusNorm}
        onChange={(v) => {
          onClientChange({ ...clientConfig, snapRadiusNorm: v });
          onServerChange({ ...serverConfig, snapRadiusNorm: v });
        }}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

function PrecisionRingLockFields(props: FamilyParamsFieldsProps) {
  const { locale, serverConfig, onServerChange, disabled } = props;
  const minV = (serverConfig.minAngularVelocityDegPerSec as number) ?? 45;
  const maxV = (serverConfig.maxAngularVelocityDegPerSec as number) ?? 90;
  const tolerance = (serverConfig.alignmentToleranceDeg as number) ?? 24;
  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.ringLead')}</p>
      <FieldGroup horizontal>
        <FieldInput
          id="fp-ring-minV"
          label={lbl(locale, 'fp.ringMinSpeed')}
          hint={lbl(locale, 'fp.ringSpeedHint')}
          type="number"
          value={String(minV)}
          disabled={disabled}
          onChange={(e) =>
            onServerChange({
              ...serverConfig,
              minAngularVelocityDegPerSec: Number(e.currentTarget.value),
            })
          }
        />
        <FieldInput
          id="fp-ring-maxV"
          label={lbl(locale, 'fp.ringMaxSpeed')}
          hint={lbl(locale, 'fp.ringSpeedHint')}
          type="number"
          value={String(maxV)}
          disabled={disabled}
          onChange={(e) =>
            onServerChange({
              ...serverConfig,
              maxAngularVelocityDegPerSec: Number(e.currentTarget.value),
            })
          }
        />
      </FieldGroup>
      <FieldInput
        id="fp-ring-tolerance"
        label={lbl(locale, 'fp.ringTolerance')}
        hint={lbl(locale, 'fp.ringToleranceHint')}
        type="number"
        value={String(tolerance)}
        disabled={disabled}
        onChange={(e) =>
          onServerChange({
            ...serverConfig,
            alignmentToleranceDeg: Number(e.currentTarget.value),
          })
        }
      />
    </>
  );
}

function PassThePulseFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const segmentDurationMs = (serverConfig.segmentDurationMs as number) ?? 1800;
  const hitEarly = (serverConfig.hitWindowEarlyMs as number) ?? 280;
  const hitLate = (serverConfig.hitWindowLateMs as number) ?? 320;
  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.pulseLead')}</p>
      <DurationSecondsField
        id="fp-ptp-segment"
        label={lbl(locale, 'fp.segmentDurationMs')}
        hint={lbl(locale, 'fp.segmentDurationHint')}
        valueMs={segmentDurationMs}
        onChangeMs={(ms) =>
          onServerChange({ ...serverConfig, segmentDurationMs: ms })
        }
        minSec={0.8}
        maxSec={4}
        disabled={disabled}
      />
      <FieldGroup horizontal>
        <DurationSecondsField
          id="fp-ptp-early"
          label={lbl(locale, 'fp.hitWindowEarlyMs')}
          hint={lbl(locale, 'fp.hitWindowHint')}
          valueMs={hitEarly}
          onChangeMs={(ms) =>
            onServerChange({ ...serverConfig, hitWindowEarlyMs: ms })
          }
          minSec={0.1}
          maxSec={1}
          disabled={disabled}
        />
        <DurationSecondsField
          id="fp-ptp-late"
          label={lbl(locale, 'fp.hitWindowLateMs')}
          hint={lbl(locale, 'fp.hitWindowHint')}
          valueMs={hitLate}
          onChangeMs={(ms) =>
            onServerChange({ ...serverConfig, hitWindowLateMs: ms })
          }
          minSec={0.1}
          maxSec={1}
          disabled={disabled}
        />
      </FieldGroup>
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'actionKey', labelKey: 'fp.actionKey' },
        ]}
      />
    </>
  );
}

function OddOneOutFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const columns = (clientConfig.columns as number) ?? 4;
  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.oddLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.columns')}
        hint={lbl(locale, 'fp.columnsHint')}
        value={String(columns)}
        options={[3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(v) => {
          const next = Number(v);
          onClientChange({ ...clientConfig, columns: next });
          onServerChange({ ...serverConfig, columns: next });
        }}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

function SequenceSortFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const ascending = clientConfig.ascending !== false;
  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.orderLead')}</p>
      <SegmentedChoice
        label={lbl(locale, 'fp.ascending')}
        hint={lbl(locale, 'fp.ascendingHint')}
        value={ascending ? 'asc' : 'desc'}
        options={[
          { value: 'asc', label: lbl(locale, 'fp.ascending.asc') },
          { value: 'desc', label: lbl(locale, 'fp.ascending.desc') },
        ]}
        onChange={(v) => {
          const next = v === 'asc';
          onClientChange({ ...clientConfig, ascending: next });
          onServerChange({ ...serverConfig, ascending: next });
        }}
        disabled={disabled}
      />
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

function SearchOccurrencesFields(props: FamilyParamsFieldsProps) {
  const {
    locale,
    clientConfig,
    serverConfig,
    onClientChange,
    onServerChange,
    disabled,
  } = props;
  const targetValue = String(clientConfig.targetValue ?? '8');
  const columns = (clientConfig.columns as number) ?? 4;
  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.searchLead')}</p>
      <FieldGroup horizontal>
        <FieldInput
          id="fp-search-target"
          label={lbl(locale, 'fp.targetValue')}
          hint={lbl(locale, 'fp.targetValueHint')}
          value={targetValue}
          disabled={disabled}
          onChange={(e) => {
            const next = e.currentTarget.value;
            onClientChange({ ...clientConfig, targetValue: next });
            onServerChange({ ...serverConfig, targetValue: next });
          }}
        />
        <FieldInput
          id="fp-search-columns"
          label={lbl(locale, 'fp.columns')}
          type="number"
          value={String(columns)}
          disabled={disabled}
          onChange={(e) => {
            const next = Number(e.currentTarget.value);
            onClientChange({ ...clientConfig, columns: next });
            onServerChange({ ...serverConfig, columns: next });
          }}
        />
      </FieldGroup>
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

function LayoutNoteFields(props: FamilyParamsFieldsProps) {
  const { locale, clientConfig, onClientChange, disabled } = props;
  return (
    <>
      <p className="studio-section-lead">{lbl(locale, 'fp.layoutLead')}</p>
      <CopyKeysBlock
        locale={locale}
        clientConfig={clientConfig}
        onClientChange={onClientChange}
        disabled={disabled}
        keys={[
          { field: 'promptKey', labelKey: 'fp.promptKey' },
          { field: 'footerKey', labelKey: 'fp.footerKey' },
        ]}
      />
    </>
  );
}

export function FamilyParamsFields(props: FamilyParamsFieldsProps) {
  const { engineId, locale } = props;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fields = (() => {
    switch (engineId) {
      case 'reaction.wait_for_signal':
        return <ReactionWaitForSignalFields {...props} />;
      case 'trap.no_touch':
        return <TrapNoTouchFields {...props} />;
      case 'gesture.reverse_swipe':
        return <GestureReverseSwipeFields {...props} />;
      case 'tap.precision':
        return <TapPrecisionFields {...props} />;
      case 'memory.sequence':
        return <MemorySequenceFields {...props} />;
      case 'hold.multitouch':
        return <HoldMultitouchFields {...props} />;
      case 'motion.shake':
        return <MotionShakeFields {...props} />;
      case 'motion.tilt_balance':
        return <MotionTiltBalanceFields {...props} />;
      case 'audio.cue':
        return <AudioCueFields {...props} />;
      case 'social.pair_sync':
        return <SocialPairSyncFields {...props} />;
      case 'tactical.risk_choice':
        return <TacticalRiskChoiceFields {...props} />;
      case 'gesture.fog_wipe':
        return <GestureFogWipeFields {...props} />;
      case 'trivia.multiple_choice':
        return <TriviaMultipleChoiceFields {...props} />;
      case 'audio.multiple_choice':
        return <AudioMultipleChoiceFields {...props} />;
      case 'focus.stroop':
        return <FocusStroopFields {...props} />;
      case 'geography.select_on_map':
        return <GeographySelectOnMapFields {...props} />;
      case 'precision.ring_lock':
        return <PrecisionRingLockFields {...props} />;
      case 'social.pass_the_pulse':
        return <PassThePulseFields {...props} />;
      case 'focus.odd_one_out':
        return <OddOneOutFields {...props} />;
      case 'order.sequence_sort':
        return <SequenceSortFields {...props} />;
      case 'search.select_occurrences':
        return <SearchOccurrencesFields {...props} />;
      case 'precision.neon_cable':
      case 'precision.cable_untangle':
        return <SnapRadiusFields {...props} />;
      case 'precision.maze_path':
      case 'precision.circuit_rotation':
      case 'logic.balance_scale':
      case 'logic.complete_sum':
        return <LayoutNoteFields {...props} />;
      default:
        return (
          <p style={{ color: 'var(--lh-text-muted)', fontSize: '0.85rem' }}>
            {t(locale, 'studio.field.fp.unknownEngine' as MessageKey)}
          </p>
        );
    }
  })();

  return (
    <div>
      {fields}
      <details
        style={{ marginTop: '1rem' }}
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: '0.8rem',
            color: 'var(--lh-text-muted)',
            userSelect: 'none',
          }}
        >
          {t(locale, 'studio.field.fp.advancedExport' as MessageKey)}
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <pre className="studio-json-export">
            {JSON.stringify(props.clientConfig, null, 2)}
          </pre>
          <pre className="studio-json-export">
            {JSON.stringify(props.serverConfig, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}
