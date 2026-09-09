# Architecture Foundation

## Purpose

Describe the LH-001 monorepo foundation for The Last Heart. This document covers structure and local runtime only. It does not authorize gameplay, authentication, matchmaking, or production deployment.

## System sketch

```text
┌─────────────────┐     ┌─────────────────┐
│  apps/mobile    │     │ apps/admin-web  │
│  Flutter RTL    │     │ Next.js LTR/RTL │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │      packages/        │
         │      contracts        │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │ apps/backend│
              │   NestJS    │
              └──────┬──────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   PostgreSQL (durable)    Redis (ephemeral)
         infra/local (Docker Compose)
```

## Applications

| Path | Role | Stack |
| --- | --- | --- |
| `apps/mobile` | Player client | Flutter (Android + iOS) |
| `apps/admin-web` | Operations / content admin | Next.js App Router, TypeScript |
| `apps/backend` | Authoritative API | NestJS, TypeScript |

## Shared packages

| Path | Role |
| --- | --- |
| `packages/contracts` | Language-neutral contract source; future OpenAPI, realtime schemas, challenge schemas, generated Dart/TS clients |

## Local infrastructure

`infra/local/docker-compose.yml` runs:

- PostgreSQL with a named volume and health check
- Redis with a named volume and health check

Safe local defaults only. No production credentials.

## Authority model

- Backend is authoritative for match state and results (see ADR-002).
- Clients must not invent divergent contract copies (see `packages/contracts`).
- Challenges are data-driven; mobile exposes reusable engines, not hardcoded levels.
- Mobile/gameplay translations are server-managed versioned catalogs (see ADR-004). Matches pin a catalog version; no translation fetch during challenge critical path.

## Mobile localization foundation (LH-001A / LH-001C)

- Widgets resolve product copy through stable keys and a localization abstraction.
- Catalogs validate empty/whitespace values and reject normalized key/locale collisions.
- Locale metadata fallback searches published → cached → bootstrap (selected then fallback locale).
- Debug builds surface missing keys; release builds never expose raw keys or raw `{placeholders}`.
- Minimal bundled bootstrap catalog supports recovery only.
- Future catalog download, cache, admin Translation Management, and APIs remain out of scope.

## Backend foundation notes

- Structured JSON logging via Nest `ConsoleLogger` with `LOG_LEVEL` mapped to Nest log levels.
- Environment validation rejects invalid ports and malformed Postgres/Redis URLs without echoing secrets.
- Production configuration cannot disable dependency readiness checks.

## Out of scope (foundation)

Authentication, rooms, matchmaking, WebSockets, challenge runtime, powers, audio, queues, domain tables, translation APIs/DB/admin screens, cloud resources, and production deployment.
