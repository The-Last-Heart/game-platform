import { z } from 'zod';

export const REALTIME_SCHEMA_VERSION = '1' as const;

export const MessageTypes = {
  // Client commands
  MatchCreateDev: 'match.create_dev',
  MatchJoin: 'match.join',
  MatchResume: 'match.resume',
  MatchSubmitAnswer: 'match.submit_answer',
  MatchRequestSnapshot: 'match.request_snapshot',
  // Server events
  SessionAccepted: 'session.accepted',
  MatchSnapshot: 'match.snapshot',
  PlayerPresence: 'match.player_presence',
  ChallengeStarted: 'challenge.started',
  ChallengeSubmissionAck: 'challenge.submission_ack',
  ChallengeResolved: 'challenge.resolved',
  MatchStateChanged: 'match.state_changed',
  MatchFinished: 'match.finished',
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

export const clientCommandSchema = envelopeBaseSchema
  .extend({
    type: z.enum([
      MessageTypes.MatchCreateDev,
      MessageTypes.MatchJoin,
      MessageTypes.MatchResume,
      MessageTypes.MatchSubmitAnswer,
      MessageTypes.MatchRequestSnapshot,
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

export const playerPublicSchema = z
  .object({
    playerId: uuidLike,
    hearts: z.number().int().min(0).max(3),
    energy: z.number().int().min(0),
    status: z.enum(['active', 'spectator']),
    presence: z.enum(['connected', 'disconnected']),
    submittedForCurrentChallenge: z.boolean(),
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

export const matchSnapshotPayloadSchema = z
  .object({
    matchId: uuidLike,
    status: z.enum([
      'waiting',
      'challenge_active',
      'resolving',
      'completed',
    ]),
    revision: z.number().int().positive(),
    sequence: z.number().int().nonnegative(),
    players: z.array(playerPublicSchema),
    winnerId: uuidLike.nullable(),
    currentChallenge: publicChallengeSchema.nullable(),
  })
  .strict();

export const sessionAcceptedPayloadSchema = z
  .object({
    matchId: uuidLike,
    playerId: uuidLike.optional(),
    resumeToken: nonEmpty.optional(),
    role: z.enum(['creator']).optional(),
  })
  .strict();

export const playerPresencePayloadSchema = z
  .object({
    playerId: uuidLike,
    presence: z.enum(['connected', 'disconnected']),
    joined: z.boolean(),
  })
  .strict();

export const challengeStartedPayloadSchema = publicChallengeSchema;

export const challengeSubmissionAckPayloadSchema = z
  .object({
    accepted: z.boolean(),
    reasonKey: nonEmpty.optional(),
    duplicate: z.boolean().optional(),
  })
  .strict();

export const playerChallengeResolutionSchema = z
  .object({
    playerId: uuidLike,
    outcome: z.enum(['success', 'failure', 'timeout', 'skipped_spectator']),
    heartsDelta: z.number().int(),
    energyDelta: z.number().int(),
    heartsAfter: z.number().int().min(0).max(3),
    energyAfter: z.number().int().min(0),
    statusAfter: z.enum(['active', 'spectator']),
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
    ]),
    // Translation key for client display — never a product sentence.
    messageKey: nonEmpty,
  })
  .strict();

const serverEventBase = envelopeBaseSchema.extend({
  payload: z.unknown(),
});

export const serverEventSchema = z.discriminatedUnion('type', [
  serverEventBase.extend({
    type: z.literal(MessageTypes.SessionAccepted),
    payload: sessionAcceptedPayloadSchema,
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
    type: z.literal(MessageTypes.ChallengeSubmissionAck),
    payload: challengeSubmissionAckPayloadSchema,
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
    type === MessageTypes.MatchRequestSnapshot
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
