# ADR-001 — Monorepo foundation

## Status

Accepted (LH-001)

## Context

The Last Heart requires a mobile client, an administration web app, and an authoritative backend that share contracts. Independent repositories would slow coordination and invite divergent APIs.

## Decision

Use a single monorepo (`game-platform`) with:

- `apps/mobile` — Flutter
- `apps/admin-web` — Next.js
- `apps/backend` — NestJS
- `packages/contracts` — shared contracts
- `infra/local` — Docker Compose for PostgreSQL and Redis
- `docs/` — product, architecture, decisions, UI references

Node.js apps and packages use **pnpm workspaces**. Flutter remains outside the Node workspace and is managed with the Flutter toolchain.

## Consequences

- Shared contracts and documentation live next to consumers
- CI can verify Node and Flutter targets from one repository
- Teams must respect package boundaries and milestone scope
- Flutter tooling and pnpm tooling remain separate install paths
