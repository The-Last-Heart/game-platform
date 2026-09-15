import { z } from 'zod';

/** Launch pack engine ids owned by LH-007. */
export const LAUNCH_ENGINE_IDS = [
  'reaction.wait_for_signal',
  'trap.no_touch',
  'gesture.reverse_swipe',
  'tap.precision',
  'memory.sequence',
  'hold.multitouch',
  // LH-009 schema-only engines (Studio forms only — no runtime evaluator yet)
  'motion.shake',
  'motion.tilt_balance',
  'audio.cue',
  'social.pair_sync',
  'tactical.risk_choice',
  // Challenges 31–38
  'trivia.multiple_choice',
  'geography.select_on_map',
  'focus.odd_one_out',
  'order.sequence_sort',
  'precision.maze_path',
  'precision.neon_cable',
  'gesture.fog_wipe',
  'precision.circuit_rotation',
  'logic.balance_scale',
  'focus.stroop',
  'search.select_occurrences',
] as const;

export const launchEngineIdSchema = z.enum(LAUNCH_ENGINE_IDS);
export type LaunchEngineId = z.infer<typeof launchEngineIdSchema>;

const translationKey = z.string().min(1).max(256);
const unitFraction = z.number().min(0).max(1);
const positiveMs = z.number().int().positive().max(60_000);
const nonNegMs = z.number().int().nonnegative().max(60_000);
const targetId = z.string().min(1).max(64);
const optionKey = z.string().min(1).max(128);

export const swipeDirectionSchema = z.enum(['up', 'down', 'left', 'right']);
export type SwipeDirection = z.infer<typeof swipeDirectionSchema>;

const OPPOSITE_DIRECTION: Record<SwipeDirection, SwipeDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function oppositeSwipeDirection(
  direction: SwipeDirection,
): SwipeDirection {
  return OPPOSITE_DIRECTION[direction];
}

// ---------------------------------------------------------------------------
// 1. reaction.wait_for_signal
// ---------------------------------------------------------------------------

export const reactionWaitForSignalClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    waitingPromptKey: translationKey,
    waitingHintKey: translationKey,
    activePromptKey: translationKey,
    actionKey: translationKey,
    shapeKey: translationKey.optional(),
  })
  .strict();
export type ReactionWaitForSignalClientConfig = z.infer<
  typeof reactionWaitForSignalClientConfigSchema
>;

export const reactionWaitForSignalServerConfigSchema = z
  .object({
    signalDelayMs: nonNegMs,
    signalWindowMs: positiveMs,
    /** Optional per-player delay spread; when omitted the server still randomizes. */
    signalDelayRangeMs: z
      .object({
        min: nonNegMs,
        max: nonNegMs,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (!cfg.signalDelayRangeMs) return;
    if (cfg.signalDelayRangeMs.max < cfg.signalDelayRangeMs.min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signalDelayRangeMs.max must be >= min',
        path: ['signalDelayRangeMs', 'max'],
      });
    }
  });
export type ReactionWaitForSignalServerConfig = z.infer<
  typeof reactionWaitForSignalServerConfigSchema
>;

/** Client answer plus optional server-injected expected token for evaluation. */
export const reactionWaitForSignalAnswerSchema = z
  .object({
    signalToken: z.string().min(1).max(128).optional(),
    _expectedSignalToken: z.string().min(1).max(128).optional(),
  })
  .strict();
export type ReactionWaitForSignalAnswer = z.infer<
  typeof reactionWaitForSignalAnswerSchema
>;

export function parseReactionWaitForSignalClientConfig(input: unknown) {
  return reactionWaitForSignalClientConfigSchema.parse(input);
}
export function parseReactionWaitForSignalServerConfig(input: unknown) {
  return reactionWaitForSignalServerConfigSchema.parse(input);
}
export function parseReactionWaitForSignalAnswer(input: unknown) {
  return reactionWaitForSignalAnswerSchema.parse(input);
}

// ---------------------------------------------------------------------------
// 2. trap.no_touch
// ---------------------------------------------------------------------------

export const trapNoTouchZoneSchema = z
  .object({
    x: unitFraction,
    y: unitFraction,
    width: unitFraction,
    height: unitFraction,
  })
  .strict()
  .superRefine((zone, ctx) => {
    if (zone.x + zone.width > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'zone.x + zone.width must be <= 1',
        path: ['width'],
      });
    }
    if (zone.y + zone.height > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'zone.y + zone.height must be <= 1',
        path: ['height'],
      });
    }
  });

export const trapNoTouchClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    zoneHintKey: translationKey,
    zone: trapNoTouchZoneSchema,
  })
  .strict();
export type TrapNoTouchClientConfig = z.infer<
  typeof trapNoTouchClientConfigSchema
>;

export const trapNoTouchServerConfigSchema = z.union([
  z.object({}).strict(),
  z.object({ allowSystemGestures: z.literal(true) }).strict(),
]);
export type TrapNoTouchServerConfig = z.infer<
  typeof trapNoTouchServerConfigSchema
>;

/** `{ touched: true }` = failure touch; empty object = no gameplay touch. */
export const trapNoTouchAnswerSchema = z.union([
  z.object({}).strict(),
  z.object({ touched: z.literal(true) }).strict(),
]);
export type TrapNoTouchAnswer = z.infer<typeof trapNoTouchAnswerSchema>;

export function parseTrapNoTouchClientConfig(input: unknown) {
  return trapNoTouchClientConfigSchema.parse(input);
}
export function parseTrapNoTouchServerConfig(input: unknown) {
  return trapNoTouchServerConfigSchema.parse(input);
}
export function parseTrapNoTouchAnswer(input: unknown) {
  return trapNoTouchAnswerSchema.parse(input);
}

// ---------------------------------------------------------------------------
// 3. gesture.reverse_swipe
// ---------------------------------------------------------------------------

export const gestureReverseSwipeClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    displayedDirection: swipeDirectionSchema,
    minDistancePx: z.number().positive().max(2000),
  })
  .strict();
export type GestureReverseSwipeClientConfig = z.infer<
  typeof gestureReverseSwipeClientConfigSchema
>;

export const gestureReverseSwipeServerConfigSchema = z
  .object({
    requiredDirection: swipeDirectionSchema,
    minDistancePx: z.number().positive().max(2000),
    maxDurationMs: positiveMs,
  })
  .strict();
export type GestureReverseSwipeServerConfig = z.infer<
  typeof gestureReverseSwipeServerConfigSchema
>;

export const gestureReverseSwipeAnswerSchema = z
  .object({
    dx: z.number().finite(),
    dy: z.number().finite(),
    durationMs: z.number().int().nonnegative().max(60_000),
  })
  .strict();
export type GestureReverseSwipeAnswer = z.infer<
  typeof gestureReverseSwipeAnswerSchema
>;

export function parseGestureReverseSwipeClientConfig(input: unknown) {
  return gestureReverseSwipeClientConfigSchema.parse(input);
}
export function parseGestureReverseSwipeServerConfig(input: unknown) {
  return gestureReverseSwipeServerConfigSchema.parse(input);
}
export function parseGestureReverseSwipeAnswer(input: unknown) {
  return gestureReverseSwipeAnswerSchema.parse(input);
}

// ---------------------------------------------------------------------------
// 4. tap.precision
// ---------------------------------------------------------------------------

export const tapPrecisionTargetSchema = z
  .object({
    id: targetId,
    x: unitFraction,
    y: unitFraction,
  })
  .strict();

export const tapPrecisionClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    targets: z.array(tapPrecisionTargetSchema).min(1).max(12),
    attemptCount: z.number().int().positive().max(12),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.targets.map((t) => t.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targets must have unique ids',
        path: ['targets'],
      });
    }
  });
export type TapPrecisionClientConfig = z.infer<
  typeof tapPrecisionClientConfigSchema
>;

