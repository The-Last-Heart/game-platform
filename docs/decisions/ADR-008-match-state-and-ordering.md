# ADR-008 — Match state and ordering

- Status: Accepted
- Date: 2026-09-10
- Milestone: LH-002

## Context

Concurrent joins, submissions and deadlines can corrupt hearts/energy if applied unsafely.

## Decision

1. Process commands for a given `matchId` on a per-match serial queue.
2. Use an injectable clock; deadline decisions use monotonic comparisons.
3. Require `commandId` idempotency for mutations.
4. Emit strictly increasing `serverSequence` values for accepted mutations.
5. Persist matches behind `MatchStore` (in-memory for LH-002).

## Consequences

- Double-resolves between timeout and submission are prevented by serial execution and round status checks.
- The in-memory store is single-process only until a Redis-backed store is introduced.
- Zero-survivor rounds halt without inventing a winner (open product question).
