# Admin web — The Last Heart

English-first administration foundation (Next.js App Router).

## Locales

- `/en` — English, `lang="en"`, `dir="ltr"`
- `/ar` — Arabic, `lang="ar"`, `dir="rtl"`
- `/` — resolves to persisted cookie locale, otherwise English

See `docs/decisions/ADR-003-admin-localization.md`.

## Verify

```bash
pnpm --filter @thelastheart/admin-web verify
```
