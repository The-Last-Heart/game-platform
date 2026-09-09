# ADR-005 — Supported toolchain and security hardening (LH-001C)

## Status

Accepted (LH-001C)

## Context

Pre-commit audits found remaining dependency vulnerabilities under Next.js 15.5.x,
unpinned Node engines that allowed Node 20, open-ended pnpm overrides, and
environment/logging gaps in the Nest foundation.

## Decision

- Pin Node.js to `24.21.0` (engines `>=24.21.0 <25`) and pnpm to `9.15.9`.
- Authorize and adopt Next.js `16.3.4` with React `19.2.8` for admin-web.
- Migrate Next request interception from `middleware.ts` to Next 16 `proxy.ts`.
- Use exact scoped pnpm overrides for known vulnerable transitive packages:
  - `lodash@4.18.1`
  - `multer@2.3.0`
  - `@angular-devkit/core>picomatch@4.0.4`
  - `@angular-devkit/core>ajv@8.18.0`
- Do **not** apply a global `ajv` override (breaks ESLint).
- Keep ESLint on 9.x for this remediation; ESLint 10 is deferred because of Next plugin peer incompatibilities.
- Enforce `strict-peer-dependencies=true` and frozen lockfile installs.
- Require structured JSON logging with effective `LOG_LEVEL` mapping.
- Bind local Postgres/Redis publish ports to loopback by default.
- Provide a documented WSL Docker Compose fallback via `scripts/docker-compose.mjs`.

## Consequences

- Admin depends on Next 16 proxy conventions and flat ESLint config.
- Dependency audits are expected to report zero known vulnerabilities after lockfile regeneration.
- Patch updates stay within selected major lines unless a later ADR authorizes another major upgrade.
