import { z } from 'zod';
import {
  matchReleasePinsSchema,
  powerIdSchema,
} from '../../content/v1/releases';

export const REALTIME_SCHEMA_VERSION = '1' as const;

export const MessageTypes = {
  // Client commands
  MatchCreateDev: 'match.create_dev',
  MatchJoin: 'match.join',
  MatchResume: 'match.resume',
  MatchSubmitAnswer: 'match.submit_answer',
  MatchRequestSnapshot: 'match.request_snapshot',
  MatchFillDevBots: 'match.fill_dev_bots',
  MatchmakingEnqueue: 'matchmaking.enqueue',
  MatchmakingCancel: 'matchmaking.cancel',
  PrivateRoomCreate: 'private_room.create',
  PrivateRoomJoin: 'private_room.join',
  MatchReady: 'match.ready',
  MatchLeave: 'match.leave',
  MatchExtendLobbyFill: 'match.extend_lobby_fill',
  MatchStartLobby: 'match.start_lobby',
  TrainingStart: 'training.start',
  TrainingRetry: 'training.retry',
  MatchRematch: 'match.rematch',
  PowerUse: 'power.use',
  PowerDefend: 'power.defend',
  PowerSkip: 'power.skip',
  // Server events
  SessionAccepted: 'session.accepted',
  MatchSnapshot: 'match.snapshot',
  PlayerPresence: 'match.player_presence',
  ChallengeStarted: 'challenge.started',
  ChallengeSignal: 'challenge.signal',
  ChallengeSignalEnded: 'challenge.signal_ended',
  ChallengeSubmissionAck: 'challenge.submission_ack',
  ChallengeResolved: 'challenge.resolved',
  MatchStateChanged: 'match.state_changed',
  MatchFinished: 'match.finished',
  MatchDrawn: 'match.drawn',
  MatchmakingStatus: 'matchmaking.status',
  PowerGranted: 'power.granted',
  PowerInventoryFull: 'power.inventory_full',
  PowerOffered: 'power.offered',
  PowerUsed: 'power.used',
  PowerDefenseRequired: 'power.defense_required',
  PowerResolved: 'power.resolved',
  ProtocolError: 'protocol.error',
} as const;

export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];

const uuidLike = z.string().min(1).max(128);
const nonEmpty = z.string().min(1).max(256);

export const envelopeBaseSchema = z.object({
  schemaVersion: z.literal(REALTIME_SCHEMA_VERSION),
  type: z.string().min(1).max(64),
  messageId: uuidLike,
  matchId: uuidLike.optional(),
  commandId: uuidLike.optional(),
  correlationId: uuidLike.optional(),
  // Nonnegative so create-match snapshots at sequence 0 remain valid.
  serverSequence: z.number().int().nonnegative().optional(),
  serverTimestampMs: z.number().int().nonnegative().optional(),
});

export const createDevMatchPayloadSchema = z
  .object({
    // Intentionally empty — server creates the match.
  })
  .strict();

export const joinMatchPayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const resumeMatchPayloadSchema = z
  .object({
    matchId: uuidLike,
    resumeToken: nonEmpty,
  })
  .strict();

export const submitAnswerPayloadSchema = z
  .object({
    challengeInstanceId: uuidLike,
    // Opaque validated answer object — never includes authoritative result fields.
    answer: z
      .record(z.unknown())
      .refine(
        (value) =>
          !('success' in value) &&
          !('correct' in value) &&
          !('hearts' in value) &&
          !('energy' in value) &&
          !('winnerId' in value) &&
          !('elapsedMs' in value),
        {
          message:
            'answer must not include authoritative result or timing fields',
        },
      ),
  })
  .strict();

export const requestSnapshotPayloadSchema = z
  .object({
    matchId: uuidLike,
    afterSequence: z.number().int().nonnegative().optional(),
  })
  .strict();

export const fillDevBotsPayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const matchModeSchema = z.enum([
  'quick_survival',
  'private',
  'training',
  'dev',
]);

export type MatchMode = z.infer<typeof matchModeSchema>;

const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'displayName contains unsupported characters');

const avatarColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'avatarColor must be a hex color');

export const playerIdentityPayloadSchema = z
  .object({
    displayName: displayNameSchema,
    avatarColor: avatarColorSchema,
  })
  .strict();

export const matchmakingEnqueuePayloadSchema = playerIdentityPayloadSchema;

export const matchmakingCancelPayloadSchema = z
  .object({
    ticketId: uuidLike.optional(),
  })
  .strict();

