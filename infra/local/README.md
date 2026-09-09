# Local infrastructure

Docker Compose services for foundation development:

- PostgreSQL `16.15-alpine` (durable data)
- Redis `7.4.11-alpine` (ephemeral state / presence / coordination — reserved for later milestones)

Published ports bind to **loopback** (`127.0.0.1`) by default via `BIND_HOST`.
Override `BIND_HOST` in a local `.env` only when you intentionally need another bind address.
Do not expose unauthenticated Redis on all interfaces by default.

## Commands

From the repository root:

```bash
pnpm run infra:validate
pnpm run infra:up
pnpm run infra:ps
pnpm run infra:down
```

These scripts call `scripts/docker-compose.mjs`, which:

- uses `docker compose` when the native CLI works
- on WSL, can fall back to `docker.exe compose`
- honors `LH_DOCKER_EXE` as an exact executable path (`compose` is appended; spaces allowed)
- optionally honors `LH_DOCKER_COMPOSE_ARGV` as a JSON argv array

### Explicit Docker executable (Bash / WSL)

```bash
export LH_DOCKER_EXE="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
pnpm run infra:up
```

### Explicit Docker executable (PowerShell)

```powershell
$env:LH_DOCKER_EXE = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
pnpm run infra:up
```

An invalid `LH_DOCKER_EXE` fails clearly and does not silently fall back.

`infra:down` stops containers and **does not** remove named volumes.

## Credentials

Defaults in `.env.example` are for local development only.
Do not commit real secrets or production passwords. All `.env` / `.env.*` files except `.env.example` are gitignored.