export const tapPrecisionServerConfigSchema = z
  .object({
    targetIds: z.array(targetId).min(1).max(12),
    attemptCount: z.number().int().positive().max(12),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.targetIds).size !== value.targetIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targetIds must be unique',
        path: ['targetIds'],
      });
    }
  });
export type TapPrecisionServerConfig = z.infer<
  typeof tapPrecisionServerConfigSchema
>;

export const tapPrecisionAnswerSchema = z
  .object({
    tappedTargetIds: z.array(targetId).max(12),
  })
  .strict();
export type TapPrecisionAnswer = z.infer<typeof tapPrecisionAnswerSchema>;

export function parseTapPrecisionClientConfig(input: unknown) {
  return tapPrecisionClientConfigSchema.parse(input);
}
export function parseTapPrecisionServerConfig(input: unknown) {
  return tapPrecisionServerConfigSchema.parse(input);
}
export function parseTapPrecisionAnswer(input: unknown) {
  return tapPrecisionAnswerSchema.parse(input);
}

// ---------------------------------------------------------------------------
// 5. memory.sequence
// ---------------------------------------------------------------------------

/**
 * Catalog pool group: one visual family (shapes / symbols / marks).
 * Runtime picks one group per challenge instance, then samples optionKeys.
 */
export const memoryObjectGroupSchema = z
  .object({
    groupId: z.string().min(1).max(64),
    keys: z.array(optionKey).min(4).max(24),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.keys).size !== value.keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'object group keys must be unique',
        path: ['keys'],
      });
    }
  });
export type MemoryObjectGroup = z.infer<typeof memoryObjectGroupSchema>;

/**
 * Public client config. Must not include the authoritative sequence —
 * server owns order; answer-phase optionKeys may be shuffled without leaking it.
 */
export const memorySequenceClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    optionKeys: z.array(optionKey).min(2).max(12),
    previewMs: positiveMs,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.optionKeys).size !== value.optionKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'optionKeys must be unique',
        path: ['optionKeys'],
      });
    }
  });
export type MemorySequenceClientConfig = z.infer<
  typeof memorySequenceClientConfigSchema
>;

export const memorySequenceServerConfigSchema = z
  .object({
    sequence: z.array(optionKey).min(1).max(12),
    previewMs: positiveMs,
    optionKeys: z.array(optionKey).min(2).max(12),
    /** When set, each challenge instance samples a random group + options. */
    objectGroups: z.array(memoryObjectGroupSchema).min(1).max(12).optional(),
    optionCount: z.number().int().min(2).max(8).optional(),
    sequenceLength: z.number().int().min(1).max(12).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.optionKeys).size !== value.optionKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'optionKeys must be unique',
        path: ['optionKeys'],
      });
    }
    const allowed = new Set(value.optionKeys);
    for (let i = 0; i < value.sequence.length; i++) {
      const key = value.sequence[i]!;
      if (!allowed.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `sequence[${i}] is not in optionKeys`,
          path: ['sequence', i],
        });
      }
    }
    const optionCount = value.optionCount ?? 4;
    const sequenceLength = value.sequenceLength ?? value.sequence.length;
    if (value.objectGroups) {
      for (let g = 0; g < value.objectGroups.length; g++) {
        const group = value.objectGroups[g]!;
        if (group.keys.length < optionCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `objectGroups[${g}] needs at least optionCount (${optionCount}) keys`,
            path: ['objectGroups', g, 'keys'],
          });
        }
      }
    }
    if (sequenceLength > optionCount && !value.objectGroups) {
      // Static catalogs may still use repeats inside sequence; only warn via length cap.
    }
  });
export type MemorySequenceServerConfig = z.infer<
  typeof memorySequenceServerConfigSchema
>;

export const memorySequenceAnswerSchema = z
  .object({
    sequence: z.array(optionKey).min(1).max(12),
  })
  .strict();
export type MemorySequenceAnswer = z.infer<typeof memorySequenceAnswerSchema>;

export function parseMemorySequenceClientConfig(input: unknown) {
  return memorySequenceClientConfigSchema.parse(input);
}
export function parseMemorySequenceServerConfig(input: unknown) {
  return memorySequenceServerConfigSchema.parse(input);
}
export function parseMemorySequenceAnswer(input: unknown) {
  return memorySequenceAnswerSchema.parse(input);
}

// ---------------------------------------------------------------------------
// 6. hold.multitouch
// ---------------------------------------------------------------------------

export const holdMultitouchClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    requiredContacts: z.literal(2),
    holdMs: positiveMs,
  })
  .strict();
export type HoldMultitouchClientConfig = z.infer<
  typeof holdMultitouchClientConfigSchema
>;

export const holdMultitouchServerConfigSchema = z
  .object({
    requiredContacts: z.literal(2),
    holdMs: positiveMs,
    resetOnLift: z.boolean(),
  })
  .strict();
export type HoldMultitouchServerConfig = z.infer<
  typeof holdMultitouchServerConfigSchema
>;

export const holdMultitouchAnswerSchema = z
  .object({
    contacts: z.number().int().nonnegative().max(10),
    heldMs: z.number().int().nonnegative().max(60_000),
    final: z.boolean().optional(),
  })
  .strict();
export type HoldMultitouchAnswer = z.infer<typeof holdMultitouchAnswerSchema>;

export function parseHoldMultitouchClientConfig(input: unknown) {
  return holdMultitouchClientConfigSchema.parse(input);
}
export function parseHoldMultitouchServerConfig(input: unknown) {
  return holdMultitouchServerConfigSchema.parse(input);
}
export function parseHoldMultitouchAnswer(input: unknown) {
  return holdMultitouchAnswerSchema.parse(input);
}

// ---------------------------------------------------------------------------
// 7. motion.shake
// ---------------------------------------------------------------------------

export const motionShakeClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    progressKey: translationKey,
  })
  .strict();
export type MotionShakeClientConfig = z.infer<typeof motionShakeClientConfigSchema>;

export const motionShakeServerConfigSchema = z
  .object({
    requiredShakeCount: z.number().int().positive().max(100),
    noiseThreshold: z.number().min(0).max(100).default(5),
  })
  .strict();
export type MotionShakeServerConfig = z.infer<typeof motionShakeServerConfigSchema>;

export const motionShakeAnswerSchema = z
  .object({
    shakeCount: z.number().int().nonnegative().max(200),
  })
  .strict();
export type MotionShakeAnswer = z.infer<typeof motionShakeAnswerSchema>;

// ---------------------------------------------------------------------------
// 8. motion.tilt_balance
// ---------------------------------------------------------------------------

export const motionTiltTargetShapeSchema = z.enum([
  'circle',
  'square',
  'diamond',
  'heart',
]);
export type MotionTiltTargetShape = z.infer<typeof motionTiltTargetShapeSchema>;

export const motionTiltBalanceClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
  })
  .strict();
export type MotionTiltBalanceClientConfig = z.infer<typeof motionTiltBalanceClientConfigSchema>;

export const motionTiltBalanceServerConfigSchema = z
  .object({
    targetX: z.number().min(-1).max(1),
    targetY: z.number().min(-1).max(1),
    holdMs: positiveMs,
    varianceTolerance: z.number().min(0).max(1).default(0.15),
    /** Optional seat palette; server picks one variant per player. */
    targetVariants: z
      .array(
        z
          .object({
            targetX: z.number().min(-1).max(1),
            targetY: z.number().min(-1).max(1),
            targetShape: motionTiltTargetShapeSchema.default('circle'),
          })
          .strict(),
      )
      .min(1)
      .max(12)
      .optional(),
  })
  .strict();
export type MotionTiltBalanceServerConfig = z.infer<typeof motionTiltBalanceServerConfigSchema>;

export const motionTiltBalanceAnswerSchema = z
  .object({
    finalX: z.number().finite(),
    finalY: z.number().finite(),
    heldMs: nonNegMs,
  })
  .strict();
export type MotionTiltBalanceAnswer = z.infer<typeof motionTiltBalanceAnswerSchema>;