export const privateRoomCreatePayloadSchema = playerIdentityPayloadSchema;

export const privateRoomJoinPayloadSchema = playerIdentityPayloadSchema
  .extend({
    roomCode: z
      .string()
      .trim()
      .min(4)
      .max(8)
      .regex(/^[A-Za-z0-9]+$/, 'roomCode must be alphanumeric'),
  })
  .strict();

export const matchReadyPayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const matchLeavePayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const matchExtendLobbyFillPayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const matchStartLobbyPayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const trainingStartPayloadSchema = playerIdentityPayloadSchema;

export const trainingRetryPayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const matchRematchPayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const powerUsePayloadSchema = z
  .object({
    powerId: z.literal('danger_pulse'),
    targetPlayerId: uuidLike,
  })
  .strict();

export const powerDefendPayloadSchema = z
  .object({
    attackId: uuidLike,
    choice: z.enum(['none', 'shield', 'reflect']),
  })
  .strict();

export const powerSkipPayloadSchema = z
  .object({
    matchId: uuidLike,
  })
  .strict();

export const clientCommandSchema = envelopeBaseSchema
  .extend({
    type: z.enum([
      MessageTypes.MatchCreateDev,
      MessageTypes.MatchJoin,
      MessageTypes.MatchResume,
      MessageTypes.MatchSubmitAnswer,
      MessageTypes.MatchRequestSnapshot,
      MessageTypes.MatchFillDevBots,
      MessageTypes.MatchmakingEnqueue,
      MessageTypes.MatchmakingCancel,
      MessageTypes.PrivateRoomCreate,
      MessageTypes.PrivateRoomJoin,
      MessageTypes.MatchReady,
      MessageTypes.MatchLeave,
      MessageTypes.MatchExtendLobbyFill,
      MessageTypes.MatchStartLobby,
      MessageTypes.TrainingStart,
      MessageTypes.TrainingRetry,
      MessageTypes.MatchRematch,
      MessageTypes.PowerUse,
      MessageTypes.PowerDefend,
      MessageTypes.PowerSkip,
    ]),
    commandId: uuidLike,
    payload: z.unknown(),
  })
  .superRefine((value, ctx) => {
    const map = {
      [MessageTypes.MatchCreateDev]: createDevMatchPayloadSchema,
      [MessageTypes.MatchJoin]: joinMatchPayloadSchema,
      [MessageTypes.MatchResume]: resumeMatchPayloadSchema,
      [MessageTypes.MatchSubmitAnswer]: submitAnswerPayloadSchema,
      [MessageTypes.MatchRequestSnapshot]: requestSnapshotPayloadSchema,
      [MessageTypes.MatchFillDevBots]: fillDevBotsPayloadSchema,
      [MessageTypes.MatchmakingEnqueue]: matchmakingEnqueuePayloadSchema,
      [MessageTypes.MatchmakingCancel]: matchmakingCancelPayloadSchema,
      [MessageTypes.PrivateRoomCreate]: privateRoomCreatePayloadSchema,
      [MessageTypes.PrivateRoomJoin]: privateRoomJoinPayloadSchema,
      [MessageTypes.MatchReady]: matchReadyPayloadSchema,
      [MessageTypes.MatchLeave]: matchLeavePayloadSchema,
      [MessageTypes.MatchExtendLobbyFill]: matchExtendLobbyFillPayloadSchema,
      [MessageTypes.MatchStartLobby]: matchStartLobbyPayloadSchema,
      [MessageTypes.TrainingStart]: trainingStartPayloadSchema,
      [MessageTypes.TrainingRetry]: trainingRetryPayloadSchema,
      [MessageTypes.MatchRematch]: matchRematchPayloadSchema,
      [MessageTypes.PowerUse]: powerUsePayloadSchema,
      [MessageTypes.PowerDefend]: powerDefendPayloadSchema,
      [MessageTypes.PowerSkip]: powerSkipPayloadSchema,
    } as const;
    const schema = map[value.type];
    const parsed = schema.safeParse(value.payload);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload'],
        message: 'payload failed schema validation',
      });
    }
  });

export const challengeDurationMsSchema = z
  .number()
  .int()
  .min(3000, 'challenge duration must be at least 3000ms')
  .max(8000, 'challenge duration must be at most 8000ms');

