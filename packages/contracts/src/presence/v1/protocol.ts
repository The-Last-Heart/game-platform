import { z } from 'zod';
import {
  envelopeBaseSchema,
  ProtocolValidationError,
  REALTIME_SCHEMA_VERSION,
} from '../../realtime/v1/protocol';

export const PRESENCE_SCHEMA_VERSION = REALTIME_SCHEMA_VERSION;

export const PresenceMessageTypes = {
  Hello: 'presence.hello',
  OnlineCount: 'presence.online_count',
} as const;

export type PresenceMessageType =
  (typeof PresenceMessageTypes)[keyof typeof PresenceMessageTypes];

const clientIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'clientId contains unsupported characters');

export const presenceHelloPayloadSchema = z
  .object({
    clientId: clientIdSchema,
  })
  .strict();

export const presenceOnlineCountPayloadSchema = z
  .object({
    count: z.number().int().nonnegative(),
  })
  .strict();

const uuidLike = z.string().min(1).max(128);

export const presenceHelloCommandSchema = envelopeBaseSchema
  .extend({
    type: z.literal(PresenceMessageTypes.Hello),
    commandId: uuidLike,
    payload: presenceHelloPayloadSchema,
  })
  .strict();

export const presenceOnlineCountEventSchema = envelopeBaseSchema
  .extend({
    type: z.literal(PresenceMessageTypes.OnlineCount),
    serverTimestampMs: z.number().int().nonnegative(),
    payload: presenceOnlineCountPayloadSchema,
  })
  .strict();

export type PresenceHelloCommand = z.infer<typeof presenceHelloCommandSchema>;
export type PresenceOnlineCountEvent = z.infer<
  typeof presenceOnlineCountEventSchema
>;
export type PresenceHelloPayload = z.infer<typeof presenceHelloPayloadSchema>;
export type PresenceOnlineCountPayload = z.infer<
  typeof presenceOnlineCountPayloadSchema
>;

export function parsePresenceHello(input: unknown): PresenceHelloCommand {
  const base = envelopeBaseSchema.safeParse(input);
  if (!base.success) {
    throw new ProtocolValidationError(
      'INVALID_PAYLOAD',
      'errors.protocol.invalid_payload',
    );
  }
  if (base.data.schemaVersion !== PRESENCE_SCHEMA_VERSION) {
    throw new ProtocolValidationError(
      'INVALID_SCHEMA_VERSION',
      'errors.protocol.invalid_schema_version',
    );
  }
  if (base.data.type !== PresenceMessageTypes.Hello) {
    throw new ProtocolValidationError(
      'UNKNOWN_MESSAGE_TYPE',
      'errors.protocol.unknown_message_type',
    );
  }
  const parsed = presenceHelloCommandSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProtocolValidationError(
      'INVALID_PAYLOAD',
      'errors.protocol.invalid_payload',
    );
  }
  return parsed.data;
}

export function parsePresenceOnlineCount(
  input: unknown,
): PresenceOnlineCountEvent {
  const parsed = presenceOnlineCountEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProtocolValidationError(
      'INVALID_PAYLOAD',
      'errors.protocol.invalid_payload',
    );
  }
  return parsed.data;
}

export function safeParsePresenceOnlineCount(
  input: unknown,
):
  | { success: true; data: PresenceOnlineCountEvent }
  | { success: false; error: ProtocolValidationError } {
  try {
    return { success: true, data: parsePresenceOnlineCount(input) };
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
