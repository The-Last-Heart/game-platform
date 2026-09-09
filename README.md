# The Last Heart — آخر قلب

Monorepo for **The Last Heart** game platform: Arabic-first mobile game, English-first administration web, and authoritative backend.

> Read [`PROJECT_RULES.md`](./PROJECT_RULES.md) before implementing features.

## Repository structure

```text
game-platform/
├── apps/
│   ├── mobile/          # Flutter (Android + iOS)
│   ├── admin-web/       # Next.js App Router admin
│   └── backend/         # NestJS API
├── packages/
│   └── contracts/       # Shared API / event / challenge contracts
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── decisions/
│   └── ui-reference/
├── infra/
│   └── local/           # Docker Compose (PostgreSQL + Redis)
└── .github/workflows/
```

## Toolchain (pinned)

| Tool | Pinned / expected |
| --- | --- |
| Node.js | `24.21.0` (see `.nvmrc`; engines `>=24.21.0 <25`) |
| pnpm | `9.15.9` (`packageManager` field) |
| Next.js | `16.3.4` (admin-web; App Router + `src/proxy.ts`) |
| React | `19.2.8` |
| NestJS | `11.2.3` |
| Flutter | `3.44.0` stable (CI pins this version) |
| Dart | `3.12.0` (bundled with the tested Flutter SDK) |
| PostgreSQL | `16.15-alpine` (local Compose) |
| Redis | `7.4.11-alpine` (local Compose) |

Flutter lives outside the pnpm workspace. Node apps use pnpm workspaces.

### Patch updates

Stay on the selected major lines (NestJS 11, Next.js 16, React 19.2.x, Flutter 3.44.x). Apply compatible patch updates after `pnpm audit` / test verification. Do not perform NestJS or Next.js major upgrades without explicit approval. Do not run a global Flutter SDK upgrade for this repo alone when the SDK is shared with other local projects.

Dependency policy: prefer exact scoped `pnpm.overrides` for known vulnerable transitive packages. Do not mute advisories. Both `pnpm audit --prod` and full `pnpm audit` must report zero known vulnerabilities for a clean foundation.

## Prerequisites

1. Node.js `24.21.0` (nvm/fnm/asdf or equivalent)
2. pnpm `9.15.9` (`corepack enable` then `corepack prepare pnpm@9.15.9 --activate`)
3. Flutter `3.44.x` with Android and iOS toolchains as needed
4. Docker Engine / Docker Desktop with Compose v2

## Local setup

```bash
# Activate pinned Node (example with nvm)
nvm use

# Install Node workspace dependencies
pnpm install --frozen-lockfile --strict-peer-dependencies

# Validate and start local infrastructure
pnpm run infra:validate
pnpm run infra:up

# Backend
cp apps/backend/.env.example apps/backend/.env
pnpm run dev:backend

# Admin web
pnpm run dev:admin

# Mobile
cd apps/mobile
flutter pub get
flutter run
```

Stop infrastructure without deleting volumes:

```bash
pnpm run infra:down
```

### WSL Docker fallback

Root infra scripts use `scripts/docker-compose.mjs`:

1. Prefer native `docker compose` when it works.
2. On WSL, if native Docker is unusable, fall back to `docker.exe compose`.
3. Override with `LH_DOCKER_EXE` set to the **exact** Docker executable path (`compose` is appended internally). Paths may contain spaces:

```bash
# Bash / WSL
export LH_DOCKER_EXE="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
pnpm run infra:up
```

```powershell
# PowerShell
$env:LH_DOCKER_EXE = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
pnpm run infra:up
```

Optional unambiguous JSON argv override (advanced):

```bash
export LH_DOCKER_COMPOSE_ARGV='["/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe","compose"]'
```

Failures from Docker/Compose are not swallowed. An invalid `LH_DOCKER_EXE` does not silently fall back.

## Verification

```bash
pnpm run verify:workspace
pnpm run verify
pnpm run test:tooling
pnpm audit --prod
pnpm audit
```

Per application:

```bash
pnpm --filter @thelastheart/backend verify
pnpm --filter @thelastheart/admin-web verify

cd apps/mobile
flutter analyze
flutter test
# Read-only format check (does not rewrite sources)
dart format --output=none --set-exit-if-changed .
# Explicit formatter (writes files) — developer-only
# dart format .
```

### Review archive

Create a source-only review ZIP outside the repository (temporary Git index; real index unchanged):

```bash
pnpm run archive:review
# or:
node scripts/create-review-archive.mjs --output ../the-last-heart-lh001d-review.zip
node scripts/create-review-archive.mjs --help
```

See [`docs/decisions/ADR-006-review-artifact-and-secret-safety.md`](./docs/decisions/ADR-006-review-artifact-and-secret-safety.md).

## Application IDs and signing (provisional)

Mobile uses `com.thelastheart.game` as the provisional Android application ID and iOS bundle identifier.
**Verify this identifier before any store registration.**

Android release signing is intentionally **unconfigured** in this foundation. Do not use the debug keystore for release builds.

## Documentation

- Product baseline: [`docs/product/PRODUCT_BASELINE.md`](./docs/product/PRODUCT_BASELINE.md)
- Architecture foundation: [`docs/architecture/FOUNDATION.md`](./docs/architecture/FOUNDATION.md)
- Decisions: [`docs/decisions/`](./docs/decisions/)
- UI references: [`docs/ui-reference/`](./docs/ui-reference/) (assets still outstanding)

## Scope note

This repository foundation intentionally excludes authentication, matchmaking, gameplay, WebSockets, challenges, powers, audio processing, translation APIs/admin Translation Management, and production deployment until a later milestone authorizes them.

Mobile product copy uses a localization abstraction with a minimal bootstrap fallback. Long-term mobile/gameplay translations are server-managed (see ADR-004). Backend logs are structured JSON with effective `LOG_LEVEL` control.
