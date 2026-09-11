# LH-004A — Admin foundation

Backend + contracts foundation for the administration control center, plus the
admin-web BFF and UI shell.

## Architecture

- **Contracts** (`packages/contracts/src/admin/v1`): strict Zod schemas for roles,
  permissions, auth, administrator CRUD, dashboard overview, system status, audit
  logs, and success/error envelopes with stable error codes.
- **Database** (`apps/backend/src/database`): PostgreSQL pool from `DATABASE_URL`,
  parameterized `query` / `tx` helpers, SQL migration runner with
  `schema_migrations` + `pg_advisory_lock`.
- **Admin API** (`/api/admin/v1`): Nest module with session auth, RBAC guards,
  CSRF + Origin checks, Redis login throttle, and append-only audit logs.
- **Admin web BFF** (`apps/admin-web`): same-origin App Router routes under
  `/api/admin/v1/*` that proxy to the backend. The browser never talks to the
  backend directly and never receives `BACKEND_INTERNAL_URL`.

## Ports

| Service | Port |
| --- | --- |
| Backend (`apps/backend`) | **3000** |
| Admin web (`apps/admin-web`) | **3001** |

Admin-web `dev` / `start` scripts bind to **3001**. Backend `.env.example`
defaults to `PORT=3000`.

## Local setup (admin-web + backend)

1. Start infrastructure and migrate:

```bash
pnpm infra:up
pnpm db:migrate
```

2. Bootstrap a super admin (idempotent by email):

```bash
ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
ADMIN_BOOTSTRAP_PASSWORD='change-me-at-least-12' \
ADMIN_BOOTSTRAP_DISPLAY_NAME='Bootstrap Admin' \
pnpm admin:bootstrap
```

3. Backend on port 3000 with `ADMIN_ALLOWED_ORIGIN` pointing at admin-web:

```bash
pnpm dev:backend
```

4. Admin web on port 3001 with server-only backend URL and public origin:

```bash
# apps/admin-web/.env.local
BACKEND_INTERNAL_URL=http://127.0.0.1:3000
ADMIN_PUBLIC_ORIGIN=http://127.0.0.1:3001
NEXT_PUBLIC_ADMIN_ENV=development

pnpm dev:admin
```

Open `http://127.0.0.1:3001` → redirects to `/en/login` (English default).

## BFF flow

```
Browser  →  admin-web /api/admin/v1/...  →  BACKEND_INTERNAL_URL/api/admin/v1/...
```

- Session cookie `lh_admin_session` is **HttpOnly** on the admin-web origin.
  Login / change-password responses strip `sessionToken` before returning JSON.
- CSRF uses double-submit: readable `lh_admin_csrf` cookie + `X-CSRF-Token`
  header on mutating requests. The BFF forwards both to the backend.
- Mutating BFF requests validate the browser `Origin` (or Referer origin) against
  `ADMIN_PUBLIC_ORIGIN`, then forward a trusted `Origin: <ADMIN_PUBLIC_ORIGIN>`
  header to the backend (never the client Origin blindly). Backend
  `ADMIN_ALLOWED_ORIGIN` should match the same value.
- Backend errors are remapped to safe envelopes (stable codes + generic messages;
  no stacks or internal details).
- Proxy (`src/proxy.ts`) gates protected routes on session-cookie presence to
  avoid flashing protected chrome; `/login` is always allowed through so stale
  cookies do not redirect-loop. Layouts still validate `/auth/me` server-side.

## Auth model

- Passwords: Node `scrypt` with random salt, versioned encoding
  `scrypt$N$r$p$salt$hash` (min 12 characters).
- Sessions: opaque tokens (≥32 bytes). Only SHA-256 hashes are stored.
- Cookie name (BFF): `lh_admin_session`. Backend also accepts
  `Authorization: Bearer`.
- Absolute session TTL: `ADMIN_SESSION_TTL_SECONDS` (default 12h).
- Login creates a new independent session (prior sessions stay active until
  revoke / password change / deactivation).
- Logout is idempotent: CSRF + Origin required; valid session is optional.
  Always clears cookies and returns `{ revoked: true }`.
- Redis throttle keyed by normalized email; success clears the counter.
- Invalid credentials always return a generic error.
- CSRF: double-submit (`lh_admin_csrf` cookie + `X-CSRF-Token` header) on
  mutating requests. Origin/Referer must match `ADMIN_ALLOWED_ORIGIN` when set
  (required in production).