export const matchPhaseSchema = z.enum([
  'lobby',
  'ready_countdown',
  'challenge_intro',
  'challenge_active',
  'round_result',
  'power_action',
  'power_defense',
  'completed',
  'draw',
  'halted',
]);

export type MatchPhase = z.infer<typeof matchPhaseSchema>;

export const roundPhaseSchema = z.enum([
  'waiting_signal',
  'signal_active',
  'signal_expired',
  'preview',
  'answer',
  'resolved',
]);

export type RoundPhase = z.infer<typeof roundPhaseSchema>;

export const playerPowerInventorySchema = z
  .object({
    danger_pulse: z.number().int().min(0).max(1),
    shield: z.number().int().min(0).max(1),
    reflection: z.number().int().min(0).max(1),
  })
  .strict();

export const playerPublicSchema = z
  .object({
    playerId: uuidLike,
    hearts: z.number().int().min(0).max(3),
    /** Current meter segments (0..energyThreshold-1 after convert; 0..4 before). */
    energy: z.number().int().min(0).max(4),
    status: z.enum(['active', 'spectator']),
    presence: z.enum(['connected', 'disconnected']),
    submittedForCurrentChallenge: z.boolean(),
    inventory: playerPowerInventorySchema.optional(),
    /** Protected through the end of this challenge round number (inclusive). */
    protectedThroughRound: z.number().int().nonnegative().nullable().optional(),
    lastDangerPulseTargetId: uuidLike.nullable().optional(),
    displayName: displayNameSchema.optional(),
    avatarColor: avatarColorSchema.optional(),
    ready: z.boolean().optional(),
    isBot: z.boolean().optional(),
    isHost: z.boolean().optional(),
  })
  .strict();

export const pendingPowerAttackSchema = z
  .object({
    attackId: uuidLike,
    attackerId: uuidLike,
    targetId: uuidLike,
    powerId: z.literal('danger_pulse'),
    reflected: z.boolean(),
    defenseDeadlineAtMs: z.number().int().nonnegative(),
  })
  .strict();

export const matchTacticalStateSchema = z
  .object({
    pendingAttack: pendingPowerAttackSchema.nullable(),
    eligibleTargetIds: z.array(uuidLike).optional(),
    actorsWithOffensiveCharge: z.array(uuidLike).optional(),
    lastGrant: z
      .object({
        playerId: uuidLike,
        powerId: powerIdSchema.nullable(),
        outcome: z.enum(['granted', 'inventory_full']),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

/** Public challenge fields shared by challenge.started and active snapshot. */
export const publicChallengeSchema = z
  .object({
    challengeInstanceId: uuidLike,
    definitionId: nonEmpty,
    definitionVersion: z.number().int().positive(),
    engineId: nonEmpty,
    // Translation keys only — never product copy.
    promptKey: nonEmpty,
    // Optional / empty for non-choice engines.
    choiceKeys: z.array(nonEmpty).optional(),
    clientConfig: z.record(z.unknown()),
    serverNowMs: z.number().int().nonnegative(),
    startsAtMs: z.number().int().nonnegative(),
    deadlineAtMs: z.number().int().nonnegative(),
    durationMs: challengeDurationMsSchema,
    roundPhase: roundPhaseSchema,
    signalToken: z.string().optional(),
    signaledAtMs: z.number().int().nonnegative().optional(),
    /** Wall-clock end of the blue-heart window (server-driven). */
    signalEndsAtMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ('serverConfig' in value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'serverConfig must never appear in public challenge payloads',
      });
    }
    if ('expectedChoice' in value.clientConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clientConfig', 'expectedChoice'],
        message: 'expected answers must not appear in clientConfig',
      });
    }
  });

