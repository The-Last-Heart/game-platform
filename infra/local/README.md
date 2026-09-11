# Local infrastructure

Docker Compose services for foundation development:

- PostgreSQL `16.15-alpine` (durable data)
- Redis `7.4.11-alpine` (ephemeral state / presence / coordination)
- **Optional profile `apps`:** NestJS backend + Next.js admin-web images

Published ports bind to **loopback** (`127.0.0.1`) by default via `BIND_HOST`.
Override `BIND_HOST` in a local `.env` only when you intentionally need another bind address.
Do not expose unauthenticated Redis on all interfaces by default.

## Commands

From the repository root:

```bash
# Data stores only (default)
pnpm run infra:validate
pnpm run infra:up
pnpm run infra:ps
pnpm run infra:down

# Data stores + API (3000) + Admin web (3001)
pnpm run apps:build
pnpm run apps:up
pnpm run apps:ps
pnpm run apps:down
```

`infra:up` does **not** start the Node apps (keeps the light default).
`apps:up` enables Compose profile `apps`, builds images when needed, and starts
`postgres`, `redis`, `backend`, and `admin-web`.

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

`infra:down` / `apps:down` stop containers and **do not** remove named volumes.

## App containers

| Service | Image | Host port | Notes |
| --- | --- | --- | --- |
| `backend` | `lh-local-backend:local` | `3000` | Runs migrations on start, then Nest |
| `admin-web` | `lh-local-admin-web:local` | `3001` | Next.js standalone; BFF → `http://backend:3000` |

Override host ports with `BACKEND_PORT` / `ADMIN_WEB_PORT` in `infra/local/.env` if
`3000`/`3001` are already taken (or if Docker Desktop fails to publish them).
When you change `ADMIN_WEB_PORT`, leave `ADMIN_PUBLIC_ORIGIN` /
`ADMIN_ALLOWED_ORIGIN` unset (or update them to match the new host port).

Local app containers use `NODE_ENV=development` so loopback HTTP cookies work.
Do **not** treat this Compose profile as a production deployment.

Browser Origin should match the published admin port (e.g. `http://127.0.0.1:3001`
or `http://localhost:3001`). The BFF treats loopback hosts as equivalent.
If you see `CSRF_REJECTED` after switching between host Node and Docker apps,
hard-refresh or re-login so CSRF cookies are re-issued under the active secret.

Bootstrap a local super admin (after `apps:up`):

```bash
docker compose -f infra/local/docker-compose.yml --profile apps run --rm \
  -e ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
  -e ADMIN_BOOTSTRAP_PASSWORD='change-me-at-least-12' \
  -e ADMIN_BOOTSTRAP_DISPLAY_NAME='Bootstrap Admin' \
  backend node dist/admin/cli/bootstrap.js
```

(Use the repo’s `scripts/docker-compose.mjs` wrapper if native `docker compose` is unavailable.)

## Credentials

Defaults in `.env.example` are for local development only.
Do not commit real secrets or production passwords. All `.env` / `.env.*` files except `.env.example` are gitignored.

Dockerfiles live at:

- `infra/local/Dockerfile.backend`
- `infra/local/Dockerfile.admin-web`

They are intended for **local** Compose use, not a production cloud deployment milestone.