// ---------------------------------------------------------------------------
// 9. audio.cue
// ---------------------------------------------------------------------------

export const audioCueClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    visualFallbackKey: translationKey,
    hapticFallbackKey: translationKey,
  })
  .strict();
export type AudioCueClientConfig = z.infer<typeof audioCueClientConfigSchema>;

export const audioCueServerConfigSchema = z
  .object({
    pulseCount: z.number().int().positive().max(20),
    /** Optional pool for per-seat pulse counts; runtime falls back near pulseCount. */
    pulseCountOptions: z
      .array(z.number().int().positive().max(8))
      .min(2)
      .max(8)
      .optional(),
  })
  .strict();
export type AudioCueServerConfig = z.infer<typeof audioCueServerConfigSchema>;

export const audioCueAnswerSchema = z
  .object({
    reportedPulseCount: z.number().int().nonnegative().max(30),
  })
  .strict();
export type AudioCueAnswer = z.infer<typeof audioCueAnswerSchema>;

// ---------------------------------------------------------------------------
// 10. social.pair_sync
// ---------------------------------------------------------------------------

export const socialPairSyncClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    partnerRoleKeys: z.array(translationKey).min(1).max(4),
  })
  .strict();
export type SocialPairSyncClientConfig = z.infer<typeof socialPairSyncClientConfigSchema>;

export const socialPairSyncServerConfigSchema = z
  .object({
    partnerRoleKeys: z.array(translationKey).min(1).max(4),
    syncWindowMs: positiveMs,
  })
  .strict();
export type SocialPairSyncServerConfig = z.infer<typeof socialPairSyncServerConfigSchema>;

export const socialPairSyncAnswerSchema = z
  .object({
    synced: z.boolean(),
    /** How long the player held the sync control (ms). */
    heldMs: z.number().int().nonnegative().max(60_000).optional(),
    /** True when the player lifted before the hold completed. */
    releasedEarly: z.boolean().optional(),
    final: z.boolean().optional(),
  })
  .strict();
export type SocialPairSyncAnswer = z.infer<typeof socialPairSyncAnswerSchema>;

// ---------------------------------------------------------------------------
// 11. tactical.risk_choice
// ---------------------------------------------------------------------------

export const tacticalRiskChoiceClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    optionKeys: z.array(optionKey).min(2).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.optionKeys).size !== value.optionKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'optionKeys must be unique',
        path: ['optionKeys'],
      });
    }
  });
export type TacticalRiskChoiceClientConfig = z.infer<typeof tacticalRiskChoiceClientConfigSchema>;

export const tacticalRiskChoiceServerConfigSchema = z
  .object({
    optionKeys: z.array(optionKey).min(2).max(4),
    riskWeights: z.array(z.number().int().min(0).max(10_000)).min(2).max(4),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.optionKeys.length !== value.riskWeights.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'riskWeights length must match optionKeys length',
        path: ['riskWeights'],
      });
    }
  });
export type TacticalRiskChoiceServerConfig = z.infer<typeof tacticalRiskChoiceServerConfigSchema>;

export const tacticalRiskChoiceAnswerSchema = z
  .object({
    chosenOptionKey: optionKey,
  })
  .strict();
export type TacticalRiskChoiceAnswer = z.infer<typeof tacticalRiskChoiceAnswerSchema>;

// ---------------------------------------------------------------------------
// 12. trivia.multiple_choice
// ---------------------------------------------------------------------------

export const triviaMultipleChoiceClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    questionKey: translationKey,
    optionKeys: z.array(optionKey).min(2).max(6),
    footerKey: translationKey.optional(),
  })
  .strict();
export type TriviaMultipleChoiceClientConfig = z.infer<
  typeof triviaMultipleChoiceClientConfigSchema
>;

export const triviaMultipleChoiceServerConfigSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            questionKey: translationKey,
            optionKeys: z.array(optionKey).min(2).max(6),
            correctOptionKey: optionKey,
          })
          .strict(),
      )
      .min(1)
      .max(64),
    questionKey: translationKey.optional(),
    optionKeys: z.array(optionKey).min(2).max(6).optional(),
    correctOptionKey: optionKey.optional(),
  })
  .strict();
export type TriviaMultipleChoiceServerConfig = z.infer<
  typeof triviaMultipleChoiceServerConfigSchema
>;

export const triviaMultipleChoiceAnswerSchema = z
  .object({
    chosenOptionKey: optionKey,
  })
  .strict();
export type TriviaMultipleChoiceAnswer = z.infer<
  typeof triviaMultipleChoiceAnswerSchema
>;

// ---------------------------------------------------------------------------
// 13. geography.select_on_map
// ---------------------------------------------------------------------------

const mapPointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

const mapRegionSchema = z
  .object({
    regionId: z.string().min(1).max(64),
    labelKey: translationKey,
    polygon: z.array(mapPointSchema).min(3).max(256),
  })
  .strict();

export const geographyMapSchema = z
  .object({
    mapId: z.string().min(1).max(64),
    assetId: z.string().min(1).max(128),
    imageWidth: z.number().int().positive().max(8192),
    imageHeight: z.number().int().positive().max(8192),
    regions: z.array(mapRegionSchema).min(1).max(64),
  })
  .strict();
export type GeographyMap = z.infer<typeof geographyMapSchema>;

export const geographySelectOnMapClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    mapId: z.string().min(1).max(64),
    assetId: z.string().min(1).max(128),
    imageWidth: z.number().int().positive().max(8192),
    imageHeight: z.number().int().positive().max(8192),
    targetLabelKey: translationKey,
    regions: z.array(mapRegionSchema).min(1).max(64),
  })
  .strict();
export type GeographySelectOnMapClientConfig = z.infer<
  typeof geographySelectOnMapClientConfigSchema
>;

export const geographySelectOnMapServerConfigSchema = z
  .object({
    maps: z.array(geographyMapSchema).min(1).max(32),
    mapId: z.string().min(1).max(64).optional(),
    assetId: z.string().min(1).max(128).optional(),
    imageWidth: z.number().int().positive().max(8192).optional(),
    imageHeight: z.number().int().positive().max(8192).optional(),
    regions: z.array(mapRegionSchema).min(1).max(64).optional(),
    targetRegionId: z.string().min(1).max(64).optional(),
  })
  .strict();
export type GeographySelectOnMapServerConfig = z.infer<
  typeof geographySelectOnMapServerConfigSchema
>;

export const geographySelectOnMapAnswerSchema = z
  .object({
    regionId: z.string().min(1).max(64).nullable(),
  })
  .strict();
export type GeographySelectOnMapAnswer = z.infer<
  typeof geographySelectOnMapAnswerSchema
>;

// ---------------------------------------------------------------------------
// 14. focus.odd_one_out
// ---------------------------------------------------------------------------

export const focusOddOneOutClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    columns: z.number().int().min(2).max(6),
    glyphKeys: z.array(optionKey).min(4).max(36),
  })
  .strict();
export type FocusOddOneOutClientConfig = z.infer<
  typeof focusOddOneOutClientConfigSchema
>;

export const focusOddOneOutServerConfigSchema = z
  .object({
    columns: z.number().int().min(2).max(6),
    glyphKeys: z.array(optionKey).min(4).max(36),
    oddIndex: z.number().int().min(0).max(35),
    variants: z
      .array(
        z
          .object({
            columns: z.number().int().min(2).max(6),
            glyphKeys: z.array(optionKey).min(4).max(36),
            oddIndex: z.number().int().min(0).max(35),
          })
          .strict(),
      )
      .min(1)
      .max(32)
      .optional(),
  })
  .strict();
export type FocusOddOneOutServerConfig = z.infer<
  typeof focusOddOneOutServerConfigSchema
>;

export const focusOddOneOutAnswerSchema = z
  .object({
    selectedIndex: z.number().int().min(0).max(35),
  })
  .strict();