export const playerChallengeResolutionSchema = z
  .object({
    playerId: uuidLike,
    outcome: z.enum(['success', 'failure', 'timeout', 'skipped_spectator']),
    heartsDelta: z.number().int(),
    energyDelta: z.number().int(),
    heartsAfter: z.number().int().min(0).max(3),
    energyAfter: z.number().int().min(0).max(4),
    statusAfter: z.enum(['active', 'spectator']),
    /** Translation key explaining the outcome (success/failure/timeout reason). */
    reasonKey: nonEmpty.optional(),
    /** Measured player performance for this challenge when applicable. */
    measureMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export const lastRoundResultSchema = z
  .object({
    challengeInstanceId: uuidLike,
    resolutions: z.array(playerChallengeResolutionSchema),
  })
  .strict();

export const matchSnapshotPayloadSchema = z
  .object({
    matchId: uuidLike,
    status: z.enum([
      'waiting',
      'challenge_active',
      'resolving',
      'completed',
    ]),
    phase: matchPhaseSchema,
    phaseDeadlineAtMs: z.number().int().nullable(),
    /** Quick Survival open-lobby fill wait end (wall clock); null when sealed. */
    lobbyFillDeadlineAtMs: z.number().int().nullable().optional(),
    roundNumber: z.number().int().nonnegative(),
    serverNowMs: z.number().int().nonnegative(),
    lastRoundResult: lastRoundResultSchema.nullable(),
    nextPhaseAtMs: z.number().int().nullable(),
    revision: z.number().int().positive(),
    sequence: z.number().int().nonnegative(),
    players: z.array(playerPublicSchema),
    winnerId: uuidLike.nullable(),
    currentChallenge: publicChallengeSchema.nullable(),
    mode: matchModeSchema.optional(),
    hostPlayerId: uuidLike.nullable().optional(),
    roomCode: z.string().min(4).max(8).nullable().optional(),
    /** Immutable content pins for this match; required for new matches (LH-006). */
    releasePins: matchReleasePinsSchema.nullable().optional(),
    /** Between-round tactical window state (LH-008). */
    tactical: matchTacticalStateSchema.nullable().optional(),
  })
  .strict();

export const matchmakingStatusPayloadSchema = z
  .object({
    ticketId: uuidLike,
    state: z.enum([
      'queued',
      'assigned',
      'cancelled',
      'timed_out',
      'failed',
    ]),
    acceptedSeats: z.number().int().min(0).max(6),
    capacity: z.literal(6),
    timeoutAtMs: z.number().int().nonnegative().nullable(),
    matchId: uuidLike.nullable(),
    serverNowMs: z.number().int().nonnegative(),
  })
  .strict();

/** Creator match.create_dev acceptance — no player credentials. */
export const sessionAcceptedCreatorPayloadSchema = z
  .object({
    matchId: uuidLike,
    role: z.literal('creator'),
  })
  .strict();

/** Player join/resume acceptance — full credentials, no creator role. */
export const sessionAcceptedPlayerPayloadSchema = z
  .object({
    matchId: uuidLike,
    playerId: uuidLike,
    resumeToken: nonEmpty,
  })
  .strict();

/** Mutually exclusive session.accepted payload shapes. */
export const sessionAcceptedPayloadSchema = z.union([
  sessionAcceptedCreatorPayloadSchema,
  sessionAcceptedPlayerPayloadSchema,
]);

export const playerPresencePayloadSchema = z
  .object({
    playerId: uuidLike,
    presence: z.enum(['connected', 'disconnected']),
    joined: z.boolean(),
  })
  .strict();

export const challengeStartedPayloadSchema = publicChallengeSchema;

export const challengeSignalPayloadSchema = z
  .object({
    challengeInstanceId: uuidLike,
    signalToken: nonEmpty,
    signaledAtMs: z.number().int().nonnegative(),
    /** Inclusive-exclusive window end: blue while serverNow < signalEndsAtMs. */
    signalEndsAtMs: z.number().int().nonnegative(),
    serverNowMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.signalEndsAtMs <= value.signaledAtMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'signalEndsAtMs must be greater than signaledAtMs',
        path: ['signalEndsAtMs'],
      });
    }
  });

export const challengeSignalEndedPayloadSchema = z
  .object({
    challengeInstanceId: uuidLike,
    signalEndsAtMs: z.number().int().nonnegative(),
    serverNowMs: z.number().int().nonnegative(),
  })
  .strict();

export const challengeSubmissionAckPayloadSchema = z
  .object({
    accepted: z.boolean(),
    reasonKey: nonEmpty.optional(),
    duplicate: z.boolean().optional(),
  })
  .strict();

export const challengeResolvedPayloadSchema = z
  .object({
    challengeInstanceId: uuidLike,
    resolutions: z.array(playerChallengeResolutionSchema),
  })
  .strict();

export const matchStateChangedPayloadSchema = z
  .object({
    status: z.enum([
      'waiting',
      'challenge_active',
      'resolving',
      'completed',
    ]),
    reasonKey: nonEmpty.optional(),
  })
  .strict();

export const matchFinishedPayloadSchema = z
  .object({
    winnerId: uuidLike,
  })
  .strict();

/** Catalog exhausted with tied top hearts — no winner. */
export const matchDrawnPayloadSchema = z.object({}).strict();

