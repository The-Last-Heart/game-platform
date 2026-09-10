# ADR-007 — Real-time transport (Socket.IO)

- Status: Accepted
- Date: 2026-09-10
- Milestone: LH-002

## Context

LH-002 requires bidirectional real-time match synchronization for six concurrent clients with reconnect/snapshot support.

## Decision

Use NestJS WebSockets with the Socket.IO platform adapter (`@nestjs/websockets@11.2.3`, `@nestjs/platform-socket.io@11.2.3`, `socket.io@4.8.3`).

Gateway responsibilities are limited to:

- Connection lifecycle
- Payload size limits
- Schema validation
- Room membership by match ID
- Translating validated commands to domain operations and domain events to protocol events

Domain logic remains outside the gateway.

CORS is not wildcard-enabled for this milestone.

## Consequences

- Fast local development and integration testing with `socket.io-client`.
- Future multi-instance deployments will need a Redis Socket.IO adapter; the current design isolates that behind Nest/Socket.IO configuration without changing the match domain.