export type FocusOddOneOutAnswer = z.infer<typeof focusOddOneOutAnswerSchema>;

// ---------------------------------------------------------------------------
// 15. order.sequence_sort
// ---------------------------------------------------------------------------

export const orderSequenceSortClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    itemKeys: z.array(optionKey).min(2).max(8),
    ascending: z.boolean(),
  })
  .strict();
export type OrderSequenceSortClientConfig = z.infer<
  typeof orderSequenceSortClientConfigSchema
>;

export const orderSequenceSortServerConfigSchema = z
  .object({
    itemKeys: z.array(optionKey).min(2).max(8),
    correctOrder: z.array(optionKey).min(2).max(8),
    ascending: z.boolean(),
    variants: z
      .array(
        z
          .object({
            itemKeys: z.array(optionKey).min(2).max(8),
            correctOrder: z.array(optionKey).min(2).max(8),
            ascending: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(32)
      .optional(),
  })
  .strict();
export type OrderSequenceSortServerConfig = z.infer<
  typeof orderSequenceSortServerConfigSchema
>;

export const orderSequenceSortAnswerSchema = z
  .object({
    orderedKeys: z.array(optionKey).min(2).max(8),
  })
  .strict();
export type OrderSequenceSortAnswer = z.infer<typeof orderSequenceSortAnswerSchema>;

// ---------------------------------------------------------------------------
// 16. precision.maze_path
// ---------------------------------------------------------------------------

export const precisionMazePathClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    cols: z.number().int().min(3).max(12),
    rows: z.number().int().min(3).max(12),
    /** 0 = wall, 1 = path */
    cells: z.array(z.union([z.literal(0), z.literal(1)])).min(9).max(144),
    startIndex: z.number().int().min(0).max(143),
    goalIndex: z.number().int().min(0).max(143),
  })
  .strict();
export type PrecisionMazePathClientConfig = z.infer<
  typeof precisionMazePathClientConfigSchema
>;

export const precisionMazePathServerConfigSchema = z
  .object({
    cols: z.number().int().min(3).max(12),
    rows: z.number().int().min(3).max(12),
    cells: z.array(z.union([z.literal(0), z.literal(1)])).min(9).max(144),
    startIndex: z.number().int().min(0).max(143),
    goalIndex: z.number().int().min(0).max(143),
    variants: z
      .array(
        z
          .object({
            cols: z.number().int().min(3).max(12),
            rows: z.number().int().min(3).max(12),
            cells: z.array(z.union([z.literal(0), z.literal(1)])).min(9).max(144),
            startIndex: z.number().int().min(0).max(143),
            goalIndex: z.number().int().min(0).max(143),
          })
          .strict(),
      )
      .min(1)
      .max(16)
      .optional(),
  })
  .strict();
export type PrecisionMazePathServerConfig = z.infer<
  typeof precisionMazePathServerConfigSchema
>;

export const precisionMazePathAnswerSchema = z
  .object({
    reachedGoal: z.boolean(),
    hitWall: z.boolean(),
  })
  .strict();
export type PrecisionMazePathAnswer = z.infer<typeof precisionMazePathAnswerSchema>;

// ---------------------------------------------------------------------------
// 16b. precision.neon_cable
// ---------------------------------------------------------------------------

export const neonCableColorSchema = z.enum(['cyan', 'red']);
export type NeonCableColor = z.infer<typeof neonCableColorSchema>;

export const neonCableWrongDropPolicySchema = z.enum([
  'fail_final',
  'reset_allow_retry',
]);
export type NeonCableWrongDropPolicy = z.infer<
  typeof neonCableWrongDropPolicySchema
>;

export const neonCableSocketSchema = z
  .object({
    socketId: z.string().min(1).max(64),
    color: neonCableColorSchema,
    /** Normalized panel coordinates (0..1) for socket center. */
    xNorm: unitFraction,
    yNorm: unitFraction,
  })
  .strict();
export type NeonCableSocket = z.infer<typeof neonCableSocketSchema>;

export const neonCableAssetIdsSchema = z
  .object({
    panel: z.string().min(1).max(128),
    socketHousing: z.string().min(1).max(128),
    socketRingCyan: z.string().min(1).max(128),
    socketRingRed: z.string().min(1).max(128),
    socketGlowCyan: z.string().min(1).max(128),
    socketGlowRed: z.string().min(1).max(128),
    plugBody: z.string().min(1).max(128),
    plugGlow: z.string().min(1).max(128),
    plugShadow: z.string().min(1).max(128),
    snapSparksCyan: z.string().min(1).max(128),
    snapSparksRed: z.string().min(1).max(128),
    /** Dual-artboard Rive (`Cyan Spark` / `Red Spark`); PNG sparks remain as fallback. */
    sparkRive: z.string().min(1).max(128).optional(),
    /** Snap spark SFX (content-pack download). */
    sparkSfx: z.string().min(1).max(128).optional(),
    composition: z.string().min(1).max(128).optional(),
  })
  .strict();
export type NeonCableAssetIds = z.infer<typeof neonCableAssetIdsSchema>;

export const precisionNeonCableClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    assetIds: neonCableAssetIdsSchema,
    sockets: z.array(neonCableSocketSchema).min(2).max(4),
    /** Plug start position (normalized panel coords). */
    plugStartXNorm: unitFraction,
    plugStartYNorm: unitFraction,
    /** Fixed cable anchor on the panel (normalized). */
    cableAnchorXNorm: unitFraction,
    cableAnchorYNorm: unitFraction,
    plugCableAnchorNorm: z.tuple([unitFraction, unitFraction]),
    plugTipAnchorNorm: z.tuple([unitFraction, unitFraction]),
    socketTargetAnchorNorm: z.tuple([unitFraction, unitFraction]),
    /** Snap radius as a fraction of the panel's shortest side. */
    snapRadiusNorm: z.number().min(0.02).max(0.25),
    wrongDropPolicy: neonCableWrongDropPolicySchema,
    /** Public so the client can give immediate snap feedback; server still authorizes. */
    correctSocketId: z.string().min(1).max(64),
    plugColor: neonCableColorSchema,
  })
  .strict();
export type PrecisionNeonCableClientConfig = z.infer<
  typeof precisionNeonCableClientConfigSchema
>;