## Roles / permissions

| Role | Permissions |
| --- | --- |
| `super_admin` | all |
| `content_manager` | `dashboard:read`, `system:read` |
| `live_ops` | `dashboard:read`, `system:read`, `audit:read` |
| `translator` | `dashboard:read` |
| `viewer` | `dashboard:read`, `system:read` |

Administrator CRUD (`administrators:read` / `administrators:write`) is
`super_admin` only in this foundation.

Invariants:

- Case-insensitive email uniqueness (`email_normalized`).
- Cannot self-deactivate or self-demote from `super_admin`.
- Final active `super_admin` protected with `SELECT … FOR UPDATE` in a transaction.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/v1/auth/csrf` | Issue CSRF token |
| POST | `/api/admin/v1/auth/login` | CSRF + Origin |
| POST | `/api/admin/v1/auth/logout` | CSRF + Origin; session optional (idempotent) |
| GET | `/api/admin/v1/auth/me` | Auth |
| GET | `/api/admin/v1/auth/sessions` | Auth; active sessions (no secrets) |
| POST | `/api/admin/v1/auth/change-password` | Auth + CSRF; rotates session |
| POST | `/api/admin/v1/auth/revoke-other-sessions` | Auth + CSRF |
| GET/POST/GET/PATCH | `/api/admin/v1/administrators` | RBAC |
| GET | `/api/admin/v1/dashboard/overview` | Safe aggregates only |
| GET | `/api/admin/v1/system/status` | Health + sessions + aggregates |
| GET | `/api/admin/v1/audit-logs` | Redacted metadata |

Browser clients call the **same paths on admin-web** (port 3001); the BFF
forwards them to the backend.

## Admin-web routes

Localized under `/[locale]` (`en` default, `ar` RTL):

- `/login`, `/dashboard`, `/administrators`, `/administrators/new`,
  `/administrators/[id]`, `/audit-log`, `/system`, `/profile`,
  `/profile/security`

## Registering future nav items / permissions

1. Add or reuse a permission in `packages/contracts/src/admin/v1/permissions.ts`
   and map it on the relevant role(s).
2. Enforce it on the Nest controller with `@RequirePermissions(...)`.
3. Register the nav entry in `apps/admin-web/src/lib/nav/items.ts` with
   `permission` set (omit for any authenticated user).
4. Add English + Arabic labels in `apps/admin-web/src/i18n/messages/{en,ar}.ts`.
5. Add the page under `apps/admin-web/src/app/[locale]/(protected)/...`.
6. Extend Vitest coverage for permission filtering when the item is privileged.

Do **not** hardcode role checks in the UI when a permission already exists —
filter with `filterNavItems(permissions)`.

## Migrations

```bash
pnpm db:migrate
pnpm db:migrate:status
```

Tables: `admin_users`, `admin_sessions`, `admin_audit_logs`, plus
`schema_migrations`. Re-running migrate is idempotent.

## Bootstrap first super_admin

```bash
ADMIN_BOOTSTRAP_EMAIL=admin@example.com \
ADMIN_BOOTSTRAP_PASSWORD='change-me-at-least-12' \
ADMIN_BOOTSTRAP_DISPLAY_NAME='Bootstrap Admin' \
pnpm --filter @thelastheart/backend admin:bootstrap
```

Idempotent by email. Never prints password or hash.

## Audit redaction

Metadata keys matching `password|secret|token|authorization|cookie|hash|credential|session`
are replaced with `[REDACTED]` before persistence and again on read. Long strings
are truncated. Dashboard/system aggregates never include resume tokens, challenge
answers, or `serverConfig`.

## Environment

See `apps/backend/.env.example` for:

- `ADMIN_SESSION_TTL_SECONDS`
- `ADMIN_LOGIN_MAX_FAILURES` / `ADMIN_LOGIN_THROTTLE_TTL_SECONDS`
- `ADMIN_CSRF_SECRET`
- `ADMIN_ALLOWED_ORIGIN` (required in production; admin-web / BFF origin)
- `COOKIE_SECURE`
- `ADMIN_BOOTSTRAP_*`

See `apps/admin-web/.env.example` for:

- `BACKEND_INTERNAL_URL` (server-only, e.g. `http://127.0.0.1:3000`)
- `ADMIN_PUBLIC_ORIGIN` (server-only; BFF Origin validation + trusted forward)
- `NEXT_PUBLIC_ADMIN_ENV` (environment badge label)
