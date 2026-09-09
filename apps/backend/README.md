# @thelastheart/backend

NestJS foundation for The Last Heart.

## LH-001 scope

- `GET /health/live` — process liveness
- `GET /health/ready` — local dependency readiness (PostgreSQL + Redis)
- Environment validation
- Structured logging without sensitive values
- Graceful shutdown hooks

## Local run

```bash
cp .env.example .env
pnpm --filter @thelastheart/backend start:dev
```

## Verify

```bash
pnpm --filter @thelastheart/backend verify
```
