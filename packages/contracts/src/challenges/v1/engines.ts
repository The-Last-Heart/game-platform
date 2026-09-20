import { z } from "zod";

/** Launch pack engine ids owned by LH-007. */
export const LAUNCH_ENGINE_IDS = [
  "reaction.wait_for_signal",
  "trap.no_touch",
  "gesture.reverse_swipe",
  "tap.precision",
  "memory.sequence",
  "hold.multitouch",
  // LH-009 schema-only engines (Studio forms only — no runtime evaluator yet)
  "motion.shake",
  "motion.tilt_balance",
  "audio.cue",
  "social.pair_sync",
  "tactical.risk_choice",
  // Challenges 31–38
  "trivia.multiple_choice",
  "audio.multiple_choice",
  /** Common Word — الكلمة المشتركة (engine id is dotted; product type is common_word). */
  "trivia.common_word",
  /** Decode the Word — فكّ الشفرة (engine id dotted; product type symbol_cipher_word). */
  "trivia.symbol_cipher_word",
  "geography.select_on_map",
  "focus.odd_one_out",
  /** Mirror of Deception — مرآة الخداع (product type vertical_reflection). */
  "focus.vertical_reflection",
  "order.sequence_sort",
  "precision.maze_path",
  "precision.neon_cable",
  "gesture.fog_wipe",
  "precision.circuit_rotation",
  "precision.cable_untangle",
  "logic.balance_scale",
  "logic.complete_sum",
  "logic.three_doors",
  "focus.stroop",
  "search.select_occurrences",
  "social.pass_the_pulse",
  "precision.ring_lock",
  "laser.routing",
] as const;

export const launchEngineIdSchema = z.enum(LAUNCH_ENGINE_IDS);
export type LaunchEngineId = z.infer<typeof launchEngineIdSchema>;

const translationKey = z.string().min(1).max(256);
const unitFraction = z.number().min(0).max(1);
const positiveMs = z.number().int().positive().max(60_000);
const nonNegMs = z.number().int().nonnegative().max(60_000);
const targetId = z.string().min(1).max(64);
const optionKey = z.string().min(1).max(128);

export const swipeDirectionSchema = z.enum(["up", "down", "left", "right"]);
export type SwipeDirection = z.infer<typeof swipeDirectionSchema>;

const OPPOSITE_DIRECTION: Record<SwipeDirection, SwipeDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
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
        message: "signalDelayRangeMs.max must be >= min",
        path: ["signalDelayRangeMs", "max"],
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
        message: "zone.x + zone.width must be <= 1",
        path: ["width"],
      });
    }
    if (zone.y + zone.height > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "zone.y + zone.height must be <= 1",
        path: ["height"],
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
    /** Normalized playfield speed range. Flutter falls back to 0.18–0.40. */
    speedMin: z.number().min(0.04).max(1).optional(),
    speedMax: z.number().min(0.04).max(1.5).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.targets.map((t) => t.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targets must have unique ids",
        path: ["targets"],
      });
    }
    if (
      value.speedMin != null &&
      value.speedMax != null &&
      value.speedMin > value.speedMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "speedMin must be <= speedMax",
        path: ["speedMin"],
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
        message: "targetIds must be unique",
        path: ["targetIds"],
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
        message: "object group keys must be unique",
        path: ["keys"],
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
        message: "optionKeys must be unique",
        path: ["optionKeys"],
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
        message: "optionKeys must be unique",
        path: ["optionKeys"],
      });
    }
    const allowed = new Set(value.optionKeys);
    for (let i = 0; i < value.sequence.length; i++) {
      const key = value.sequence[i]!;
      if (!allowed.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `sequence[${i}] is not in optionKeys`,
          path: ["sequence", i],
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
            path: ["objectGroups", g, "keys"],
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
export type MotionShakeClientConfig = z.infer<
  typeof motionShakeClientConfigSchema
>;

export const motionShakeServerConfigSchema = z
  .object({
    requiredShakeCount: z.number().int().positive().max(100),
    noiseThreshold: z.number().min(0).max(100).default(5),
  })
  .strict();
export type MotionShakeServerConfig = z.infer<
  typeof motionShakeServerConfigSchema
>;

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
  "circle",
  "square",
  "diamond",
  "heart",
]);
export type MotionTiltTargetShape = z.infer<typeof motionTiltTargetShapeSchema>;

export const motionTiltBalanceClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
  })
  .strict();
export type MotionTiltBalanceClientConfig = z.infer<
  typeof motionTiltBalanceClientConfigSchema
>;

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
            targetShape: motionTiltTargetShapeSchema.default("circle"),
          })
          .strict(),
      )
      .min(1)
      .max(12)
      .optional(),
  })
  .strict();
export type MotionTiltBalanceServerConfig = z.infer<
  typeof motionTiltBalanceServerConfigSchema
>;

export const motionTiltBalanceAnswerSchema = z
  .object({
    finalX: z.number().finite(),
    finalY: z.number().finite(),
    heldMs: nonNegMs,
  })
  .strict();
export type MotionTiltBalanceAnswer = z.infer<
  typeof motionTiltBalanceAnswerSchema
>;

// ---------------------------------------------------------------------------
// 9. audio.cue
// ---------------------------------------------------------------------------

export const audioCueClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    visualFallbackKey: translationKey,
    hapticFallbackKey: translationKey,
    /** Gap between audible/visual pulses. */
    pulseIntervalMs: positiveMs.optional(),
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
export type SocialPairSyncClientConfig = z.infer<
  typeof socialPairSyncClientConfigSchema
>;

export const socialPairSyncServerConfigSchema = z
  .object({
    partnerRoleKeys: z.array(translationKey).min(1).max(4),
    /** How long both players must tap together (player-facing X seconds). */
    togetherMs: positiveMs,
    syncWindowMs: positiveMs,
  })
  .strict();
export type SocialPairSyncServerConfig = z.infer<
  typeof socialPairSyncServerConfigSchema
>;

export const socialPairSyncAnswerSchema = z
  .object({
    synced: z.boolean(),
    /** How long the player held the sync control (ms). */
    heldMs: z.number().int().nonnegative().max(60_000).optional(),
    /** True while the player is currently pressing the sync control. */
    holding: z.boolean().optional(),
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
        message: "optionKeys must be unique",
        path: ["optionKeys"],
      });
    }
  });
export type TacticalRiskChoiceClientConfig = z.infer<
  typeof tacticalRiskChoiceClientConfigSchema
>;

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
        message: "riskWeights length must match optionKeys length",
        path: ["riskWeights"],
      });
    }
  });
export type TacticalRiskChoiceServerConfig = z.infer<
  typeof tacticalRiskChoiceServerConfigSchema
>;

export const tacticalRiskChoiceAnswerSchema = z
  .object({
    chosenOptionKey: optionKey,
  })
  .strict();
export type TacticalRiskChoiceAnswer = z.infer<
  typeof tacticalRiskChoiceAnswerSchema
>;

// ---------------------------------------------------------------------------
// 12. trivia.multiple_choice
// ---------------------------------------------------------------------------

const triviaLocaleCopySchema = z
  .object({
    ar: z.string().min(1).max(500),
    en: z.string().min(1).max(500).optional(),
  })
  .strict();

export const triviaQuestionSchema = z
  .object({
    questionKey: translationKey,
    optionKeys: z.array(optionKey).min(2).max(6),
    correctOptionKey: optionKey,
    /** Admin-authored player copy. Pinned into the round clientConfig at start. */
    questionCopy: triviaLocaleCopySchema.optional(),
    optionCopy: z.record(triviaLocaleCopySchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.optionKeys).size !== value.optionKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "optionKeys must be unique",
        path: ["optionKeys"],
      });
    }
    if (!value.optionKeys.includes(value.correctOptionKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correctOptionKey must be one of optionKeys",
        path: ["correctOptionKey"],
      });
    }
    if (value.optionCopy) {
      for (const key of Object.keys(value.optionCopy)) {
        if (!value.optionKeys.includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `optionCopy.${key} is not in optionKeys`,
            path: ["optionCopy", key],
          });
        }
      }
    }
  });
export type TriviaQuestion = z.infer<typeof triviaQuestionSchema>;

export const triviaMultipleChoiceClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    questionKey: translationKey,
    optionKeys: z.array(optionKey).min(2).max(6),
    footerKey: translationKey.optional(),
    /** Round-pinned display text for the selected question (Arabic-first). */
    questionText: z.string().min(1).max(500).optional(),
    optionTexts: z.record(z.string().min(1).max(500)).optional(),
  })
  .strict();
export type TriviaMultipleChoiceClientConfig = z.infer<
  typeof triviaMultipleChoiceClientConfigSchema
>;

export const triviaMultipleChoiceServerConfigSchema = z
  .object({
    questions: z.array(triviaQuestionSchema).min(1).max(64),
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
// 12b. audio.multiple_choice (Guess the Audio — خَمّن الصوت)
// Reuses trivia option/answer contracts. Correct option never leaves serverConfig.
// ---------------------------------------------------------------------------

export const audioAnswerTargetSchema = z.enum(["artist", "track"]);
export type AudioAnswerTarget = z.infer<typeof audioAnswerTargetSchema>;

const opaqueAssetId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]{1,126}$/);

/** Default operator cap when `maxAudioDurationMs` is omitted (exactly 7.000s is valid). */
export const AUDIO_CLIP_DEFAULT_MAX_DURATION_MS = 7000;
/** Absolute ingest/publish ceiling (matches the challenge timer hard max). */
export const AUDIO_CLIP_HARD_MAX_DURATION_MS = 15_000;
/** Smallest allowed operator-configured clip cap. */
export const AUDIO_CLIP_MIN_MAX_DURATION_MS = 500;

const audioClipDurationMs = z
  .number()
  .int()
  .positive()
  .max(AUDIO_CLIP_HARD_MAX_DURATION_MS);

const audioClipMaxDurationMs = z
  .number()
  .int()
  .min(AUDIO_CLIP_MIN_MAX_DURATION_MS)
  .max(AUDIO_CLIP_HARD_MAX_DURATION_MS);

export function resolveAudioClipMaxDurationMs(requested: unknown): number {
  const n =
    typeof requested === "number"
      ? requested
      : typeof requested === "string"
        ? Number(requested)
        : Number.NaN;
  if (!Number.isFinite(n)) {
    return AUDIO_CLIP_DEFAULT_MAX_DURATION_MS;
  }
  return Math.min(
    AUDIO_CLIP_HARD_MAX_DURATION_MS,
    Math.max(AUDIO_CLIP_MIN_MAX_DURATION_MS, Math.round(n)),
  );
}

export const audioMcQuestionSchema = z
  .object({
    questionKey: translationKey,
    optionKeys: z.array(optionKey).min(2).max(6),
    correctOptionKey: optionKey,
    answerTarget: audioAnswerTargetSchema,
    audioAssetId: opaqueAssetId,
    visualizationAssetId: opaqueAssetId,
    audioDurationMs: audioClipDurationMs,
    analysisSchemaVersion: z.number().int().positive().optional(),
    questionCopy: triviaLocaleCopySchema.optional(),
    optionCopy: z.record(triviaLocaleCopySchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.optionKeys).size !== value.optionKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "optionKeys must be unique",
        path: ["optionKeys"],
      });
    }
    if (!value.optionKeys.includes(value.correctOptionKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correctOptionKey must be one of optionKeys",
        path: ["correctOptionKey"],
      });
    }
    if (value.optionCopy) {
      for (const key of Object.keys(value.optionCopy)) {
        if (!value.optionKeys.includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `optionCopy.${key} is not in optionKeys`,
            path: ["optionCopy", key],
          });
        }
      }
    }
  });
