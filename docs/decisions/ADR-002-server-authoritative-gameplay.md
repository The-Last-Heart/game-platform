# ADR-002 — Server-authoritative gameplay

## Status

Accepted (LH-001 baseline)

## Context

The Last Heart is a real-time party game where hearts, energy, challenge outcomes, and win conditions affect every player. Client-side authority would allow cheating and inconsistent results across devices.

## Decision

- The **backend** is authoritative for match state and results.
- Challenges are **data-driven** and controlled by the server.
- Mobile and admin clients render and interact using contracts; they do not define divergent game rules locally.
- Real-time and REST contracts will live in `packages/contracts` with schema versions.

## Consequences

- Clients must tolerate server corrections of optimistic UI (when introduced later)
- Challenge screens must not be hardcoded in a way that blocks server configuration
- Contract changes require coordinated generation for Dart and TypeScript clients
- Gameplay networking is out of scope for LH-001; this ADR constrains future work
