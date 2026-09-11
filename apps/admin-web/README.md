# Admin web — The Last Heart

English-first administration control center (Next.js App Router) with Arabic RTL,
same-origin BFF, and permission-aware shell.

## Ports

- Admin web: **3001**
- Backend (via `BACKEND_INTERNAL_URL`): **3000**

## Locales

- `/en` — English, `lang="en"`, `dir="ltr"`
- `/ar` — Arabic, `lang="ar"`, `dir="rtl"`
- `/` — resolves to persisted cookie locale, otherwise English → login/dashboard

See `docs/decisions/ADR-003-admin-localization.md` and
`docs/admin/LH-004A-ADMIN-FOUNDATION.md`.

## Verify

```bash
pnpm --filter @thelastheart/admin-web verify
```
