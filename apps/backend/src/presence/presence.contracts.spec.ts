import {
  PRESENCE_SCHEMA_VERSION,
  PresenceMessageTypes,
  ProtocolValidationError,
  parsePresenceHello,
  parsePresenceOnlineCount,
} from '@thelastheart/contracts';

describe('presence contracts v1', () => {
  const helloBase = {
    schemaVersion: PRESENCE_SCHEMA_VERSION,
    type: PresenceMessageTypes.Hello,
    messageId: 'msg-1',
    commandId: 'cmd-1',
    payload: { clientId: 'client-aaaa' },
  };

  it('accepts a valid presence.hello', () => {
    const command = parsePresenceHello(helloBase);
    expect(command.payload.clientId).toBe('client-aaaa');
  });

  it('rejects unknown schema versions', () => {
    expect(() =>
      parsePresenceHello({ ...helloBase, schemaVersion: '999' }),
    ).toThrow(ProtocolValidationError);
  });

  it('rejects match commands on the presence parser', () => {
    expect(() =>
      parsePresenceHello({ ...helloBase, type: 'match.join' }),
    ).toThrow(ProtocolValidationError);
  });

  it('rejects short or unsafe client ids', () => {
    expect(() =>
      parsePresenceHello({
        ...helloBase,
        payload: { clientId: 'short' },
      }),
    ).toThrow(ProtocolValidationError);
    expect(() =>
      parsePresenceHello({
        ...helloBase,
        payload: { clientId: 'bad id!!!!' },
      }),
    ).toThrow(ProtocolValidationError);
  });

  it('accepts a valid online count event', () => {
    const event = parsePresenceOnlineCount({
      schemaVersion: PRESENCE_SCHEMA_VERSION,
      type: PresenceMessageTypes.OnlineCount,
      messageId: 'msg-2',
      serverTimestampMs: 1_000,
      payload: { count: 3 },
    });
    expect(event.payload.count).toBe(3);
  });

  it('rejects negative online counts', () => {
    expect(() =>
      parsePresenceOnlineCount({
        schemaVersion: PRESENCE_SCHEMA_VERSION,
        type: PresenceMessageTypes.OnlineCount,
        messageId: 'msg-2',
        serverTimestampMs: 1_000,
        payload: { count: -1 },
      }),
    ).toThrow(ProtocolValidationError);
  });
});