export const precisionNeonCableServerConfigSchema = z
  .object({
    assetIds: neonCableAssetIdsSchema,
    sockets: z.array(neonCableSocketSchema).min(2).max(4),
    plugStartXNorm: unitFraction,
    plugStartYNorm: unitFraction,
    cableAnchorXNorm: unitFraction,
    cableAnchorYNorm: unitFraction,
    plugCableAnchorNorm: z.tuple([unitFraction, unitFraction]),
    plugTipAnchorNorm: z.tuple([unitFraction, unitFraction]),
    socketTargetAnchorNorm: z.tuple([unitFraction, unitFraction]),
    snapRadiusNorm: z.number().min(0.02).max(0.25),
    wrongDropPolicy: neonCableWrongDropPolicySchema,
    correctSocketId: z.string().min(1).max(64),
    plugColor: neonCableColorSchema,
    variants: z
      .array(
        z
          .object({
            sockets: z.array(neonCableSocketSchema).min(2).max(4),
            correctSocketId: z.string().min(1).max(64),
            plugColor: neonCableColorSchema,
            plugStartXNorm: unitFraction.optional(),
            plugStartYNorm: unitFraction.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(16)
      .optional(),
  })
  .strict();
export type PrecisionNeonCableServerConfig = z.infer<
  typeof precisionNeonCableServerConfigSchema
>;

export const precisionNeonCableAnswerSchema = z
  .object({
    socketId: z.string().min(1).max(64).nullable(),
    snapped: z.boolean(),
  })
  .strict();
export type PrecisionNeonCableAnswer = z.infer<
  typeof precisionNeonCableAnswerSchema
>;

// ---------------------------------------------------------------------------
// 16c. gesture.fog_wipe
// ---------------------------------------------------------------------------

export const fogWipeAssetIdsSchema = z
  .object({
    revealContent: z.string().min(1).max(128),
    fogDensity: z.string().min(1).max(128),
    dropletHeight: z.string().min(1).max(128),
    frostedEdges: z.string().min(1).max(128),
    scratchMask: z.string().min(1).max(128),
    wetSmudgeMask: z.string().min(1).max(128),
    glassReflections: z.string().min(1).max(128),
    /** Optional content-pack SFX played while the player wipes fog. */
    swipeSfx: z.string().min(1).max(128).optional(),
  })
  .strict();
export type FogWipeAssetIds = z.infer<typeof fogWipeAssetIdsSchema>;

export const gestureFogWipeClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    assetIds: fogWipeAssetIdsSchema,
    /** Brush diameter as a fraction of panel width. */
    brushDiameterNorm: z.number().min(0.04).max(0.3),
    /** Soft edge feather as a fraction of brush radius. */
    brushFeatherNorm: z.number().min(0.1).max(0.6),
    /** Public win threshold so the client can auto-submit; server re-checks. */
    clearanceRatioMin: unitFraction,
  })
  .strict();
export type GestureFogWipeClientConfig = z.infer<
  typeof gestureFogWipeClientConfigSchema
>;

export const gestureFogWipeServerConfigSchema = z
  .object({
    assetIds: fogWipeAssetIdsSchema,
    revealContentVariants: z
      .array(z.string().min(1).max(128))
      .min(1)
      .max(32)
      .optional(),
    brushDiameterNorm: z.number().min(0.04).max(0.3),
    brushFeatherNorm: z.number().min(0.1).max(0.6),
    clearanceRatioMin: unitFraction,
  })
  .strict();
export type GestureFogWipeServerConfig = z.infer<
  typeof gestureFogWipeServerConfigSchema
>;

export const gestureFogWipeAnswerSchema = z
  .object({
    /** Fraction of fog-weighted panel cleared by the wipe mask (0..1). */
    clearanceRatio: unitFraction,
  })
  .strict();
export type GestureFogWipeAnswer = z.infer<typeof gestureFogWipeAnswerSchema>;

// ---------------------------------------------------------------------------
// 16d. precision.circuit_rotation
// ---------------------------------------------------------------------------

export const circuitRotationSideSchema = z.enum([
  'north',
  'east',
  'south',
  'west',
]);
export type CircuitRotationSide = z.infer<typeof circuitRotationSideSchema>;

export const circuitRotationCellSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
export type CircuitRotationCell = z.infer<typeof circuitRotationCellSchema>;

export const circuitRotationGridSchema = z
  .object({
    rows: z.number().int().min(1).max(8),
    columns: z.number().int().min(1).max(8),
  })
  .strict();
export type CircuitRotationGrid = z.infer<typeof circuitRotationGridSchema>;

export const circuitRotationSourceSchema = z
  .object({
    cell: circuitRotationCellSchema,
    side: circuitRotationSideSchema,
  })
  .strict();
export type CircuitRotationSource = z.infer<typeof circuitRotationSourceSchema>;

export const circuitRotationTargetSchema = z
  .object({
    cell: circuitRotationCellSchema,
    side: circuitRotationSideSchema,
    kind: z.literal('heart'),
  })
  .strict();
export type CircuitRotationTarget = z.infer<typeof circuitRotationTargetSchema>;

export const circuitRotationShapeSchema = z.enum(['straight', 'corner']);
export type CircuitRotationShape = z.infer<typeof circuitRotationShapeSchema>;

export const circuitRotationTileSchema = z
  .object({
    id: z.string().min(1).max(64),
    cell: circuitRotationCellSchema,
    shape: circuitRotationShapeSchema,
    initialQuarterTurns: z.number().int().min(0).max(3),
    movable: z.boolean(),
  })
  .strict();
export type CircuitRotationTile = z.infer<typeof circuitRotationTileSchema>;

export const circuitRotationStationaryConnectionSchema = z
  .object({
    cell: circuitRotationCellSchema,
    side: circuitRotationSideSchema,
  })
  .strict();
export type CircuitRotationStationaryConnection = z.infer<
  typeof circuitRotationStationaryConnectionSchema
>;

export const circuitRotationAssetIdsSchema = z
  .object({
    boardBase: z.string().min(1).max(128),
    gridPlate: z.string().min(1).max(128),
    sparkRive: z.string().min(1).max(128),
  })
  .strict();
export type CircuitRotationAssetIds = z.infer<
  typeof circuitRotationAssetIdsSchema
>;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const circuitRotationThemeSchema = z
  .object({
    inactivePipeColor: hexColor,
    energyColor: hexColor,
    energyCoreColor: hexColor,
    socketColor: hexColor,
  })
  .strict();
export type CircuitRotationTheme = z.infer<typeof circuitRotationThemeSchema>;

type CircuitRotationPuzzleLike = {
  grid: CircuitRotationGrid;
  source: CircuitRotationSource;
  target: CircuitRotationTarget;
  tiles: CircuitRotationTile[];
  stationaryConnections: CircuitRotationStationaryConnection[];
};

function refineCircuitRotationPuzzle(
  puzzle: CircuitRotationPuzzleLike,
  ctx: z.RefinementCtx,
): void {
  const inBounds = ([row, column]: CircuitRotationCell) =>
    row < puzzle.grid.rows && column < puzzle.grid.columns;
  const validateCell = (
    cell: CircuitRotationCell,
    path: (string | number)[],
  ) => {
    if (!inBounds(cell)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cell must be within grid bounds',
        path,
      });
    }
  };

  validateCell(puzzle.source.cell, ['source', 'cell']);
  validateCell(puzzle.target.cell, ['target', 'cell']);

  const tileIds = new Set<string>();
  const tileCells = new Set<string>();
  puzzle.tiles.forEach((tile, index) => {
    validateCell(tile.cell, ['tiles', index, 'cell']);
    if (tileIds.has(tile.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate tile id "${tile.id}"`,
        path: ['tiles', index, 'id'],
      });
    }
    tileIds.add(tile.id);

    const cellKey = tile.cell.join(',');
    if (tileCells.has(cellKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'multiple tiles cannot occupy the same cell',
        path: ['tiles', index, 'cell'],
      });
    }
    tileCells.add(cellKey);
  });

  const stationaryConnections = new Set<string>();
  puzzle.stationaryConnections.forEach((connection, index) => {
    validateCell(connection.cell, ['stationaryConnections', index, 'cell']);
    const connectionKey = `${connection.cell.join(',')}:${connection.side}`;
    if (stationaryConnections.has(connectionKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'duplicate stationary connection',
        path: ['stationaryConnections', index],
      });
    }
    stationaryConnections.add(connectionKey);
  });
}

const circuitRotationPuzzleShape = {
  grid: circuitRotationGridSchema,
  source: circuitRotationSourceSchema,
  target: circuitRotationTargetSchema,
  tiles: z.array(circuitRotationTileSchema).min(1).max(64),
  stationaryConnections: z
    .array(circuitRotationStationaryConnectionSchema)
    .max(64),
} as const;

export const circuitRotationVariantSchema = z
  .object({
    ...circuitRotationPuzzleShape,
    requireAllConfiguredTilesPowered: z.boolean().optional(),
  })
  .strict()
  .superRefine(refineCircuitRotationPuzzle);
export type CircuitRotationVariant = z.infer<
  typeof circuitRotationVariantSchema
>;

export const precisionCircuitRotationClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    assetIds: circuitRotationAssetIdsSchema,
    ...circuitRotationPuzzleShape,
    theme: circuitRotationThemeSchema,
    rotationDegrees: z.literal(90).default(90),
  })
  .strict()
  .superRefine(refineCircuitRotationPuzzle);
export type PrecisionCircuitRotationClientConfig = z.infer<
  typeof precisionCircuitRotationClientConfigSchema
>;

export const precisionCircuitRotationServerConfigSchema = z
  .object({
    assetIds: circuitRotationAssetIdsSchema,
    ...circuitRotationPuzzleShape,
    theme: circuitRotationThemeSchema,
    rotationDegrees: z.literal(90).default(90),
    requireAllConfiguredTilesPowered: z.boolean(),
    variants: z.array(circuitRotationVariantSchema).min(1).max(16).optional(),
  })
  .strict()
  .superRefine(refineCircuitRotationPuzzle);
export type PrecisionCircuitRotationServerConfig = z.infer<
  typeof precisionCircuitRotationServerConfigSchema
>;

export const precisionCircuitRotationAnswerSchema = z
  .object({
    tileQuarterTurns: z.record(
      z.string().min(1).max(64),
      z.number().int().min(0).max(3),
    ),
  })
  .strict();
export type PrecisionCircuitRotationAnswer = z.infer<
  typeof precisionCircuitRotationAnswerSchema
>;

// ---------------------------------------------------------------------------
// 17. logic.balance_scale
// ---------------------------------------------------------------------------

export const logicBalanceScaleClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    leftWeights: z.array(z.number().int().min(1).max(9)).min(1).max(4),
    rightKnownWeights: z.array(z.number().int().min(1).max(9)).max(4),
    optionWeights: z.array(z.number().int().min(1).max(9)).min(2).max(6),
  })
  .strict();
export type LogicBalanceScaleClientConfig = z.infer<
  typeof logicBalanceScaleClientConfigSchema
>;

export const logicBalanceScaleServerConfigSchema = z
  .object({
    leftWeights: z.array(z.number().int().min(1).max(9)).min(1).max(4),
    rightKnownWeights: z.array(z.number().int().min(1).max(9)).max(4),
    optionWeights: z.array(z.number().int().min(1).max(9)).min(2).max(6),
    correctWeight: z.number().int().min(1).max(9),
    variants: z
      .array(
        z
          .object({
            leftWeights: z.array(z.number().int().min(1).max(9)).min(1).max(4),
            rightKnownWeights: z.array(z.number().int().min(1).max(9)).max(4),
            optionWeights: z.array(z.number().int().min(1).max(9)).min(2).max(6),
            correctWeight: z.number().int().min(1).max(9),
          })
          .strict(),
      )
      .min(1)
      .max(32)
      .optional(),
  })
  .strict();
export type LogicBalanceScaleServerConfig = z.infer<
  typeof logicBalanceScaleServerConfigSchema
>;

export const logicBalanceScaleAnswerSchema = z
  .object({
    chosenWeight: z.number().int().min(1).max(9),
  })
  .strict();
export type LogicBalanceScaleAnswer = z.infer<typeof logicBalanceScaleAnswerSchema>;

// ---------------------------------------------------------------------------
// 18. focus.stroop
// ---------------------------------------------------------------------------

export const focusStroopClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    wordKey: translationKey,
    inkColorId: optionKey,
    optionKeys: z.array(optionKey).min(2).max(6),
  })
  .strict();
export type FocusStroopClientConfig = z.infer<typeof focusStroopClientConfigSchema>;

export const focusStroopServerConfigSchema = z
  .object({
    wordKey: translationKey,
    inkColorId: optionKey,
    optionKeys: z.array(optionKey).min(2).max(6),
    correctOptionKey: optionKey,
    variants: z
      .array(
        z
          .object({
            wordKey: translationKey,
            inkColorId: optionKey,
            optionKeys: z.array(optionKey).min(2).max(6),
            correctOptionKey: optionKey,
          })
          .strict(),
      )
      .min(1)
      .max(32)
      .optional(),
  })
  .strict();
export type FocusStroopServerConfig = z.infer<typeof focusStroopServerConfigSchema>;

export const focusStroopAnswerSchema = z
  .object({
    chosenOptionKey: optionKey,
  })
  .strict();
export type FocusStroopAnswer = z.infer<typeof focusStroopAnswerSchema>;

// ---------------------------------------------------------------------------
// 19. search.select_occurrences
// ---------------------------------------------------------------------------

export const searchSelectOccurrencesClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    columns: z.number().int().min(2).max(6),
    cells: z.array(z.string().min(1).max(8)).min(4).max(36),
    targetValue: z.string().min(1).max(8),
  })
  .strict();
export type SearchSelectOccurrencesClientConfig = z.infer<
  typeof searchSelectOccurrencesClientConfigSchema
>;

export const searchSelectOccurrencesServerConfigSchema = z
  .object({
    columns: z.number().int().min(2).max(6),
    cells: z.array(z.string().min(1).max(8)).min(4).max(36),
    targetValue: z.string().min(1).max(8),
    requiredIndices: z.array(z.number().int().min(0).max(35)).min(1).max(36),
    variants: z
      .array(
        z
          .object({
            columns: z.number().int().min(2).max(6),
            cells: z.array(z.string().min(1).max(8)).min(4).max(36),
            targetValue: z.string().min(1).max(8),
            requiredIndices: z.array(z.number().int().min(0).max(35)).min(1).max(36),
          })
          .strict(),
      )
      .min(1)
      .max(32)
      .optional(),
  })
  .strict();
export type SearchSelectOccurrencesServerConfig = z.infer<
  typeof searchSelectOccurrencesServerConfigSchema
>;

export const searchSelectOccurrencesAnswerSchema = z
  .object({
    selectedIndices: z.array(z.number().int().min(0).max(35)).min(0).max(36),
    final: z.boolean().optional(),
  })
  .strict();
export type SearchSelectOccurrencesAnswer = z.infer<
  typeof searchSelectOccurrencesAnswerSchema
>;

// ---------------------------------------------------------------------------
// Cross-engine validators
// ---------------------------------------------------------------------------

/** Runtime readiness for each engine: 'live' engines have evaluators; 'schema_only' have schemas but no runtime. */
export const ENGINE_RUNTIME_READINESS: Record<LaunchEngineId, 'live' | 'schema_only'> = {
  'reaction.wait_for_signal': 'live',
  'trap.no_touch': 'live',
  'gesture.reverse_swipe': 'live',
  'tap.precision': 'live',
  'memory.sequence': 'live',
  'hold.multitouch': 'live',
  'motion.shake': 'live',
  'motion.tilt_balance': 'live',
  'audio.cue': 'live',
  'social.pair_sync': 'live',
  'tactical.risk_choice': 'live',
  'trivia.multiple_choice': 'live',
  'geography.select_on_map': 'live',
  'focus.odd_one_out': 'live',
  'order.sequence_sort': 'live',
  'precision.maze_path': 'live',
  'precision.neon_cable': 'live',
  'gesture.fog_wipe': 'live',
  'precision.circuit_rotation': 'live',
  'logic.balance_scale': 'live',
  'focus.stroop': 'live',
  'search.select_occurrences': 'live',
};

type EngineSchemaPair = {
  client: z.ZodType;
  server: z.ZodType;
  answer: z.ZodType;
};

const ENGINE_SCHEMAS: Record<LaunchEngineId, EngineSchemaPair> = {
  'reaction.wait_for_signal': {
    client: reactionWaitForSignalClientConfigSchema,
    server: reactionWaitForSignalServerConfigSchema,
    answer: reactionWaitForSignalAnswerSchema,
  },
  'trap.no_touch': {
    client: trapNoTouchClientConfigSchema,
    server: trapNoTouchServerConfigSchema,
    answer: trapNoTouchAnswerSchema,
  },
  'gesture.reverse_swipe': {
    client: gestureReverseSwipeClientConfigSchema,
    server: gestureReverseSwipeServerConfigSchema,
    answer: gestureReverseSwipeAnswerSchema,
  },
  'tap.precision': {
    client: tapPrecisionClientConfigSchema,
    server: tapPrecisionServerConfigSchema,
    answer: tapPrecisionAnswerSchema,
  },
  'memory.sequence': {
    client: memorySequenceClientConfigSchema,
    server: memorySequenceServerConfigSchema,
    answer: memorySequenceAnswerSchema,
  },
  'hold.multitouch': {
    client: holdMultitouchClientConfigSchema,
    server: holdMultitouchServerConfigSchema,
    answer: holdMultitouchAnswerSchema,
  },
  'motion.shake': {
    client: motionShakeClientConfigSchema,
    server: motionShakeServerConfigSchema,
    answer: motionShakeAnswerSchema,
  },
  'motion.tilt_balance': {
    client: motionTiltBalanceClientConfigSchema,
    server: motionTiltBalanceServerConfigSchema,
    answer: motionTiltBalanceAnswerSchema,
  },
  'audio.cue': {
    client: audioCueClientConfigSchema,
    server: audioCueServerConfigSchema,
    answer: audioCueAnswerSchema,
  },
  'social.pair_sync': {
    client: socialPairSyncClientConfigSchema,
    server: socialPairSyncServerConfigSchema,
    answer: socialPairSyncAnswerSchema,
  },
  'tactical.risk_choice': {
    client: tacticalRiskChoiceClientConfigSchema,
    server: tacticalRiskChoiceServerConfigSchema,
    answer: tacticalRiskChoiceAnswerSchema,
  },
  'trivia.multiple_choice': {
    client: triviaMultipleChoiceClientConfigSchema,
    server: triviaMultipleChoiceServerConfigSchema,
    answer: triviaMultipleChoiceAnswerSchema,
  },
  'geography.select_on_map': {
    client: geographySelectOnMapClientConfigSchema,
    server: geographySelectOnMapServerConfigSchema,
    answer: geographySelectOnMapAnswerSchema,
  },
  'focus.odd_one_out': {
    client: focusOddOneOutClientConfigSchema,
    server: focusOddOneOutServerConfigSchema,
    answer: focusOddOneOutAnswerSchema,
  },
  'order.sequence_sort': {
    client: orderSequenceSortClientConfigSchema,
    server: orderSequenceSortServerConfigSchema,
    answer: orderSequenceSortAnswerSchema,
  },
  'precision.maze_path': {
    client: precisionMazePathClientConfigSchema,
    server: precisionMazePathServerConfigSchema,
    answer: precisionMazePathAnswerSchema,
  },
  'precision.neon_cable': {
    client: precisionNeonCableClientConfigSchema,
    server: precisionNeonCableServerConfigSchema,
    answer: precisionNeonCableAnswerSchema,
  },
  'gesture.fog_wipe': {
    client: gestureFogWipeClientConfigSchema,
    server: gestureFogWipeServerConfigSchema,
    answer: gestureFogWipeAnswerSchema,
  },
  'precision.circuit_rotation': {
    client: precisionCircuitRotationClientConfigSchema,
    server: precisionCircuitRotationServerConfigSchema,
    answer: precisionCircuitRotationAnswerSchema,
  },
  'logic.balance_scale': {
    client: logicBalanceScaleClientConfigSchema,
    server: logicBalanceScaleServerConfigSchema,
    answer: logicBalanceScaleAnswerSchema,
  },
  'focus.stroop': {
    client: focusStroopClientConfigSchema,
    server: focusStroopServerConfigSchema,
    answer: focusStroopAnswerSchema,
  },
  'search.select_occurrences': {
    client: searchSelectOccurrencesClientConfigSchema,
    server: searchSelectOccurrencesServerConfigSchema,
    answer: searchSelectOccurrencesAnswerSchema,
  },
};

export type ValidatedEngineConfigs =
  | {
      engineId: 'reaction.wait_for_signal';
      clientConfig: ReactionWaitForSignalClientConfig;
      serverConfig: ReactionWaitForSignalServerConfig;
    }
  | {
      engineId: 'trap.no_touch';
      clientConfig: TrapNoTouchClientConfig;
      serverConfig: TrapNoTouchServerConfig;
    }
  | {
      engineId: 'gesture.reverse_swipe';
      clientConfig: GestureReverseSwipeClientConfig;
      serverConfig: GestureReverseSwipeServerConfig;
    }
  | {
      engineId: 'tap.precision';
      clientConfig: TapPrecisionClientConfig;
      serverConfig: TapPrecisionServerConfig;
    }
  | {
      engineId: 'memory.sequence';
      clientConfig: MemorySequenceClientConfig;
      serverConfig: MemorySequenceServerConfig;
    }
  | {
      engineId: 'hold.multitouch';
      clientConfig: HoldMultitouchClientConfig;
      serverConfig: HoldMultitouchServerConfig;
    }
  | {
      engineId: 'motion.shake';
      clientConfig: MotionShakeClientConfig;
      serverConfig: MotionShakeServerConfig;
    }
  | {
      engineId: 'motion.tilt_balance';
      clientConfig: MotionTiltBalanceClientConfig;
      serverConfig: MotionTiltBalanceServerConfig;
    }
  | {
      engineId: 'audio.cue';
      clientConfig: AudioCueClientConfig;
      serverConfig: AudioCueServerConfig;
    }
  | {
      engineId: 'social.pair_sync';
      clientConfig: SocialPairSyncClientConfig;
      serverConfig: SocialPairSyncServerConfig;
    }
  | {
      engineId: 'tactical.risk_choice';
      clientConfig: TacticalRiskChoiceClientConfig;
      serverConfig: TacticalRiskChoiceServerConfig;
    }
  | {
      engineId: 'trivia.multiple_choice';
      clientConfig: TriviaMultipleChoiceClientConfig;
      serverConfig: TriviaMultipleChoiceServerConfig;
    }
  | {
      engineId: 'geography.select_on_map';
      clientConfig: GeographySelectOnMapClientConfig;
      serverConfig: GeographySelectOnMapServerConfig;
    }
  | {
      engineId: 'focus.odd_one_out';
      clientConfig: FocusOddOneOutClientConfig;
      serverConfig: FocusOddOneOutServerConfig;
    }
  | {
      engineId: 'order.sequence_sort';
      clientConfig: OrderSequenceSortClientConfig;
      serverConfig: OrderSequenceSortServerConfig;
    }
  | {
      engineId: 'precision.maze_path';
      clientConfig: PrecisionMazePathClientConfig;
      serverConfig: PrecisionMazePathServerConfig;
    }
  | {
      engineId: 'precision.neon_cable';
      clientConfig: PrecisionNeonCableClientConfig;
      serverConfig: PrecisionNeonCableServerConfig;
    }
  | {
      engineId: 'gesture.fog_wipe';
      clientConfig: GestureFogWipeClientConfig;
      serverConfig: GestureFogWipeServerConfig;
    }
  | {
      engineId: 'precision.circuit_rotation';
      clientConfig: PrecisionCircuitRotationClientConfig;
      serverConfig: PrecisionCircuitRotationServerConfig;
    }
  | {
      engineId: 'logic.balance_scale';
      clientConfig: LogicBalanceScaleClientConfig;
      serverConfig: LogicBalanceScaleServerConfig;
    }
  | {
      engineId: 'focus.stroop';
      clientConfig: FocusStroopClientConfig;
      serverConfig: FocusStroopServerConfig;
    }
  | {
      engineId: 'search.select_occurrences';
      clientConfig: SearchSelectOccurrencesClientConfig;
      serverConfig: SearchSelectOccurrencesServerConfig;
    };

export type ValidatedEngineAnswer =
  | {
      engineId: 'reaction.wait_for_signal';
      answer: ReactionWaitForSignalAnswer;
    }
  | { engineId: 'trap.no_touch'; answer: TrapNoTouchAnswer }
  | {
      engineId: 'gesture.reverse_swipe';
      answer: GestureReverseSwipeAnswer;
    }
  | { engineId: 'tap.precision'; answer: TapPrecisionAnswer }
  | { engineId: 'memory.sequence'; answer: MemorySequenceAnswer }
  | { engineId: 'hold.multitouch'; answer: HoldMultitouchAnswer }
  | { engineId: 'motion.shake'; answer: MotionShakeAnswer }
  | { engineId: 'motion.tilt_balance'; answer: MotionTiltBalanceAnswer }
  | { engineId: 'audio.cue'; answer: AudioCueAnswer }
  | { engineId: 'social.pair_sync'; answer: SocialPairSyncAnswer }
  | { engineId: 'tactical.risk_choice'; answer: TacticalRiskChoiceAnswer }
  | { engineId: 'trivia.multiple_choice'; answer: TriviaMultipleChoiceAnswer }
  | { engineId: 'geography.select_on_map'; answer: GeographySelectOnMapAnswer }
  | { engineId: 'focus.odd_one_out'; answer: FocusOddOneOutAnswer }
  | { engineId: 'order.sequence_sort'; answer: OrderSequenceSortAnswer }
  | { engineId: 'precision.maze_path'; answer: PrecisionMazePathAnswer }
  | { engineId: 'precision.neon_cable'; answer: PrecisionNeonCableAnswer }
  | { engineId: 'gesture.fog_wipe'; answer: GestureFogWipeAnswer }
  | {
      engineId: 'precision.circuit_rotation';
      answer: PrecisionCircuitRotationAnswer;
    }
  | { engineId: 'logic.balance_scale'; answer: LogicBalanceScaleAnswer }
  | { engineId: 'focus.stroop'; answer: FocusStroopAnswer }
  | { engineId: 'search.select_occurrences'; answer: SearchSelectOccurrencesAnswer };

function assertKnownEngineId(engineId: string): LaunchEngineId {
  return launchEngineIdSchema.parse(engineId);
}

/**
 * Parse and cross-check client/server configs for a launch engine.
 * Enforces reverse-swipe opposite directions, precision targetId subset,
 * and memory/hold timing parity where both sides declare the same fields.
 */
export function validateEngineConfigs(
  engineId: string,
  clientConfig: unknown,
  serverConfig: unknown,
): ValidatedEngineConfigs {
  const id = assertKnownEngineId(engineId);
  const pair = ENGINE_SCHEMAS[id];
  const client = pair.client.parse(clientConfig);
  const server = pair.server.parse(serverConfig);

  if (id === 'gesture.reverse_swipe') {
    const c = client as GestureReverseSwipeClientConfig;
    const s = server as GestureReverseSwipeServerConfig;
    if (s.requiredDirection !== oppositeSwipeDirection(c.displayedDirection)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message:
            'serverConfig.requiredDirection must be opposite of clientConfig.displayedDirection',
          path: ['serverConfig', 'requiredDirection'],
        },
      ]);
    }
  }

  if (id === 'tap.precision') {
    const c = client as TapPrecisionClientConfig;
    const s = server as TapPrecisionServerConfig;
    if (c.attemptCount !== s.attemptCount) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server attemptCount must match',
          path: ['serverConfig', 'attemptCount'],
        },
      ]);
    }
    const visible = new Set(c.targets.map((t) => t.id));
    for (const tid of s.targetIds) {
      if (!visible.has(tid)) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: `server targetId "${tid}" is not present in client targets`,
            path: ['serverConfig', 'targetIds'],
          },
        ]);
      }
    }
  }

  if (id === 'memory.sequence') {
    const c = client as MemorySequenceClientConfig;
    const s = server as MemorySequenceServerConfig;
    if (c.previewMs !== s.previewMs) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server previewMs must match',
          path: ['serverConfig', 'previewMs'],
        },
      ]);
    }
    const clientOpts = new Set(c.optionKeys);
    const serverOpts = new Set(s.optionKeys);
    if (
      clientOpts.size !== serverOpts.size ||
      [...clientOpts].some((k) => !serverOpts.has(k))
    ) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message:
            'client and server optionKeys must be the same set (order may differ)',
          path: ['clientConfig', 'optionKeys'],
        },
      ]);
    }
  }

  if (id === 'hold.multitouch') {
    const c = client as HoldMultitouchClientConfig;
    const s = server as HoldMultitouchServerConfig;
    if (c.holdMs !== s.holdMs) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server holdMs must match',
          path: ['serverConfig', 'holdMs'],
        },
      ]);
    }
  }

  if (id === 'social.pair_sync') {
    const c = client as SocialPairSyncClientConfig;
    const s = server as SocialPairSyncServerConfig;
    const cKeys = new Set(c.partnerRoleKeys);
    const sKeys = new Set(s.partnerRoleKeys);
    if (
      cKeys.size !== sKeys.size ||
      [...cKeys].some((k) => !sKeys.has(k))
    ) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server partnerRoleKeys must be the same set',
          path: ['serverConfig', 'partnerRoleKeys'],
        },
      ]);
    }
  }

  if (id === 'tactical.risk_choice') {
    const c = client as TacticalRiskChoiceClientConfig;
    const s = server as TacticalRiskChoiceServerConfig;
    const cOpts = new Set(c.optionKeys);
    const sOpts = new Set(s.optionKeys);
    if (
      cOpts.size !== sOpts.size ||
      [...cOpts].some((k) => !sOpts.has(k))
    ) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server optionKeys must be the same set',
          path: ['serverConfig', 'optionKeys'],
        },
      ]);
    }
  }

  if (id === 'precision.neon_cable') {
    const c = client as PrecisionNeonCableClientConfig;
    const s = server as PrecisionNeonCableServerConfig;
    if (c.correctSocketId !== s.correctSocketId) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server correctSocketId must match',
          path: ['serverConfig', 'correctSocketId'],
        },
      ]);
    }
    if (!s.sockets.some((sock) => sock.socketId === s.correctSocketId)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'correctSocketId must reference a socket in sockets',
          path: ['serverConfig', 'correctSocketId'],
        },
      ]);
    }
    if (c.wrongDropPolicy !== s.wrongDropPolicy) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server wrongDropPolicy must match',
          path: ['serverConfig', 'wrongDropPolicy'],
        },
      ]);
    }
  }

  if (id === 'gesture.fog_wipe') {
    const c = client as GestureFogWipeClientConfig;
    const s = server as GestureFogWipeServerConfig;
    if (c.clearanceRatioMin !== s.clearanceRatioMin) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server clearanceRatioMin must match',
          path: ['serverConfig', 'clearanceRatioMin'],
        },
      ]);
    }
    if (c.assetIds.revealContent !== s.assetIds.revealContent) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: 'client and server assetIds.revealContent must match',
          path: ['serverConfig', 'assetIds', 'revealContent'],
        },
      ]);
    }
    if (
      s.revealContentVariants &&
      s.revealContentVariants.length > 0 &&
      s.assetIds.revealContent !== s.revealContentVariants[0]
    ) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message:
            'assetIds.revealContent must equal revealContentVariants[0]',
          path: ['serverConfig', 'assetIds', 'revealContent'],
        },
      ]);
    }
  }

  if (id === 'precision.circuit_rotation') {
    const c = client as PrecisionCircuitRotationClientConfig;
    const s = server as PrecisionCircuitRotationServerConfig;
    for (const field of [
      'grid',
      'source',
      'target',
      'tiles',
      'stationaryConnections',
    ] as const) {
      if (JSON.stringify(c[field]) !== JSON.stringify(s[field])) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: `client and server ${field} must match`,
            path: ['serverConfig', field],
          },
        ]);
      }
    }
  }

  return {
    engineId: id,
    clientConfig: client,
    serverConfig: server,
  } as ValidatedEngineConfigs;
}

/** Parse an answer object for a launch engine. */
export function validateEngineAnswer(
  engineId: string,
  answer: unknown,
): ValidatedEngineAnswer {
  const id = assertKnownEngineId(engineId);
  const parsed = ENGINE_SCHEMAS[id].answer.parse(answer);
  return { engineId: id, answer: parsed } as ValidatedEngineAnswer;
}
