import { z } from 'zod';

/** Launch pack engine ids owned by LH-007. */
export const LAUNCH_ENGINE_IDS = [
  'reaction.wait_for_signal',
  'trap.no_touch',
  'gesture.reverse_swipe',
  'tap.precision',
  'memory.sequence',
  'hold.multitouch',
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
  })
  .strict();
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
// Cross-engine validators
// ---------------------------------------------------------------------------

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
  | { engineId: 'hold.multitouch'; answer: HoldMultitouchAnswer };

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