export const powerGrantedPayloadSchema = z
  .object({
    playerId: uuidLike,
    powerId: powerIdSchema,
    energyAfter: z.number().int().min(0).max(4),
  })
  .strict();

export const powerInventoryFullPayloadSchema = z
  .object({
    playerId: uuidLike,
    energyAfter: z.number().int().min(0).max(4),
  })
  .strict();

export const powerOfferedPayloadSchema = z
  .object({
    actorsWithOffensiveCharge: z.array(uuidLike),
    actionDeadlineAtMs: z.number().int().nonnegative(),
  })
  .strict();

export const powerUsedPayloadSchema = z
  .object({
    attackId: uuidLike,
    attackerId: uuidLike,
    targetId: uuidLike,
    powerId: z.literal('danger_pulse'),
  })
  .strict();

export const powerDefenseRequiredPayloadSchema = z
  .object({
    attackId: uuidLike,
    attackerId: uuidLike,
    targetId: uuidLike,
    reflected: z.boolean(),
    defenseDeadlineAtMs: z.number().int().nonnegative(),
  })
  .strict();

export const powerResolvedPayloadSchema = z
  .object({
    attackId: uuidLike,
    attackerId: uuidLike,
    targetId: uuidLike,
    outcome: z.enum([
      'hit',
      'shielded',
      'reflected_hit',
      'reflected_shielded',
      'expired',
      'cancelled',
    ]),
    heartsDeltaTarget: z.number().int(),
    heartsAfterTarget: z.number().int().min(0).max(3),
    statusAfterTarget: z.enum(['active', 'spectator']),
  })
  .strict();

export const protocolErrorPayloadSchema = z
  .object({
    code: z.enum([
      'INVALID_SCHEMA_VERSION',
      'UNKNOWN_MESSAGE_TYPE',
      'INVALID_PAYLOAD',
      'UNAUTHORIZED',
      'MATCH_NOT_FOUND',
      'MATCH_FULL',
      'MATCH_NOT_JOINABLE',
      'SPECTATOR_CANNOT_SUBMIT',
      'CHALLENGE_NOT_ACTIVE',
      'SUBMISSION_LATE',
      'DUPLICATE_COMMAND',
      'INTERNAL_ERROR',
      'DEV_ONLY_FORBIDDEN',
      'ROOM_CODE_INVALID',
      'ROOM_CODE_EXPIRED',
      'ROOM_FULL',
      'QUEUE_CANCELLED',
      'QUEUE_TIMEOUT',
      'QUEUE_NOT_FOUND',
      'ALREADY_IN_QUEUE',
      'ALREADY_IN_MATCH',
      'NOT_IN_MATCH',
      'NOT_HOST',
      'REMATCH_UNAVAILABLE',
      'MATCHMAKING_PAUSED',
      'TRAINING_UNAVAILABLE',
      'POWER_NOT_AVAILABLE',
      'POWER_PHASE_INVALID',
      'ILLEGAL_POWER_TARGET',
      'POWER_ATTACK_NOT_FOUND',
      'OFFENSIVE_POWERS_DISABLED',
    ]),
    // Translation key for client display — never a product sentence.
    messageKey: nonEmpty,
    // Echo the client's commandId when the error is in response to a specific command.
    commandId: uuidLike.optional(),
  })
  .strict();

const serverEventBase = envelopeBaseSchema.extend({
  payload: z.unknown(),
});

export const serverEventSchema = z.discriminatedUnion('type', [
  serverEventBase.extend({
    type: z.literal(MessageTypes.SessionAccepted),
    payload: sessionAcceptedPayloadSchema,
    // Required for session.accepted (overrides optional from envelope base).
    commandId: uuidLike,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.MatchSnapshot),
    payload: matchSnapshotPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.PlayerPresence),
    payload: playerPresencePayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.ChallengeStarted),
    payload: challengeStartedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.ChallengeSignal),
    payload: challengeSignalPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.ChallengeSignalEnded),
    payload: challengeSignalEndedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.ChallengeSubmissionAck),
    payload: challengeSubmissionAckPayloadSchema,
    // Required for challenge.submission_ack (overrides optional from envelope base).
    commandId: uuidLike,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.ChallengeResolved),
    payload: challengeResolvedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.MatchStateChanged),
    payload: matchStateChangedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.MatchFinished),
    payload: matchFinishedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.MatchDrawn),
    payload: matchDrawnPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.MatchmakingStatus),
    payload: matchmakingStatusPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.PowerGranted),
    payload: powerGrantedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.PowerInventoryFull),
    payload: powerInventoryFullPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.PowerOffered),
    payload: powerOfferedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.PowerUsed),
    payload: powerUsedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.PowerDefenseRequired),
    payload: powerDefenseRequiredPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.PowerResolved),
    payload: powerResolvedPayloadSchema,
  }),
  serverEventBase.extend({
    type: z.literal(MessageTypes.ProtocolError),
    payload: protocolErrorPayloadSchema,
  }),
]);