export type AudioMcQuestion = z.infer<typeof audioMcQuestionSchema>;

export const audioMultipleChoiceClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    titleKey: translationKey.optional(),
    questionKey: translationKey,
    optionKeys: z.array(optionKey).min(2).max(6),
    footerKey: translationKey.optional(),
    targetBadgeKey: translationKey.optional(),
    answerTarget: audioAnswerTargetSchema.optional(),
    audioAssetId: opaqueAssetId.optional(),
    visualizationAssetId: opaqueAssetId.optional(),
    audioDurationMs: audioClipDurationMs.optional(),
    playAtMs: z.number().int().nonnegative().optional(),
    analysisSchemaVersion: z.number().int().positive().optional(),
    questionText: z.string().min(1).max(500).optional(),
    optionTexts: z.record(z.string().min(1).max(500)).optional(),
  })
  .strict();
export type AudioMultipleChoiceClientConfig = z.infer<
  typeof audioMultipleChoiceClientConfigSchema
>;

export const audioMultipleChoiceServerConfigSchema = z
  .object({
    questions: z.array(audioMcQuestionSchema).min(1).max(64),
    maxAudioDurationMs: audioClipMaxDurationMs.optional(),
    questionKey: translationKey.optional(),
    optionKeys: z.array(optionKey).min(2).max(6).optional(),
    correctOptionKey: optionKey.optional(),
    answerTarget: audioAnswerTargetSchema.optional(),
    audioAssetId: opaqueAssetId.optional(),
    visualizationAssetId: opaqueAssetId.optional(),
    audioDurationMs: audioClipDurationMs.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const maxMs =
      value.maxAudioDurationMs ?? AUDIO_CLIP_DEFAULT_MAX_DURATION_MS;
    value.questions.forEach((question, index) => {
      if (question.audioDurationMs > maxMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `audioDurationMs must be <= maxAudioDurationMs (${maxMs})`,
          path: ["questions", index, "audioDurationMs"],
        });
      }
    });
  });
export type AudioMultipleChoiceServerConfig = z.infer<
  typeof audioMultipleChoiceServerConfigSchema
>;

/** Same command body as trivia — reused, not a parallel engine. */
export const audioMultipleChoiceAnswerSchema =
  triviaMultipleChoiceAnswerSchema;
export type AudioMultipleChoiceAnswer = TriviaMultipleChoiceAnswer;

// ---------------------------------------------------------------------------
// 12c. trivia.common_word (Common Word — الكلمة المشتركة)
// One Studio challenge with a question bank (like trivia.multiple_choice).
// Round materialization picks one question; relationships stay server-only.
// ---------------------------------------------------------------------------

/** Approved programmatic clue motifs. Never encode the correct answer. */
export const COMMON_WORD_VISUAL_HINTS = [
  "needle",
  "storm",
  "water",
  "thread",
  "cloud",
  "drop",
  "neutral",
] as const;
export const commonWordVisualHintSchema = z.enum(COMMON_WORD_VISUAL_HINTS);
export type CommonWordVisualHint = z.infer<typeof commonWordVisualHintSchema>;

const opaqueClueId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]{0,62}$/i);

export const commonWordClueSchema = z
  .object({
    clueId: opaqueClueId,
    textCopy: triviaLocaleCopySchema,
    /** Private authoring metadata — never mirrored into clientConfig. */
    relationshipCopy: triviaLocaleCopySchema,
    visualHint: commonWordVisualHintSchema.optional(),
  })
  .strict();
export type CommonWordClue = z.infer<typeof commonWordClueSchema>;

const commonWordCluesTupleSchema = z
  .tuple([
    commonWordClueSchema,
    commonWordClueSchema,
    commonWordClueSchema,
  ])
  .superRefine((clues, ctx) => {
    const ids = clues.map((c) => c.clueId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clueId values must be unique",
        path: ["clueId"],
      });
    }
    const normalized = clues.map((c) =>
      c.textCopy.ar.trim().replace(/\s+/g, " "),
    );
    if (normalized.some((t) => t.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "each clue requires non-empty Arabic text",
        path: ["textCopy", "ar"],
      });
    }
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clue texts must be distinct after trim/normalization",
        path: ["textCopy", "ar"],
      });
    }
    for (const [index, clue] of clues.entries()) {
      if (!clue.relationshipCopy.ar.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "relationship explanation (Arabic) is required",
          path: [index, "relationshipCopy", "ar"],
        });
      }
    }
  });

export const commonWordQuestionSchema = z
  .object({
    questionKey: translationKey,
    clues: commonWordCluesTupleSchema,
    optionKeys: z.array(optionKey).min(2).max(6),
    correctOptionKey: optionKey,
    optionCopy: z.record(triviaLocaleCopySchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.optionKeys).size !== value.optionKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "optionKeys must be unique",
        path: ["optionKeys"],
      });
    }
    const normalizedOptions = value.optionKeys.map((key) => {
      const copy = value.optionCopy?.[key];
      const ar = copy?.ar?.trim().replace(/\s+/g, " ") ?? "";
      return ar || key;
    });
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "option texts must be distinct after trim/normalization",
        path: ["optionCopy"],
      });
    }
    if (!value.optionKeys.includes(value.correctOptionKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correctOptionKey must be one of optionKeys",
        path: ["correctOptionKey"],
      });
    }
    if (value.optionCopy) {
      for (const key of Object.keys(value.optionCopy)) {
        if (!value.optionKeys.includes(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `optionCopy.${key} is not in optionKeys`,
            path: ["optionCopy", key],
          });
        }
      }
    }
  });
export type CommonWordQuestion = z.infer<typeof commonWordQuestionSchema>;

export const commonWordClientClueSchema = z
  .object({
    id: opaqueClueId,
    text: z.string().min(1).max(200),
    visualHint: commonWordVisualHintSchema.optional(),
  })
  .strict();
export type CommonWordClientClue = z.infer<typeof commonWordClientClueSchema>;

export const commonWordClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    titleKey: translationKey.optional(),
    titleText: z.string().min(1).max(200).optional(),
    instructionText: z.string().min(1).max(500).optional(),
    questionKey: translationKey.optional(),
    clues: z.array(commonWordClientClueSchema).length(3),
    optionKeys: z.array(optionKey).min(2).max(6),
    optionTexts: z.record(z.string().min(1).max(500)).optional(),
    footerKey: translationKey.optional(),
    /** Looping bed from the content pack (never bundled in the APK). */
    backgroundSfxAssetId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type CommonWordClientConfig = z.infer<
  typeof commonWordClientConfigSchema
>;

export const commonWordServerConfigSchema = z
  .object({
    /** Shared challenge chrome shown for every question in the bank. */
    titleCopy: triviaLocaleCopySchema.optional(),
    instructionCopy: triviaLocaleCopySchema.optional(),
    questions: z.array(commonWordQuestionSchema).min(1).max(64),
    /** Pinned fields after materialize (optional until round start). */
    questionKey: translationKey.optional(),
    optionKeys: z.array(optionKey).min(2).max(6).optional(),
    correctOptionKey: optionKey.optional(),
  })
  .strict();
export type CommonWordServerConfig = z.infer<
  typeof commonWordServerConfigSchema
>;

/** Same command body as trivia — reused, not a parallel answer system. */
export const commonWordAnswerSchema = triviaMultipleChoiceAnswerSchema;
export type CommonWordAnswer = TriviaMultipleChoiceAnswer;

// ---------------------------------------------------------------------------
// 12d. logic.three_doors (Door of Truth — باب الحقيقة)
// Structured predicate bank; solver validates unique solution at publish time.
// Correct door stays server-only until the existing result flow reveals it.
// ---------------------------------------------------------------------------

export {
  THREE_DOORS_ENGINE_ID,
  THREE_DOORS_CHALLENGE_TYPE,
  DOOR_IDS,
  DOOR_TRUTH_RULES,
  THREE_DOORS_REFERENCE_QUESTION,
  THREE_DOORS_STATEMENT_TEMPLATES,
  THREE_DOORS_INSTRUCTION_KEYS,
  THREE_DOORS_INSTRUCTION_COPY,
  THREE_DOORS_TITLE_COPY,
  THREE_DOORS_STATEMENT_SOFT_MAX_CHARS,
  doorIdSchema,
  doorTruthRuleSchema,
  doorPredicateSchema,
  doorStatementDefinitionSchema,
  threeDoorsQuestionSchema,
  threeDoorsPublicDoorSchema,
  threeDoorsClientConfigSchema,
  threeDoorsServerConfigSchema,
  threeDoorsAnswerSchema,
  parseThreeDoorsClientConfig,
  parseThreeDoorsServerConfig,
  parseThreeDoorsAnswer,
  assertThreeDoorsBankUnique,
  assertThreeDoorsQuestionUnique,
  evaluateDoorPredicate,
  satisfiesTruthRule,
  solveThreeDoorsQuestion,
  renderDoorPredicateStatement,
  buildThreeDoorsPublicDoors,
  threeDoorsInstructionText,
  threeDoorsStatementMayOverflow,
} from "./three-doors-logic";
export type {
  DoorId,
  DoorTruthRule,
  DoorPredicate,
  DoorStatementDefinition,
  ThreeDoorsQuestion,
  ThreeDoorsPublicDoor,
  ThreeDoorsClientConfig,
  ThreeDoorsServerConfig,
  ThreeDoorsAnswer,
  ThreeDoorsTruthRow,
  ThreeDoorsSolveReport,
  ThreeDoorsLocale,
} from "./three-doors-logic";

import {
  threeDoorsAnswerSchema,
  threeDoorsClientConfigSchema,
  threeDoorsServerConfigSchema,
  type ThreeDoorsAnswer,
  type ThreeDoorsClientConfig,
  type ThreeDoorsServerConfig,
} from "./three-doors-logic";

// ---------------------------------------------------------------------------
// 12e. trivia.symbol_cipher_word (Decode the Word — فكّ الشفرة)
// Symbol→letter key + encoded sequence; server derives encoding at publish.
// ---------------------------------------------------------------------------

export {
  SYMBOL_CIPHER_WORD_ENGINE_ID,
  SYMBOL_CIPHER_WORD_CHALLENGE_TYPE,
  SYMBOL_CIPHER_WORD_BACKGROUND_ASSET_ID,
  SYMBOL_CIPHER_WORD_TITLE_COPY,
  SYMBOL_CIPHER_WORD_INSTRUCTION_COPY,
  SYMBOL_CIPHER_WORD_REFERENCE_QUESTION,
  CIPHER_SYMBOL_IDS,
  CIPHER_SYMBOL_STYLES,
  CIPHER_KEY_SLOT_STYLES,
  SYMBOL_CIPHER_ANSWER_GRAPHEME_COUNT,
  SYMBOL_CIPHER_KEY_SLOT_COUNT,
  SYMBOL_CIPHER_OPTION_COUNT,
  cipherSymbolIdSchema,
  cipherSymbolStyleSchema,
  cipherKeyMappingSchema,
  symbolCipherWordQuestionSchema,
  symbolCipherPublicKeyMappingSchema,
  symbolCipherWordClientConfigSchema,
  symbolCipherWordServerConfigSchema,
  symbolCipherWordAnswerSchema,
  normalizeArabicCipherText,
  arabicGraphemes,
  isSupportedArabicCipherLetter,
  buildCipherLookup,
  encodeSymbolCipherAnswer,
  decodeSymbolCipherSequence,
  logicalIndexToVisualLtrIndex,
  visualLtrIndexToLogicalIndex,
  completeCipherKeyMappings,
  shuffleCipherArray,
  buildSymbolCipherQuestion,
} from "./symbol-cipher-logic";
export type {
  CipherSymbolId,
  CipherSymbolStyle,
  CipherKeyMapping,
  SymbolCipherWordQuestion,
  SymbolCipherWordClientConfig,
  SymbolCipherWordServerConfig,
  SymbolCipherWordAnswer,
} from "./symbol-cipher-logic";

