# Real-time match core (LH-002)

## Components

- `packages/contracts/realtime/v1` — versioned envelopes, commands and events.
- `apps/backend/src/match/domain` — transport-independent match engine.
- `apps/backend/src/match/store` — `MatchStore` interface with in-memory implementation.
- `apps/backend/src/match/services` — serialized command processing, resume tokens, coordinator.
- `apps/backend/src/match/gateway` — NestJS Socket.IO adapter (validation + broadcast only).

## Authority boundary

The backend alone decides hearts, energy, deadlines, resolutions and winners.
Clients send intents (join, resume, submit answer, request snapshot).

## Event sequencing

Every accepted mutation increments match `sequence` / `revision`.
Server events carry `serverSequence`. Clients that detect a gap should request a snapshot.

## Idempotency

Mutating commands require `commandId`. Duplicates return the prior acknowledgement without re-applying mutations or advancing sequence.

## Storage limitation

The in-memory store supports **one backend process only**.
A future Redis-backed `MatchStore` and Socket.IO adapter may replace it without changing domain rules.

## Development fixture

`dev.deterministic_choice` is a test/simulation evaluator only.
It is not registered when `NODE_ENV=production` and must not be treated as product content.

## Simulation

```bash
pnpm --filter @thelastheart/backend build
pnpm run simulate:match
```