export type ClientCommand = z.infer<typeof clientCommandSchema>;
export type MatchSnapshotPayload = z.infer<typeof matchSnapshotPayloadSchema>;
export type ProtocolErrorPayload = z.infer<typeof protocolErrorPayloadSchema>;
export type ServerEvent = z.infer<typeof serverEventSchema>;
export type PublicChallenge = z.infer<typeof publicChallengeSchema>;

export function parseClientCommand(input: unknown): ClientCommand {
  const base = envelopeBaseSchema.safeParse(input);
  if (!base.success) {
    throw new ProtocolValidationError('INVALID_PAYLOAD', 'errors.protocol.invalid_payload');
  }
  if (base.data.schemaVersion !== REALTIME_SCHEMA_VERSION) {
    throw new ProtocolValidationError(
      'INVALID_SCHEMA_VERSION',
      'errors.protocol.invalid_schema_version',
    );
  }
  const known = new Set<string>(Object.values(MessageTypes));
  if (!known.has(base.data.type) || !isClientCommandType(base.data.type)) {
    throw new ProtocolValidationError(
      'UNKNOWN_MESSAGE_TYPE',
      'errors.protocol.unknown_message_type',
    );
  }
  const parsed = clientCommandSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProtocolValidationError('INVALID_PAYLOAD', 'errors.protocol.invalid_payload');
  }
  return parsed.data;
}

export function parseServerEvent(input: unknown): ServerEvent {
  const base = envelopeBaseSchema.safeParse(input);
  if (!base.success) {
    throw new ProtocolValidationError('INVALID_PAYLOAD', 'errors.protocol.invalid_payload');
  }
  if (base.data.schemaVersion !== REALTIME_SCHEMA_VERSION) {
    throw new ProtocolValidationError(
      'INVALID_SCHEMA_VERSION',
      'errors.protocol.invalid_schema_version',
    );
  }
  const parsed = serverEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProtocolValidationError('INVALID_PAYLOAD', 'errors.protocol.invalid_payload');
  }
  return parsed.data;
}

export function safeParseServerEvent(
  input: unknown,
): { success: true; data: ServerEvent } | { success: false; error: ProtocolValidationError } {
  try {
    return { success: true, data: parseServerEvent(input) };
  } catch (error) {
    if (error instanceof ProtocolValidationError) {
      return { success: false, error };
    }
    return {
      success: false,
      error: new ProtocolValidationError(
        'INVALID_PAYLOAD',
        'errors.protocol.invalid_payload',
      ),
    };
  }
}

function isClientCommandType(type: string): type is ClientCommand['type'] {
  return (
    type === MessageTypes.MatchCreateDev ||
    type === MessageTypes.MatchJoin ||
    type === MessageTypes.MatchResume ||
    type === MessageTypes.MatchSubmitAnswer ||
    type === MessageTypes.MatchRequestSnapshot ||
    type === MessageTypes.MatchFillDevBots ||
    type === MessageTypes.MatchmakingEnqueue ||
    type === MessageTypes.MatchmakingCancel ||
    type === MessageTypes.PrivateRoomCreate ||
    type === MessageTypes.PrivateRoomJoin ||
    type === MessageTypes.MatchReady ||
    type === MessageTypes.MatchLeave ||
    type === MessageTypes.MatchExtendLobbyFill ||
    type === MessageTypes.MatchStartLobby ||
    type === MessageTypes.TrainingStart ||
    type === MessageTypes.TrainingRetry ||
    type === MessageTypes.MatchRematch ||
    type === MessageTypes.PowerUse ||
    type === MessageTypes.PowerDefend ||
    type === MessageTypes.PowerSkip
  );
}

export class ProtocolValidationError extends Error {
  constructor(
    readonly code: ProtocolErrorPayload['code'],
    readonly messageKey: string,
  ) {
    super('protocol validation failed');
    this.name = 'ProtocolValidationError';
  }
}