import {
  symbolCipherWordAnswerSchema,
  symbolCipherWordClientConfigSchema,
  symbolCipherWordServerConfigSchema,
  type SymbolCipherWordAnswer,
  type SymbolCipherWordClientConfig,
  type SymbolCipherWordServerConfig,
} from "./symbol-cipher-logic";

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

export const geographyMapQuestionSchema = z
  .object({
    mapId: z.string().min(1).max(64),
    targetRegionId: z.string().min(1).max(64),
    targetLabelKey: translationKey.optional(),
  })
  .strict();
export type GeographyMapQuestion = z.infer<typeof geographyMapQuestionSchema>;

export const geographySelectOnMapServerConfigSchema = z
  .object({
    maps: z.array(geographyMapSchema).min(1).max(32),
    questions: z.array(geographyMapQuestionSchema).min(1).max(128).optional(),
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
// 14b. focus.vertical_reflection (Mirror of Deception — مرآة الخداع)
// Normalized vector shapes; correct answer derived from vertical reflection.
// ---------------------------------------------------------------------------

export {
  VERTICAL_REFLECTION_ENGINE_ID,
  VERTICAL_REFLECTION_CHALLENGE_TYPE,
  VERTICAL_REFLECTION_GENERATOR_VERSION,
  VERTICAL_REFLECTION_GEOMETRY_TOLERANCE,
  VERTICAL_REFLECTION_MAX_POLYGONS,
  VERTICAL_REFLECTION_MAX_VERTICES_PER_POLYGON,
  VERTICAL_REFLECTION_MAX_MARKERS,
  VERTICAL_REFLECTION_CANDIDATE_COUNT,
  VERTICAL_REFLECTION_TITLE_COPY,
  VERTICAL_REFLECTION_INSTRUCTION_COPY,
  VERTICAL_REFLECTION_TEMPLATE_IDS,
  VERTICAL_REFLECTION_REFERENCE_QUESTION,
  DISTRACTOR_TRANSFORMS,
  SHAPE_MARKER_TYPES,
  SHAPE_MARKER_COLOR_ROLES,
  normalizedPointSchema,
  shapePolygonSchema,
  shapeMarkerSchema,
  reflectionShapeSchema,
  distractorTransformSchema,
  verticalReflectionTemplateIdSchema,
  verticalReflectionQuestionSchema,
  verticalReflectionPublicCandidateSchema,
  verticalReflectionClientConfigSchema,
  verticalReflectionServerConfigSchema,
  verticalReflectionAnswerSchema,
  parseVerticalReflectionClientConfig,
  parseVerticalReflectionServerConfig,
  parseVerticalReflectionAnswer,
  reflectPointVertical,
  reflectPointHorizontal,
  rotatePoint180,
  reflectShapeVertical,
  reflectShapeHorizontal,
  rotateShape180,
  cloneShape,
  canonicalizeShape,
  shapesEqual,
  polygonArea,
  polygonSelfIntersects,
  pointInPolygon,
  markersLieInsideSilhouette,
  validateReflectionShape,
  isVerticallySymmetric,
  buildVerticalReflectionTemplateCatalog,
  getVerticalReflectionTemplate,
  listVerticalReflectionTemplateIds,
  createVerticalReflectionSeededRng,
  hashSeedToUint32,
  seededShuffleVerticalReflection,
  generateVerticalReflectionCandidates,
  assertVerticalReflectionSolvable,
  materializeVerticalReflectionQuestion,
  assertVerticalReflectionQuestionSolvable,
  assertVerticalReflectionBankSolvable,
  toPublicVerticalReflectionCandidates,
  buildVerticalReflectionQuestion,
  buildDefaultVerticalReflectionBank,
} from "./vertical-reflection-logic";
export type {
  NormalizedPoint,
  ShapePolygon,
  ShapeMarker,
  ShapeMarkerType,
  ShapeMarkerColorRole,
  ReflectionShape,
  DistractorTransform,
  VerticalReflectionTemplateId,
  VerticalReflectionCandidate,
  VerticalReflectionGenerationResult,
  VerticalReflectionQuestion,
  VerticalReflectionPublicCandidate,
  VerticalReflectionClientConfig,
  VerticalReflectionServerConfig,
  VerticalReflectionAnswer,
  ShapeValidationIssue,
} from "./vertical-reflection-logic";

import {
  verticalReflectionAnswerSchema,
  verticalReflectionClientConfigSchema,
  verticalReflectionServerConfigSchema,
  type VerticalReflectionAnswer,
  type VerticalReflectionClientConfig,
  type VerticalReflectionServerConfig,
} from "./vertical-reflection-logic";

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
export type OrderSequenceSortAnswer = z.infer<
  typeof orderSequenceSortAnswerSchema
>;

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
    cells: z
      .array(z.union([z.literal(0), z.literal(1)]))
      .min(9)
      .max(144),
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
    cells: z
      .array(z.union([z.literal(0), z.literal(1)]))
      .min(9)
      .max(144),
    startIndex: z.number().int().min(0).max(143),
    goalIndex: z.number().int().min(0).max(143),
    variants: z
      .array(
        z
          .object({
            cols: z.number().int().min(3).max(12),
            rows: z.number().int().min(3).max(12),
            cells: z
              .array(z.union([z.literal(0), z.literal(1)]))
              .min(9)
              .max(144),
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
export type PrecisionMazePathAnswer = z.infer<
  typeof precisionMazePathAnswerSchema
>;

// ---------------------------------------------------------------------------
// 16b. precision.neon_cable
// ---------------------------------------------------------------------------

export const neonCableColorSchema = z.enum(["cyan", "red"]);
export type NeonCableColor = z.infer<typeof neonCableColorSchema>;

export const neonCableWrongDropPolicySchema = z.enum([
  "fail_final",
  "reset_allow_retry",
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
  "north",
  "east",
  "south",
  "west",
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
    kind: z.literal("heart"),
  })
  .strict();
export type CircuitRotationTarget = z.infer<typeof circuitRotationTargetSchema>;

export const circuitRotationShapeSchema = z.enum(["straight", "corner"]);
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
    /** Content-pack SFX when a new pipe joins the powered path. */
    cableConnectSfx: z.string().min(1).max(128).optional(),
    /** Content-pack SFX when power first reaches the heart. */
    heartPowerOnSfx: z.string().min(1).max(128).optional(),
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
        message: "cell must be within grid bounds",
        path,
      });
    }
  };

  validateCell(puzzle.source.cell, ["source", "cell"]);
  validateCell(puzzle.target.cell, ["target", "cell"]);

  const tileIds = new Set<string>();
  const tileCells = new Set<string>();
  puzzle.tiles.forEach((tile, index) => {
    validateCell(tile.cell, ["tiles", index, "cell"]);
    if (tileIds.has(tile.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate tile id "${tile.id}"`,
        path: ["tiles", index, "id"],
      });
    }
    tileIds.add(tile.id);

    const cellKey = tile.cell.join(",");
    if (tileCells.has(cellKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "multiple tiles cannot occupy the same cell",
        path: ["tiles", index, "cell"],
      });
    }
    tileCells.add(cellKey);
  });

  const stationaryConnections = new Set<string>();
  puzzle.stationaryConnections.forEach((connection, index) => {
    validateCell(connection.cell, ["stationaryConnections", index, "cell"]);
    const connectionKey = `${connection.cell.join(",")}:${connection.side}`;
    if (stationaryConnections.has(connectionKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate stationary connection",
        path: ["stationaryConnections", index],
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
// 16d. precision.cable_untangle
// ---------------------------------------------------------------------------

export const CABLE_UNTANGLE_MIN_CABLES = 2;
export const CABLE_UNTANGLE_MAX_CABLES = 8;

export const cableUntangleSocketSchema = z
  .object({
    id: z.string().min(1).max(64),
    order: z
      .number()
      .int()
      .min(0)
      .max(CABLE_UNTANGLE_MAX_CABLES - 1),
  })
  .strict();
export type CableUntangleSocket = z.infer<typeof cableUntangleSocketSchema>;

export const cableUntangleCableSchema = z
  .object({
    id: z.string().min(1).max(64),
    leftSocketId: z.string().min(1).max(64),
    initialRightSocketId: z.string().min(1).max(64),
  })
  .strict();
export type CableUntangleCable = z.infer<typeof cableUntangleCableSchema>;

export const cableUntangleLayoutSchema = z
  .object({
    leftColumnX: z.number().min(0.05).max(0.35),
    rightColumnX: z.number().min(0.65).max(0.95),
    topPadding: z.number().min(0.05).max(0.25),
    bottomPadding: z.number().min(0.05).max(0.25),
  })
  .strict()
  .superRefine((layout, ctx) => {
    if (layout.rightColumnX - layout.leftColumnX < 0.35) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rightColumnX must be at least 0.35 beyond leftColumnX",
        path: ["rightColumnX"],
      });
    }
    if (layout.topPadding + layout.bottomPadding >= 0.85) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "vertical padding leaves insufficient play area",
        path: ["topPadding"],
      });
    }
  });
export type CableUntangleLayout = z.infer<typeof cableUntangleLayoutSchema>;

export const cableUntangleThemeSchema = z
  .object({
    backgroundColor: hexColor,
    gridColor: hexColor,
    cableColor: hexColor,
    cableCoreColor: hexColor,
    socketColor: hexColor,
  })
  .strict();
export type CableUntangleTheme = z.infer<typeof cableUntangleThemeSchema>;

export const cableUntangleAssetIdsSchema = z
  .object({
    swingSfx: z.string().min(1).max(128),
  })
  .strict();
export type CableUntangleAssetIds = z.infer<typeof cableUntangleAssetIdsSchema>;

export type CableUntanglePuzzleLike = {
  layout: CableUntangleLayout;
  sockets: {
    left: CableUntangleSocket[];
    right: CableUntangleSocket[];
  };
  cables: CableUntangleCable[];
};

export function countCableUntangleIntersections(
  puzzle: CableUntanglePuzzleLike,
  rightAssignment: ReadonlyMap<string, string> | Record<string, string>,
): number {
  const assignment =
    rightAssignment instanceof Map
      ? rightAssignment
      : new Map(Object.entries(rightAssignment));
  const leftOrder = new Map(
    puzzle.sockets.left.map((socket) => [socket.id, socket.order] as const),
  );
  const rightOrder = new Map(
    puzzle.sockets.right.map((socket) => [socket.id, socket.order] as const),
  );
  const endpoints: Array<{ left: number; right: number }> = [];
  for (const cable of puzzle.cables) {
    const rightId = assignment.get(cable.id);
    if (!rightId) return -1;
    const left = leftOrder.get(cable.leftSocketId);
    const right = rightOrder.get(rightId);
    if (left == null || right == null) return -1;
    endpoints.push({ left, right });
  }
  let count = 0;
  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = i + 1; j < endpoints.length; j += 1) {
      const a = endpoints[i]!;
      const b = endpoints[j]!;
      if ((a.left - b.left) * (a.right - b.right) < 0) {
        count += 1;
      }
    }
  }
  return count;
}

export function initialCableUntangleAssignment(
  puzzle: CableUntanglePuzzleLike,
): Record<string, string> {
  return Object.fromEntries(
    puzzle.cables.map((cable) => [cable.id, cable.initialRightSocketId]),
  );
}

function refineCableUntanglePuzzle(
  puzzle: CableUntanglePuzzleLike,
  ctx: z.RefinementCtx,
  options?: { requireInitialCrossing?: boolean },
): void {
  const left = puzzle.sockets.left;
  const right = puzzle.sockets.right;
  if (left.length !== right.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "left and right socket counts must match",
      path: ["sockets", "right"],
    });
    return;
  }
  if (
    left.length < CABLE_UNTANGLE_MIN_CABLES ||
    left.length > CABLE_UNTANGLE_MAX_CABLES
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `socket count must be ${CABLE_UNTANGLE_MIN_CABLES}-${CABLE_UNTANGLE_MAX_CABLES}`,
      path: ["sockets", "left"],
    });
    return;
  }
  if (puzzle.cables.length !== left.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "cable count must match socket count",
      path: ["cables"],
    });
    return;
  }

  const checkOrders = (
    sockets: CableUntangleSocket[],
    pathPrefix: (string | number)[],
  ) => {
    const orders = new Set<number>();
    const ids = new Set<string>();
    for (let i = 0; i < sockets.length; i += 1) {
      const socket = sockets[i]!;
      if (ids.has(socket.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate socket id "${socket.id}"`,
          path: [...pathPrefix, i, "id"],
        });
      }
      ids.add(socket.id);
      if (orders.has(socket.order)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate socket order ${socket.order}`,
          path: [...pathPrefix, i, "order"],
        });
      }
      orders.add(socket.order);
    }
    for (let i = 0; i < sockets.length; i += 1) {
      if (!orders.has(i)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "socket orders must be unique and contiguous from 0",
          path: pathPrefix,
        });
        break;
      }
    }
  };
  checkOrders(left, ["sockets", "left"]);
  checkOrders(right, ["sockets", "right"]);

  const leftIds = new Set(left.map((s) => s.id));
  const rightIds = new Set(right.map((s) => s.id));
  const cableIds = new Set<string>();
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();

  puzzle.cables.forEach((cable, index) => {
    if (cableIds.has(cable.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate cable id "${cable.id}"`,
        path: ["cables", index, "id"],
      });
    }
    cableIds.add(cable.id);
    if (!leftIds.has(cable.leftSocketId) || usedLeft.has(cable.leftSocketId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "each left socket must be referenced exactly once",
        path: ["cables", index, "leftSocketId"],
      });
    }
    usedLeft.add(cable.leftSocketId);
    if (
      !rightIds.has(cable.initialRightSocketId) ||
      usedRight.has(cable.initialRightSocketId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "each right socket must be occupied exactly once",
        path: ["cables", index, "initialRightSocketId"],
      });
    }
    usedRight.add(cable.initialRightSocketId);
  });

  if (options?.requireInitialCrossing !== false) {
    const crossings = countCableUntangleIntersections(
      puzzle,
      initialCableUntangleAssignment(puzzle),
    );
    if (crossings <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "initial arrangement must contain at least one crossing",
        path: ["cables"],
      });
    }
  }
}

const cableUntanglePuzzleShape = {
  layout: cableUntangleLayoutSchema,
  sockets: z
    .object({
      left: z
        .array(cableUntangleSocketSchema)
        .min(CABLE_UNTANGLE_MIN_CABLES)
        .max(CABLE_UNTANGLE_MAX_CABLES),
      right: z
        .array(cableUntangleSocketSchema)
        .min(CABLE_UNTANGLE_MIN_CABLES)
        .max(CABLE_UNTANGLE_MAX_CABLES),
    })
    .strict(),
  cables: z
    .array(cableUntangleCableSchema)
    .min(CABLE_UNTANGLE_MIN_CABLES)
    .max(CABLE_UNTANGLE_MAX_CABLES),
  theme: cableUntangleThemeSchema,
  assetIds: cableUntangleAssetIdsSchema,
  snapRadiusNorm: z.number().min(0.04).max(0.18).default(0.08),
  mirrorHorizontally: z.boolean().default(false),
} as const;

export const cableUntangleVariantSchema = z
  .object({
    layout: cableUntangleLayoutSchema,
    sockets: cableUntanglePuzzleShape.sockets,
    cables: cableUntanglePuzzleShape.cables,
  })
  .strict()
  .superRefine((puzzle, ctx) => refineCableUntanglePuzzle(puzzle, ctx));
export type CableUntangleVariant = z.infer<typeof cableUntangleVariantSchema>;

export const precisionCableUntangleClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    titleKey: translationKey.optional(),
    footerKey: translationKey.optional(),
    ...cableUntanglePuzzleShape,
  })
  .strict()
  .superRefine((cfg, ctx) => refineCableUntanglePuzzle(cfg, ctx));
export type PrecisionCableUntangleClientConfig = z.infer<
  typeof precisionCableUntangleClientConfigSchema
>;

export const precisionCableUntangleServerConfigSchema = z
  .object({
    ...cableUntanglePuzzleShape,
    variants: z.array(cableUntangleVariantSchema).min(1).max(16).optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => refineCableUntanglePuzzle(cfg, ctx));
export type PrecisionCableUntangleServerConfig = z.infer<
  typeof precisionCableUntangleServerConfigSchema
>;

export const cableUntangleSwapSchema = z
  .object({
    sequence: z.number().int().min(1).max(64),
    draggedCableId: z.string().min(1).max(64),
    displacedCableId: z.string().min(1).max(64),
    fromRightSocketId: z.string().min(1).max(64),
    toRightSocketId: z.string().min(1).max(64),
    elapsedMs: z.number().int().nonnegative().max(60_000),
  })
  .strict();
export type CableUntangleSwap = z.infer<typeof cableUntangleSwapSchema>;

export const precisionCableUntangleAnswerSchema = z
  .object({
    swaps: z.array(cableUntangleSwapSchema).max(64),
    finalAssignment: z.record(
      z.string().min(1).max(64),
      z.string().min(1).max(64),
    ),
  })
  .strict();
export type PrecisionCableUntangleAnswer = z.infer<
  typeof precisionCableUntangleAnswerSchema
>;

// ---------------------------------------------------------------------------
// 17. logic.balance_scale
// ---------------------------------------------------------------------------

const balanceScalePlacementSideSchema = z.enum(["left", "right"]);

const logicBalanceScaleVariantSchema = z
  .object({
    leftWeights: z.array(z.number().int().min(1).max(9)).max(4),
    rightKnownWeights: z.array(z.number().int().min(1).max(9)).max(4),
    optionWeights: z.array(z.number().int().min(1).max(9)).min(2).max(6),
    correctWeight: z.number().int().min(1).max(9),
    /** Pan that accepts the dragged option weight. Defaults to right. */
    placementSide: balanceScalePlacementSideSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const side = value.placementSide ?? "right";
    const leftSum = value.leftWeights.reduce((a, b) => a + b, 0);
    const rightSum = value.rightKnownWeights.reduce((a, b) => a + b, 0);
    const balanced =
      side === "right"
        ? leftSum === rightSum + value.correctWeight
        : leftSum + value.correctWeight === rightSum;
    if (!balanced) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "correctWeight must balance the scale for the chosen placementSide",
      });
    }
    if (!value.optionWeights.includes(value.correctWeight)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correctWeight must appear in optionWeights",
      });
    }
    if (side === "left" && value.leftWeights.length >= 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "leftWeights must leave room for placement when side is left",
      });
    }
    if (side === "right" && value.rightKnownWeights.length >= 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "rightKnownWeights must leave room for placement when side is right",
      });
    }
  });

export const logicBalanceScaleClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    leftWeights: z.array(z.number().int().min(1).max(9)).max(4),
    rightKnownWeights: z.array(z.number().int().min(1).max(9)).max(4),
    optionWeights: z.array(z.number().int().min(1).max(9)).min(2).max(6),
    placementSide: balanceScalePlacementSideSchema.optional(),
  })
  .strict();
export type LogicBalanceScaleClientConfig = z.infer<
  typeof logicBalanceScaleClientConfigSchema
>;

export const logicBalanceScaleServerConfigSchema = z
  .object({
    leftWeights: z.array(z.number().int().min(1).max(9)).max(4),
    rightKnownWeights: z.array(z.number().int().min(1).max(9)).max(4),
    optionWeights: z.array(z.number().int().min(1).max(9)).min(2).max(6),
    correctWeight: z.number().int().min(1).max(9),
    placementSide: balanceScalePlacementSideSchema.optional(),
    variants: z.array(logicBalanceScaleVariantSchema).min(1).max(32).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const side = value.placementSide ?? "right";
    const leftSum = value.leftWeights.reduce((a, b) => a + b, 0);
    const rightSum = value.rightKnownWeights.reduce((a, b) => a + b, 0);
    const balanced =
      side === "right"
        ? leftSum === rightSum + value.correctWeight
        : leftSum + value.correctWeight === rightSum;
    if (!balanced) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "correctWeight must balance the scale for the chosen placementSide",
      });
    }
    if (!value.optionWeights.includes(value.correctWeight)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correctWeight must appear in optionWeights",
      });
    }
  });
export type LogicBalanceScaleServerConfig = z.infer<
  typeof logicBalanceScaleServerConfigSchema
>;

export const logicBalanceScaleAnswerSchema = z
  .object({
    chosenWeight: z.number().int().min(1).max(9),
  })
  .strict();
export type LogicBalanceScaleAnswer = z.infer<
  typeof logicBalanceScaleAnswerSchema
>;

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
export type FocusStroopClientConfig = z.infer<
  typeof focusStroopClientConfigSchema
>;

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
export type FocusStroopServerConfig = z.infer<
  typeof focusStroopServerConfigSchema
>;

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
            requiredIndices: z
              .array(z.number().int().min(0).max(35))
              .min(1)
              .max(36),
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
// 20. logic.complete_sum — collaborative real-time sum challenge
// ---------------------------------------------------------------------------

export const completeSumPlayerCountSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type CompleteSumPlayerCount = z.infer<typeof completeSumPlayerCountSchema>;

export const completeSumGenerationRuleSchema = z
  .object({
    minValue: z.number().int().min(0).max(20),
    maxValue: z.number().int().min(0).max(20),
    choicesPerPlayer: z.number().int().min(2).max(8),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.maxValue < rule.minValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxValue must be >= minValue",
        path: ["maxValue"],
      });
    }
    const distinct = rule.maxValue - rule.minValue + 1;
    if (distinct < rule.choicesPerPlayer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "value range must contain at least choicesPerPlayer distinct values",
        path: ["choicesPerPlayer"],
      });
    }
  });
export type CompleteSumGenerationRule = z.infer<
  typeof completeSumGenerationRuleSchema
>;

/** Default generation rules by active participant count (server-configurable). */
export const COMPLETE_SUM_DEFAULT_GENERATION_RULES: Record<
  CompleteSumPlayerCount,
  CompleteSumGenerationRule
> = {
  2: { minValue: 0, maxValue: 8, choicesPerPlayer: 4 },
  3: { minValue: 0, maxValue: 6, choicesPerPlayer: 4 },
  4: { minValue: 0, maxValue: 5, choicesPerPlayer: 4 },
  5: { minValue: 0, maxValue: 4, choicesPerPlayer: 4 },
  6: { minValue: 0, maxValue: 3, choicesPerPlayer: 4 },
};

export const logicCompleteSumClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    titleKey: translationKey,
    promptKey: translationKey,
    currentTotalKey: translationKey,
    chooseNumberKey: translationKey,
    readyKey: translationKey,
    thinkingKey: translationKey,
    youKey: translationKey,
    footerKey: translationKey.optional(),
    /** Populated at round start — frozen participant order. */
    participantIds: z.array(z.string().min(1).max(128)).min(2).max(6).optional(),
    target: z.number().int().min(0).max(200).optional(),
    /** Authoritative selections; null means unselected (zero is valid). */
    selections: z
      .record(z.union([z.number().int().min(0).max(20), z.null()]))
      .optional(),
    currentTotal: z.number().int().min(0).max(200).optional(),
    allSelected: z.boolean().optional(),
    /** Challenge-local revision for stale-update rejection on clients. */
    stateSequence: z.number().int().nonnegative().optional(),
    /** True when every seat selected but the sum does not match the target. */
    incorrectTotal: z.boolean().optional(),
    /** Viewer-private option list (also delivered via seat overlay). */
    myChoices: z.array(z.number().int().min(0).max(20)).min(2).max(8).optional(),
    isParticipant: z.boolean().optional(),
  })
  .strict();
export type LogicCompleteSumClientConfig = z.infer<
  typeof logicCompleteSumClientConfigSchema
>;

export const logicCompleteSumServerConfigSchema = z
  .object({
    generationRules: z
      .object({
        "2": completeSumGenerationRuleSchema.optional(),
        "3": completeSumGenerationRuleSchema.optional(),
        "4": completeSumGenerationRuleSchema.optional(),
        "5": completeSumGenerationRuleSchema.optional(),
        "6": completeSumGenerationRuleSchema.optional(),
      })
      .strict()
      .optional(),
    maxGenerationAttempts: z.number().int().min(1).max(256).optional(),
    /** Optional deterministic seed for tests / reproducible debugging. */
    seed: z.number().int().optional(),
    /** Materialized at round start — never include hidden solution here for logs. */
    target: z.number().int().min(0).max(200).optional(),
    optionsByPlayerId: z
      .record(z.array(z.number().int().min(0).max(20)).min(2).max(8))
      .optional(),
    frozenParticipantIds: z
      .array(z.string().min(1).max(128))
      .min(2)
      .max(6)
      .optional(),
  })
  .strict();
export type LogicCompleteSumServerConfig = z.infer<
  typeof logicCompleteSumServerConfigSchema
>;

export const logicCompleteSumAnswerSchema = z
  .object({
    selectedValue: z.number().int().min(0).max(20),
    /** Selections stay progress until the server resolves the collective round. */
    final: z.boolean().optional(),
  })
  .strict();
export type LogicCompleteSumAnswer = z.infer<
  typeof logicCompleteSumAnswerSchema
>;

// ---------------------------------------------------------------------------
// 21. social.pass_the_pulse — sequential clockwise pulse timing challenge
// ---------------------------------------------------------------------------

export const passThePulsePlayerCountSchema = completeSumPlayerCountSchema;
export type PassThePulsePlayerCount = CompleteSumPlayerCount;

export const passThePulsePlayerResultSchema = z.enum([
  "waiting",
  "hit",
  "missed",
]);
export type PassThePulsePlayerResult = z.infer<
  typeof passThePulsePlayerResultSchema
>;

export const passThePulseParticipantSchema = z
  .object({
    playerId: z.string().min(1).max(128),
    displayName: z.string().min(1).max(64),
  })
  .strict();
export type PassThePulseParticipant = z.infer<
  typeof passThePulseParticipantSchema
>;

export const passThePulseLegSchema = z
  .object({
    legId: z.string().min(1).max(64),
    playerId: z.string().min(1).max(128),
    routeIndex: z.number().int().nonnegative().max(5),
    travelStartAtMs: z.number().int().nonnegative(),
    expectedArrivalAtMs: z.number().int().nonnegative(),
    windowOpensAtMs: z.number().int().nonnegative(),
    windowClosesAtMs: z.number().int().nonnegative(),
  })
  .strict();
export type PassThePulseLeg = z.infer<typeof passThePulseLegSchema>;

/** Defaults used when Studio / fixtures omit timing fields. */
export const PASS_THE_PULSE_DEFAULT_TIMING = {
  minPlayers: 2 as const,
  maxPlayers: 6 as const,
  startDelayMs: 800,
  segmentDurationMs: 1800,
  hitWindowEarlyMs: 280,
  hitWindowLateMs: 320,
  resultTransitionMs: 900,
} as const;

export const socialPassThePulseClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    titleKey: translationKey,
    promptKey: translationKey,
    actionKey: translationKey,
    youKey: translationKey,
    timeRemainingKey: translationKey,
    turnAnnounceKey: translationKey.optional(),
    a11yTapReadyKey: translationKey.optional(),
    a11yTapWaitKey: translationKey.optional(),
    /**
     * Heartbeat played when the pulse arrives at each node.
     * Defaults to shared content-pack `sfx.pulse` (do not duplicate the file).
     */
    pulseSfxAssetId: z.string().min(1).max(128).optional(),
    /** Frozen authoritative participants (id + displayName). */
    participants: z.array(passThePulseParticipantSchema).min(2).max(6).optional(),
    /** Clockwise pulse route (player ids). */
    routePlayerIds: z.array(z.string().min(1).max(128)).min(2).max(6).optional(),
    pulseStartAtMs: z.number().int().nonnegative().optional(),
    startDelayMs: z.number().int().positive().max(10_000).optional(),
    segmentDurationMs: positiveMs.optional(),
    hitWindowEarlyMs: nonNegMs.optional(),
    hitWindowLateMs: nonNegMs.optional(),
    resultTransitionMs: nonNegMs.optional(),
    legs: z.array(passThePulseLegSchema).min(1).max(64).optional(),
    currentLegId: z.string().min(1).max(64).optional(),
    currentTargetPlayerId: z.string().min(1).max(128).nullable().optional(),
    results: z.record(passThePulsePlayerResultSchema).optional(),
    stateSequence: z.number().int().nonnegative().optional(),
    challengeStatus: z.enum(["active", "completed"]).optional(),
    schemaVersion: z.literal(1).optional(),
    isParticipant: z.boolean().optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.hitWindowEarlyMs != null && cfg.segmentDurationMs != null) {
      if (cfg.hitWindowEarlyMs + (cfg.hitWindowLateMs ?? 0) > cfg.segmentDurationMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "hit windows must fit within segmentDurationMs",
          path: ["hitWindowEarlyMs"],
        });
      }
    }
  });
export type SocialPassThePulseClientConfig = z.infer<
  typeof socialPassThePulseClientConfigSchema
>;

export const socialPassThePulseServerConfigSchema = z
  .object({
    minPlayers: z.literal(2).optional(),
    maxPlayers: z.literal(6).optional(),
    startDelayMs: z.number().int().positive().max(10_000).optional(),
    segmentDurationMs: positiveMs.optional(),
    hitWindowEarlyMs: nonNegMs.optional(),
    hitWindowLateMs: nonNegMs.optional(),
    resultTransitionMs: nonNegMs.optional(),
    /** Optional deterministic seed for tests / reproducible debugging. */
    seed: z.number().int().optional(),
    /** Materialized at round start — frozen for reconnect. */
    frozenParticipantIds: z
      .array(z.string().min(1).max(128))
      .min(2)
      .max(6)
      .optional(),
    frozenDisplayNames: z.record(z.string().min(1).max(64)).optional(),
    routePlayerIds: z
      .array(z.string().min(1).max(128))
      .min(2)
      .max(6)
      .optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const segment =
      cfg.segmentDurationMs ?? PASS_THE_PULSE_DEFAULT_TIMING.segmentDurationMs;
    const early =
      cfg.hitWindowEarlyMs ?? PASS_THE_PULSE_DEFAULT_TIMING.hitWindowEarlyMs;
    const late =
      cfg.hitWindowLateMs ?? PASS_THE_PULSE_DEFAULT_TIMING.hitWindowLateMs;
    if (early + late > segment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "hitWindowEarlyMs + hitWindowLateMs must be <= segmentDurationMs",
        path: ["hitWindowEarlyMs"],
      });
    }
  });
export type SocialPassThePulseServerConfig = z.infer<
  typeof socialPassThePulseServerConfigSchema
>;

export const socialPassThePulseAnswerSchema = z
  .object({
    /** Authoritative route leg the client believes is active. */
    legId: z.string().min(1).max(64),
    /** Progress taps — round resolves only after every seat is settled. */
    final: z.boolean().optional(),
  })
  .strict();
export type SocialPassThePulseAnswer = z.infer<
  typeof socialPassThePulseAnswerSchema
>;

// ---------------------------------------------------------------------------
// 22. precision.ring_lock — individual concentric ring timing challenge
// ---------------------------------------------------------------------------

export const RING_LOCK_RING_COUNT = 3 as const;
export const ringLockRingIndexSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);
export type RingLockRingIndex = z.infer<typeof ringLockRingIndexSchema>;

export const ringLockDirectionSchema = z.union([z.literal(1), z.literal(-1)]);
export type RingLockDirection = z.infer<typeof ringLockDirectionSchema>;

export const ringLockDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type RingLockDifficulty = z.infer<typeof ringLockDifficultySchema>;

export const ringLockPlayerResultSchema = z.enum([
  "active",
  "success",
  "timeout",
  "failed",
]);
export type RingLockPlayerResult = z.infer<typeof ringLockPlayerResultSchema>;

export const ringLockLastOutcomeSchema = z.enum(["hit", "miss"]);
export type RingLockLastOutcome = z.infer<typeof ringLockLastOutcomeSchema>;

/** Defaults used when Studio / fixtures omit generation fields. */
export const RING_LOCK_DEFAULT_CONFIG = {
  ringCount: RING_LOCK_RING_COUNT,
  startDelayMs: 700,
  minAngularVelocityDegPerSec: 45,
  maxAngularVelocityDegPerSec: 90,
  allowClockwise: true,
  allowCounterClockwise: true,
  targetAngleDeg: 0,
  /** ± degrees from the gate — must stay playable with RTT + human reaction. */
  alignmentToleranceDeg: 24,
  transitionDelayMs: 180,
  safetyMarginMs: 600,
  maxGenerationAttempts: 48,
  difficulty: "medium" as const,
} as const;

/** Playable ring-lock generation keyed by challenge difficulty. */
export const RING_LOCK_DIFFICULTY_TUNING = {
  easy: {
    minAngularVelocityDegPerSec: 28,
    maxAngularVelocityDegPerSec: 50,
    alignmentToleranceDeg: 32,
    startDelayMs: 900,
  },
  medium: {
    minAngularVelocityDegPerSec:
      RING_LOCK_DEFAULT_CONFIG.minAngularVelocityDegPerSec,
    maxAngularVelocityDegPerSec:
      RING_LOCK_DEFAULT_CONFIG.maxAngularVelocityDegPerSec,
    alignmentToleranceDeg: RING_LOCK_DEFAULT_CONFIG.alignmentToleranceDeg,
    startDelayMs: RING_LOCK_DEFAULT_CONFIG.startDelayMs,
  },
  hard: {
    minAngularVelocityDegPerSec: 72,
    maxAngularVelocityDegPerSec: 125,
    alignmentToleranceDeg: 16,
    startDelayMs: 500,
  },
} as const;

export const precisionRingLockClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    titleKey: translationKey,
    promptKey: translationKey,
    actionKey: translationKey,
    timeRemainingKey: translationKey,
    ring1Key: translationKey.optional(),
    ring2Key: translationKey.optional(),
    ring3Key: translationKey.optional(),
    statusLockedKey: translationKey.optional(),
    statusRotatingKey: translationKey.optional(),
    statusFailedKey: translationKey.optional(),
    a11yLockButtonKey: translationKey.optional(),
    a11yRingStatusKey: translationKey.optional(),
    /** Shared public timing mirrors (never private angles). */
    ringCount: z.literal(3).optional(),
    startDelayMs: nonNegMs.optional(),
    targetAngleDeg: z.number().min(0).lt(360).optional(),
    alignmentToleranceDeg: z.number().positive().max(45).optional(),
    transitionDelayMs: nonNegMs.optional(),
    difficulty: ringLockDifficultySchema.optional(),
    /**
     * Personalized runtime overlay (viewer seat only). Never broadcast other
     * players' rings/seeds in the shared snapshot.
     */
    seed: z.number().int().nonnegative().optional(),
    puzzleStartsAtMs: z.number().int().nonnegative().optional(),
    activeRingIndex: ringLockRingIndexSchema.optional(),
    rings: z
      .array(
        z
          .object({
            index: ringLockRingIndexSchema,
            initialAngleDeg: z.number().min(0).lt(360),
            direction: ringLockDirectionSchema,
            angularVelocityDegPerSec: z.number().positive().max(720),
            locked: z.boolean(),
            lockedAngleDeg: z.number().min(0).lt(360).nullable().optional(),
          })
          .strict(),
      )
      .length(3)
      .optional(),
    lockedCount: z.number().int().min(0).max(3).optional(),
    progress: z.number().min(0).max(1).optional(),
    result: ringLockPlayerResultSchema.optional(),
    stateSequence: z.number().int().nonnegative().optional(),
    lastLockOutcome: ringLockLastOutcomeSchema.nullable().optional(),
    lastLockRingIndex: ringLockRingIndexSchema.nullable().optional(),
    lastAcceptedCommandId: z.string().min(1).max(128).nullable().optional(),
    reconnect: z.boolean().optional(),
    isParticipant: z.boolean().optional(),
  })
  .strict();
export type PrecisionRingLockClientConfig = z.infer<
  typeof precisionRingLockClientConfigSchema
>;

export const precisionRingLockServerConfigSchema = z
  .object({
    ringCount: z.literal(3).default(3),
    startDelayMs: nonNegMs.default(RING_LOCK_DEFAULT_CONFIG.startDelayMs),
    minAngularVelocityDegPerSec: z
      .number()
      .positive()
      .max(720)
      .default(RING_LOCK_DEFAULT_CONFIG.minAngularVelocityDegPerSec),
    maxAngularVelocityDegPerSec: z
      .number()
      .positive()
      .max(720)
      .default(RING_LOCK_DEFAULT_CONFIG.maxAngularVelocityDegPerSec),
    allowClockwise: z.boolean().default(true),
    allowCounterClockwise: z.boolean().default(true),
    targetAngleDeg: z
      .number()
      .min(0)
      .lt(360)
      .default(RING_LOCK_DEFAULT_CONFIG.targetAngleDeg),
    alignmentToleranceDeg: z
      .number()
      .positive()
      .max(45)
      .default(RING_LOCK_DEFAULT_CONFIG.alignmentToleranceDeg),
    transitionDelayMs: nonNegMs.default(
      RING_LOCK_DEFAULT_CONFIG.transitionDelayMs,
    ),
    safetyMarginMs: nonNegMs.default(RING_LOCK_DEFAULT_CONFIG.safetyMarginMs),
    maxGenerationAttempts: z
      .number()
      .int()
      .positive()
      .max(256)
      .default(RING_LOCK_DEFAULT_CONFIG.maxGenerationAttempts),
    difficulty: ringLockDifficultySchema.default("medium"),
    /** Optional fixed seed for deterministic tests / Studio preview. */
    seed: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (
      cfg.minAngularVelocityDegPerSec > cfg.maxAngularVelocityDegPerSec
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minAngularVelocityDegPerSec must be <= maxAngularVelocityDegPerSec",
        path: ["minAngularVelocityDegPerSec"],
      });
    }
    if (!cfg.allowClockwise && !cfg.allowCounterClockwise) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at least one rotation direction must be allowed",
        path: ["allowClockwise"],
      });
    }
  });
export type PrecisionRingLockServerConfig = z.infer<
  typeof precisionRingLockServerConfigSchema
>;

export const precisionRingLockAnswerSchema = z
  .object({
    /** Ring the client intends to lock (must match authoritative active ring). */
    ringIndex: ringLockRingIndexSchema,
    /** Optional optimistic concurrency token from the last personalized state. */
    expectedSequence: z.number().int().nonnegative().optional(),
    /** Progress locks stay non-final until all three rings succeed. */
    final: z.boolean().optional(),
  })
  .strict();
export type PrecisionRingLockAnswer = z.infer<
  typeof precisionRingLockAnswerSchema
>;

// ---------------------------------------------------------------------------
// 23. laser.routing — individual mirror / gate / fusion laser puzzles
// ---------------------------------------------------------------------------

export const laserRoutingVariantSchema = z.enum([
  "classic",
  "zigzag",
  "dual_fusion",
  "pulse_gates",
]);
export type LaserRoutingVariantId = z.infer<typeof laserRoutingVariantSchema>;

export const laserRoutingDirectionSchema = z.enum([
  "north",
  "east",
  "south",
  "west",
]);
export const laserRoutingMirrorOrientationSchema = z.enum([
  "slash",
  "backslash",
]);
export const laserRoutingGateAxisSchema = z.enum(["horizontal", "vertical"]);
export const laserRoutingColorSchema = z.enum(["cyan", "amber", "fused"]);
export const laserRoutingCellKindSchema = z.enum([
  "empty",
  "source",
  "mirror",
  "gate",
  "combiner",
  "heart",
]);
export const laserRoutingPlayerResultSchema = z.enum([
  "active",
  "success",
  "timeout",
]);

export const laserRoutingAssetIdsSchema = z
  .object({
    laserLoopSfx: z.string().min(1).max(128),
    reflectionSfx: z.string().min(1).max(128),
    heartPowerOnSfx: z.string().min(1).max(128),
  })
  .strict();
export type LaserRoutingAssetIds = z.infer<typeof laserRoutingAssetIdsSchema>;

export const laserRoutingThemeSchema = z
  .object({
    boardFill: hexColor.optional(),
    gridLine: hexColor.optional(),
    frame: hexColor.optional(),
    cyan: hexColor.optional(),
    amber: hexColor.optional(),
    fused: hexColor.optional(),
    heart: hexColor.optional(),
  })
  .strict();
export type LaserRoutingTheme = z.infer<typeof laserRoutingThemeSchema>;

const laserRoutingCoordSchema = z
  .object({
    row: z.number().int().nonnegative().max(15),
    col: z.number().int().nonnegative().max(15),
  })
  .strict();

const laserRoutingPublicComponentSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: laserRoutingCellKindSchema,
    row: z.number().int().nonnegative().max(15),
    col: z.number().int().nonnegative().max(15),
    orientation: laserRoutingMirrorOrientationSchema.optional(),
    axis: laserRoutingGateAxisSchema.optional(),
    direction: laserRoutingDirectionSchema.optional(),
    color: laserRoutingColorSchema.optional(),
    cyanInput: laserRoutingDirectionSchema.optional(),
    amberInput: laserRoutingDirectionSchema.optional(),
    outputDirection: laserRoutingDirectionSchema.optional(),
    interactive: z.boolean(),
  })
  .strict();

const laserRoutingPublicBoardSchema = z
  .object({
    width: z.number().int().min(3).max(8),
    height: z.number().int().min(3).max(8),
    variant: laserRoutingVariantSchema,
    components: z.array(laserRoutingPublicComponentSchema).max(32),
  })
  .strict();

const laserRoutingPublicTraceSchema = z
  .object({
    sourceId: z.string().min(1).max(64),
    color: laserRoutingColorSchema,
    cells: z.array(laserRoutingCoordSchema).max(128),
    hitComponentIds: z.array(z.string().min(1).max(64)).max(32),
    termination: z.enum([
      "heart",
      "boundary",
      "closed_gate",
      "loop",
      "combiner",
      "invalid",
      "max_steps",
    ]),
    blockedComponentId: z.string().min(1).max(64).nullable(),
  })
  .strict();

export const laserRoutingClientConfigSchema = z
  .object({
    categoryKey: translationKey,
    titleKey: translationKey,
    promptKey: translationKey,
    footerKey: translationKey.optional(),
    timeRemainingKey: translationKey.optional(),
    progressMirrorsKey: translationKey.optional(),
    progressGatesKey: translationKey.optional(),
    progressFusionKey: translationKey.optional(),
    progressFusionPartialKey: translationKey.optional(),
    a11yFallbackKey: translationKey.optional(),
    assetIds: laserRoutingAssetIdsSchema,
    variant: laserRoutingVariantSchema,
    startDelayMs: z.number().int().nonnegative().max(8_000),
    theme: laserRoutingThemeSchema.optional(),
    seed: z.number().int().nonnegative().optional(),
    puzzleStartsAtMs: z.number().int().nonnegative().optional(),
    board: laserRoutingPublicBoardSchema.optional(),
    traces: z.array(laserRoutingPublicTraceSchema).max(8).optional(),
    combinerCharged: z.boolean().optional(),
    heartLit: z.boolean().optional(),
    mirrorsHit: z.number().int().nonnegative().optional(),
    mirrorsTotal: z.number().int().nonnegative().optional(),
    gatesOpen: z.number().int().nonnegative().optional(),
    gatesTotal: z.number().int().nonnegative().optional(),
    connectedPaths: z.number().int().nonnegative().optional(),
    totalPaths: z.number().int().nonnegative().optional(),
    progress: z.number().min(0).max(1).optional(),
    result: laserRoutingPlayerResultSchema.optional(),
    stateSequence: z.number().int().nonnegative().optional(),
    lastAcceptedCommandId: z.string().min(1).max(128).nullable().optional(),
    lastRotatedComponentId: z.string().min(1).max(64).nullable().optional(),
    reflectionOccurred: z.boolean().optional(),
    reconnect: z.boolean().optional(),
    isParticipant: z.boolean().optional(),
  })
  .strict();
export type LaserRoutingClientConfig = z.infer<
  typeof laserRoutingClientConfigSchema
>;

export const laserRoutingServerConfigSchema = z
  .object({
    variant: laserRoutingVariantSchema,
    variantWeights: z
      .object({
        classic: z.number().nonnegative().max(1000).optional(),
        zigzag: z.number().nonnegative().max(1000).optional(),
        dual_fusion: z.number().nonnegative().max(1000).optional(),
        pulse_gates: z.number().nonnegative().max(1000).optional(),
      })
      .strict()
      .optional(),
    gridWidth: z.number().int().min(3).max(8).optional(),
    gridHeight: z.number().int().min(3).max(8).optional(),
    startDelayMs: z.number().int().nonnegative().max(8_000),
    moveBudgetMs: z.number().int().positive().max(8_000).optional(),
    safetyMarginMs: z.number().int().nonnegative().max(8_000).optional(),
    maxGenerationAttempts: z.number().int().positive().max(48).optional(),
    minRequiredMoves: z.number().int().min(1).max(8).optional(),
    maxRequiredMoves: z.number().int().min(1).max(8).optional(),
    requireUniqueSolution: z.boolean().optional(),
    avoidSingleMoveStart: z.boolean().optional(),
    mirrorCount: z.number().int().min(3).max(5).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    seed: z.number().int().nonnegative().optional(),
    assetIds: laserRoutingAssetIdsSchema,
    theme: laserRoutingThemeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const minMoves = value.minRequiredMoves ?? 2;
    const maxMoves = value.maxRequiredMoves ?? 5;
    if (maxMoves < minMoves) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxRequiredMoves must be >= minRequiredMoves",
        path: ["maxRequiredMoves"],
      });
    }
    if (value.variant !== "classic" && value.mirrorCount != null && value.mirrorCount !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.variant} requires exactly 4 mirrors`,
        path: ["mirrorCount"],
      });
    }
  });
export type LaserRoutingServerConfig = z.infer<
  typeof laserRoutingServerConfigSchema
>;

export const laserRoutingAnswerSchema = z
  .object({
    componentId: z.string().min(1).max(64),
    expectedSequence: z.number().int().nonnegative().optional(),
    final: z.boolean().optional(),
  })
  .strict();
export type LaserRoutingAnswer = z.infer<typeof laserRoutingAnswerSchema>;

// ---------------------------------------------------------------------------
// Cross-engine validators
// ---------------------------------------------------------------------------

/** Runtime readiness for each engine: 'live' engines have evaluators; 'schema_only' have schemas but no runtime. */
export const ENGINE_RUNTIME_READINESS: Record<
  LaunchEngineId,
  "live" | "schema_only"
> = {
  "reaction.wait_for_signal": "live",
  "trap.no_touch": "live",
  "gesture.reverse_swipe": "live",
  "tap.precision": "live",
  "memory.sequence": "live",
  "hold.multitouch": "live",
  "motion.shake": "live",
  "motion.tilt_balance": "live",
  "audio.cue": "live",
  "social.pair_sync": "live",
  "tactical.risk_choice": "live",
  "trivia.multiple_choice": "live",
  "audio.multiple_choice": "live",
  "trivia.common_word": "live",
  "trivia.symbol_cipher_word": "live",
  "geography.select_on_map": "live",
  "focus.odd_one_out": "live",
  "focus.vertical_reflection": "live",
  "order.sequence_sort": "live",
  "precision.maze_path": "live",
  "precision.neon_cable": "live",
  "gesture.fog_wipe": "live",
  "precision.circuit_rotation": "live",
  "precision.cable_untangle": "live",
  "logic.balance_scale": "live",
  "logic.complete_sum": "live",
  "logic.three_doors": "live",
  "focus.stroop": "live",
  "search.select_occurrences": "live",
  "social.pass_the_pulse": "live",
  "precision.ring_lock": "live",
  "laser.routing": "live",
};

type EngineSchemaPair = {
  client: z.ZodType;
  server: z.ZodType;
  answer: z.ZodType;
};

const ENGINE_SCHEMAS: Record<LaunchEngineId, EngineSchemaPair> = {
  "reaction.wait_for_signal": {
    client: reactionWaitForSignalClientConfigSchema,
    server: reactionWaitForSignalServerConfigSchema,
    answer: reactionWaitForSignalAnswerSchema,
  },
  "trap.no_touch": {
    client: trapNoTouchClientConfigSchema,
    server: trapNoTouchServerConfigSchema,
    answer: trapNoTouchAnswerSchema,
  },
  "gesture.reverse_swipe": {
    client: gestureReverseSwipeClientConfigSchema,
    server: gestureReverseSwipeServerConfigSchema,
    answer: gestureReverseSwipeAnswerSchema,
  },
  "tap.precision": {
    client: tapPrecisionClientConfigSchema,
    server: tapPrecisionServerConfigSchema,
    answer: tapPrecisionAnswerSchema,
  },
  "memory.sequence": {
    client: memorySequenceClientConfigSchema,
    server: memorySequenceServerConfigSchema,
    answer: memorySequenceAnswerSchema,
  },
  "hold.multitouch": {
    client: holdMultitouchClientConfigSchema,
    server: holdMultitouchServerConfigSchema,
    answer: holdMultitouchAnswerSchema,
  },
  "motion.shake": {
    client: motionShakeClientConfigSchema,
    server: motionShakeServerConfigSchema,
    answer: motionShakeAnswerSchema,
  },
  "motion.tilt_balance": {
    client: motionTiltBalanceClientConfigSchema,
    server: motionTiltBalanceServerConfigSchema,
    answer: motionTiltBalanceAnswerSchema,
  },
  "audio.cue": {
    client: audioCueClientConfigSchema,
    server: audioCueServerConfigSchema,
    answer: audioCueAnswerSchema,
  },
  "social.pair_sync": {
    client: socialPairSyncClientConfigSchema,
    server: socialPairSyncServerConfigSchema,
    answer: socialPairSyncAnswerSchema,
  },
  "tactical.risk_choice": {
    client: tacticalRiskChoiceClientConfigSchema,
    server: tacticalRiskChoiceServerConfigSchema,
    answer: tacticalRiskChoiceAnswerSchema,
  },
  "trivia.multiple_choice": {
    client: triviaMultipleChoiceClientConfigSchema,
    server: triviaMultipleChoiceServerConfigSchema,
    answer: triviaMultipleChoiceAnswerSchema,
  },
  "audio.multiple_choice": {
    client: audioMultipleChoiceClientConfigSchema,
    server: audioMultipleChoiceServerConfigSchema,
    answer: audioMultipleChoiceAnswerSchema,
  },
  "trivia.common_word": {
    client: commonWordClientConfigSchema,
    server: commonWordServerConfigSchema,
    answer: commonWordAnswerSchema,
  },
  "trivia.symbol_cipher_word": {
    client: symbolCipherWordClientConfigSchema,
    server: symbolCipherWordServerConfigSchema,
    answer: symbolCipherWordAnswerSchema,
  },
  "geography.select_on_map": {
    client: geographySelectOnMapClientConfigSchema,
    server: geographySelectOnMapServerConfigSchema,
    answer: geographySelectOnMapAnswerSchema,
  },
  "focus.odd_one_out": {
    client: focusOddOneOutClientConfigSchema,
    server: focusOddOneOutServerConfigSchema,
    answer: focusOddOneOutAnswerSchema,
  },
  "focus.vertical_reflection": {
    client: verticalReflectionClientConfigSchema,
    server: verticalReflectionServerConfigSchema,
    answer: verticalReflectionAnswerSchema,
  },
  "order.sequence_sort": {
    client: orderSequenceSortClientConfigSchema,
    server: orderSequenceSortServerConfigSchema,
    answer: orderSequenceSortAnswerSchema,
  },
  "precision.maze_path": {
    client: precisionMazePathClientConfigSchema,
    server: precisionMazePathServerConfigSchema,
    answer: precisionMazePathAnswerSchema,
  },
  "precision.neon_cable": {
    client: precisionNeonCableClientConfigSchema,
    server: precisionNeonCableServerConfigSchema,
    answer: precisionNeonCableAnswerSchema,
  },
  "gesture.fog_wipe": {
    client: gestureFogWipeClientConfigSchema,
    server: gestureFogWipeServerConfigSchema,
    answer: gestureFogWipeAnswerSchema,
  },
  "precision.circuit_rotation": {
    client: precisionCircuitRotationClientConfigSchema,
    server: precisionCircuitRotationServerConfigSchema,
    answer: precisionCircuitRotationAnswerSchema,
  },
  "precision.cable_untangle": {
    client: precisionCableUntangleClientConfigSchema,
    server: precisionCableUntangleServerConfigSchema,
    answer: precisionCableUntangleAnswerSchema,
  },
  "logic.balance_scale": {
    client: logicBalanceScaleClientConfigSchema,
    server: logicBalanceScaleServerConfigSchema,
    answer: logicBalanceScaleAnswerSchema,
  },
  "logic.complete_sum": {
    client: logicCompleteSumClientConfigSchema,
    server: logicCompleteSumServerConfigSchema,
    answer: logicCompleteSumAnswerSchema,
  },
  "logic.three_doors": {
    client: threeDoorsClientConfigSchema,
    server: threeDoorsServerConfigSchema,
    answer: threeDoorsAnswerSchema,
  },
  "focus.stroop": {
    client: focusStroopClientConfigSchema,
    server: focusStroopServerConfigSchema,
    answer: focusStroopAnswerSchema,
  },
  "search.select_occurrences": {
    client: searchSelectOccurrencesClientConfigSchema,
    server: searchSelectOccurrencesServerConfigSchema,
    answer: searchSelectOccurrencesAnswerSchema,
  },
  "social.pass_the_pulse": {
    client: socialPassThePulseClientConfigSchema,
    server: socialPassThePulseServerConfigSchema,
    answer: socialPassThePulseAnswerSchema,
  },
  "precision.ring_lock": {
    client: precisionRingLockClientConfigSchema,
    server: precisionRingLockServerConfigSchema,
    answer: precisionRingLockAnswerSchema,
  },
  "laser.routing": {
    client: laserRoutingClientConfigSchema,
    server: laserRoutingServerConfigSchema,
    answer: laserRoutingAnswerSchema,
  },
};

export type ValidatedEngineConfigs =
  | {
      engineId: "reaction.wait_for_signal";
      clientConfig: ReactionWaitForSignalClientConfig;
      serverConfig: ReactionWaitForSignalServerConfig;
    }
  | {
      engineId: "trap.no_touch";
      clientConfig: TrapNoTouchClientConfig;
      serverConfig: TrapNoTouchServerConfig;
    }
  | {
      engineId: "gesture.reverse_swipe";
      clientConfig: GestureReverseSwipeClientConfig;
      serverConfig: GestureReverseSwipeServerConfig;
    }
  | {
      engineId: "tap.precision";
      clientConfig: TapPrecisionClientConfig;
      serverConfig: TapPrecisionServerConfig;
    }
  | {
      engineId: "memory.sequence";
      clientConfig: MemorySequenceClientConfig;
      serverConfig: MemorySequenceServerConfig;
    }
  | {
      engineId: "hold.multitouch";
      clientConfig: HoldMultitouchClientConfig;
      serverConfig: HoldMultitouchServerConfig;
    }
  | {
      engineId: "motion.shake";
      clientConfig: MotionShakeClientConfig;
      serverConfig: MotionShakeServerConfig;
    }
  | {
      engineId: "motion.tilt_balance";
      clientConfig: MotionTiltBalanceClientConfig;
      serverConfig: MotionTiltBalanceServerConfig;
    }
  | {
      engineId: "audio.cue";
      clientConfig: AudioCueClientConfig;
      serverConfig: AudioCueServerConfig;
    }
  | {
      engineId: "social.pair_sync";
      clientConfig: SocialPairSyncClientConfig;
      serverConfig: SocialPairSyncServerConfig;
    }
  | {
      engineId: "tactical.risk_choice";
      clientConfig: TacticalRiskChoiceClientConfig;
      serverConfig: TacticalRiskChoiceServerConfig;
    }
  | {
      engineId: "trivia.multiple_choice";
      clientConfig: TriviaMultipleChoiceClientConfig;
      serverConfig: TriviaMultipleChoiceServerConfig;
    }
  | {
      engineId: "audio.multiple_choice";
      clientConfig: AudioMultipleChoiceClientConfig;
      serverConfig: AudioMultipleChoiceServerConfig;
    }
  | {
      engineId: "trivia.common_word";
      clientConfig: CommonWordClientConfig;
      serverConfig: CommonWordServerConfig;
    }
  | {
      engineId: "trivia.symbol_cipher_word";
      clientConfig: SymbolCipherWordClientConfig;
      serverConfig: SymbolCipherWordServerConfig;
    }
  | {
      engineId: "geography.select_on_map";
      clientConfig: GeographySelectOnMapClientConfig;
      serverConfig: GeographySelectOnMapServerConfig;
    }
  | {
      engineId: "focus.odd_one_out";
      clientConfig: FocusOddOneOutClientConfig;
      serverConfig: FocusOddOneOutServerConfig;
    }
  | {
      engineId: "focus.vertical_reflection";
      clientConfig: VerticalReflectionClientConfig;
      serverConfig: VerticalReflectionServerConfig;
    }
  | {
      engineId: "order.sequence_sort";
      clientConfig: OrderSequenceSortClientConfig;
      serverConfig: OrderSequenceSortServerConfig;
    }
  | {
      engineId: "precision.maze_path";
      clientConfig: PrecisionMazePathClientConfig;
      serverConfig: PrecisionMazePathServerConfig;
    }
  | {
      engineId: "precision.neon_cable";
      clientConfig: PrecisionNeonCableClientConfig;
      serverConfig: PrecisionNeonCableServerConfig;
    }
  | {
      engineId: "gesture.fog_wipe";
      clientConfig: GestureFogWipeClientConfig;
      serverConfig: GestureFogWipeServerConfig;
    }
  | {
      engineId: "precision.circuit_rotation";
      clientConfig: PrecisionCircuitRotationClientConfig;
      serverConfig: PrecisionCircuitRotationServerConfig;
    }
  | {
      engineId: "precision.cable_untangle";
      clientConfig: PrecisionCableUntangleClientConfig;
      serverConfig: PrecisionCableUntangleServerConfig;
    }
  | {
      engineId: "logic.balance_scale";
      clientConfig: LogicBalanceScaleClientConfig;
      serverConfig: LogicBalanceScaleServerConfig;
    }
  | {
      engineId: "logic.complete_sum";
      clientConfig: LogicCompleteSumClientConfig;
      serverConfig: LogicCompleteSumServerConfig;
    }
  | {
      engineId: "logic.three_doors";
      clientConfig: ThreeDoorsClientConfig;
      serverConfig: ThreeDoorsServerConfig;
    }
  | {
      engineId: "focus.stroop";
      clientConfig: FocusStroopClientConfig;
      serverConfig: FocusStroopServerConfig;
    }
  | {
      engineId: "search.select_occurrences";
      clientConfig: SearchSelectOccurrencesClientConfig;
      serverConfig: SearchSelectOccurrencesServerConfig;
    }
  | {
      engineId: "social.pass_the_pulse";
      clientConfig: SocialPassThePulseClientConfig;
      serverConfig: SocialPassThePulseServerConfig;
    }
  | {
      engineId: "precision.ring_lock";
      clientConfig: PrecisionRingLockClientConfig;
      serverConfig: PrecisionRingLockServerConfig;
    }
  | {
      engineId: "laser.routing";
      clientConfig: LaserRoutingClientConfig;
      serverConfig: LaserRoutingServerConfig;
    };

export type ValidatedEngineAnswer =
  | {
      engineId: "reaction.wait_for_signal";
      answer: ReactionWaitForSignalAnswer;
    }
  | { engineId: "trap.no_touch"; answer: TrapNoTouchAnswer }
  | {
      engineId: "gesture.reverse_swipe";
      answer: GestureReverseSwipeAnswer;
    }
  | { engineId: "tap.precision"; answer: TapPrecisionAnswer }
  | { engineId: "memory.sequence"; answer: MemorySequenceAnswer }
  | { engineId: "hold.multitouch"; answer: HoldMultitouchAnswer }
  | { engineId: "motion.shake"; answer: MotionShakeAnswer }
  | { engineId: "motion.tilt_balance"; answer: MotionTiltBalanceAnswer }
  | { engineId: "audio.cue"; answer: AudioCueAnswer }
  | { engineId: "social.pair_sync"; answer: SocialPairSyncAnswer }
  | { engineId: "tactical.risk_choice"; answer: TacticalRiskChoiceAnswer }
  | { engineId: "trivia.multiple_choice"; answer: TriviaMultipleChoiceAnswer }
  | { engineId: "audio.multiple_choice"; answer: AudioMultipleChoiceAnswer }
  | { engineId: "trivia.common_word"; answer: CommonWordAnswer }
  | { engineId: "trivia.symbol_cipher_word"; answer: SymbolCipherWordAnswer }
  | { engineId: "geography.select_on_map"; answer: GeographySelectOnMapAnswer }
  | { engineId: "focus.odd_one_out"; answer: FocusOddOneOutAnswer }
  | { engineId: "focus.vertical_reflection"; answer: VerticalReflectionAnswer }
  | { engineId: "order.sequence_sort"; answer: OrderSequenceSortAnswer }
  | { engineId: "precision.maze_path"; answer: PrecisionMazePathAnswer }
  | { engineId: "precision.neon_cable"; answer: PrecisionNeonCableAnswer }
  | { engineId: "gesture.fog_wipe"; answer: GestureFogWipeAnswer }
  | {
      engineId: "precision.circuit_rotation";
      answer: PrecisionCircuitRotationAnswer;
    }
  | {
      engineId: "precision.cable_untangle";
      answer: PrecisionCableUntangleAnswer;
    }
  | { engineId: "logic.balance_scale"; answer: LogicBalanceScaleAnswer }
  | { engineId: "logic.complete_sum"; answer: LogicCompleteSumAnswer }
  | { engineId: "logic.three_doors"; answer: ThreeDoorsAnswer }
  | { engineId: "focus.stroop"; answer: FocusStroopAnswer }
  | {
      engineId: "search.select_occurrences";
      answer: SearchSelectOccurrencesAnswer;
    }
  | { engineId: "social.pass_the_pulse"; answer: SocialPassThePulseAnswer }
  | { engineId: "precision.ring_lock"; answer: PrecisionRingLockAnswer }
  | { engineId: "laser.routing"; answer: LaserRoutingAnswer };

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

  if (id === "gesture.reverse_swipe") {
    const c = client as GestureReverseSwipeClientConfig;
    const s = server as GestureReverseSwipeServerConfig;
    if (s.requiredDirection !== oppositeSwipeDirection(c.displayedDirection)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message:
            "serverConfig.requiredDirection must be opposite of clientConfig.displayedDirection",
          path: ["serverConfig", "requiredDirection"],
        },
      ]);
    }
  }

  if (id === "tap.precision") {
    const c = client as TapPrecisionClientConfig;
    const s = server as TapPrecisionServerConfig;
    if (c.attemptCount !== s.attemptCount) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server attemptCount must match",
          path: ["serverConfig", "attemptCount"],
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
            path: ["serverConfig", "targetIds"],
          },
        ]);
      }
    }
  }

  if (id === "memory.sequence") {
    const c = client as MemorySequenceClientConfig;
    const s = server as MemorySequenceServerConfig;
    if (c.previewMs !== s.previewMs) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server previewMs must match",
          path: ["serverConfig", "previewMs"],
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
            "client and server optionKeys must be the same set (order may differ)",
          path: ["clientConfig", "optionKeys"],
        },
      ]);
    }
  }

  if (id === "hold.multitouch") {
    const c = client as HoldMultitouchClientConfig;
    const s = server as HoldMultitouchServerConfig;
    if (c.holdMs !== s.holdMs) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server holdMs must match",
          path: ["serverConfig", "holdMs"],
        },
      ]);
    }
  }

  if (id === "social.pair_sync") {
    const c = client as SocialPairSyncClientConfig;
    const s = server as SocialPairSyncServerConfig;
    const cKeys = new Set(c.partnerRoleKeys);
    const sKeys = new Set(s.partnerRoleKeys);
    if (cKeys.size !== sKeys.size || [...cKeys].some((k) => !sKeys.has(k))) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server partnerRoleKeys must be the same set",
          path: ["serverConfig", "partnerRoleKeys"],
        },
      ]);
    }
  }

  if (id === "tactical.risk_choice") {
    const c = client as TacticalRiskChoiceClientConfig;
    const s = server as TacticalRiskChoiceServerConfig;
    const cOpts = new Set(c.optionKeys);
    const sOpts = new Set(s.optionKeys);
    if (cOpts.size !== sOpts.size || [...cOpts].some((k) => !sOpts.has(k))) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server optionKeys must be the same set",
          path: ["serverConfig", "optionKeys"],
        },
      ]);
    }
  }

  if (id === "precision.neon_cable") {
    const c = client as PrecisionNeonCableClientConfig;
    const s = server as PrecisionNeonCableServerConfig;
    if (c.correctSocketId !== s.correctSocketId) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server correctSocketId must match",
          path: ["serverConfig", "correctSocketId"],
        },
      ]);
    }
    if (!s.sockets.some((sock) => sock.socketId === s.correctSocketId)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "correctSocketId must reference a socket in sockets",
          path: ["serverConfig", "correctSocketId"],
        },
      ]);
    }
    if (c.wrongDropPolicy !== s.wrongDropPolicy) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server wrongDropPolicy must match",
          path: ["serverConfig", "wrongDropPolicy"],
        },
      ]);
    }
  }

  if (id === "gesture.fog_wipe") {
    const c = client as GestureFogWipeClientConfig;
    const s = server as GestureFogWipeServerConfig;
    if (c.clearanceRatioMin !== s.clearanceRatioMin) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server clearanceRatioMin must match",
          path: ["serverConfig", "clearanceRatioMin"],
        },
      ]);
    }
    if (c.assetIds.revealContent !== s.assetIds.revealContent) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server assetIds.revealContent must match",
          path: ["serverConfig", "assetIds", "revealContent"],
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
          message: "assetIds.revealContent must equal revealContentVariants[0]",
          path: ["serverConfig", "assetIds", "revealContent"],
        },
      ]);
    }
  }

  if (id === "precision.circuit_rotation") {
    const c = client as PrecisionCircuitRotationClientConfig;
    const s = server as PrecisionCircuitRotationServerConfig;
    for (const field of [
      "grid",
      "source",
      "target",
      "tiles",
      "stationaryConnections",
      "assetIds",
    ] as const) {
      if (JSON.stringify(c[field]) !== JSON.stringify(s[field])) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: `client and server ${field} must match`,
            path: ["serverConfig", field],
          },
        ]);
      }
    }
  }

  if (id === "precision.cable_untangle") {
    const c = client as PrecisionCableUntangleClientConfig;
    const s = server as PrecisionCableUntangleServerConfig;
    for (const field of [
      "layout",
      "sockets",
      "cables",
      "theme",
      "assetIds",
    ] as const) {
      if (JSON.stringify(c[field]) !== JSON.stringify(s[field])) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: `client and server ${field} must match`,
            path: ["serverConfig", field],
          },
        ]);
      }
    }
    if (c.snapRadiusNorm !== s.snapRadiusNorm) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server snapRadiusNorm must match",
          path: ["serverConfig", "snapRadiusNorm"],
        },
      ]);
    }
    if (c.mirrorHorizontally !== s.mirrorHorizontally) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server mirrorHorizontally must match",
          path: ["serverConfig", "mirrorHorizontally"],
        },
      ]);
    }
  }

  if (id === "laser.routing") {
    const c = client as LaserRoutingClientConfig;
    const s = server as LaserRoutingServerConfig;
    if (c.variant !== s.variant) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server variant must match",
          path: ["serverConfig", "variant"],
        },
      ]);
    }
    if (c.startDelayMs !== s.startDelayMs) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server startDelayMs must match",
          path: ["serverConfig", "startDelayMs"],
        },
      ]);
    }
    if (JSON.stringify(c.assetIds) !== JSON.stringify(s.assetIds)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "client and server assetIds must match",
          path: ["serverConfig", "assetIds"],
        },
      ]);
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
