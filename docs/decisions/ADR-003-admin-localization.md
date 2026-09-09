# ADR-003 — Admin localization

## Status

Accepted (LH-001)

## Context

The administration web app is used primarily by operators who work in English. The product also requires full Arabic support with document-level RTL. Localization must be consistent across future admin pages and must avoid hydration mismatches when setting `lang` and `dir`.

## Decision

### Why English is the admin default

- Admin is English-first by product rule
- First visit without a stored preference resolves to English (`/en`)
- Browser-language detection must **not** override English on the first visit

### Locale routing

- Locale-prefixed App Router segments: `/en` and `/ar`
- Root `/` resolves to the persisted locale cookie when present; otherwise English
- Navigation between locales preserves the equivalent page path where practical

### Locale preference persistence

- Preference is stored in a cookie (`lh_admin_locale`) readable by the server
- Cookie persists across reloads
- Language switch updates the cookie and navigates to the matching locale route

### `lang` and `dir` before render

- Locale is known on the server from the route segment (and cookie for `/`)
- Root layout sets `<html lang="…" dir="…">` from the active locale before HTML is sent
- English → `lang="en"` `dir="ltr"`
- Arabic → `lang="ar"` `dir="rtl"`
- This avoids client-only direction flips and hydration mismatch / flicker

### Translation dictionaries

- Dictionaries live under `apps/admin-web/src/i18n/messages/`
  - `en.ts` — English strings
  - `ar.ts` — Arabic strings
- A shared `t(locale, key)` helper loads from these dictionaries
- Missing keys surface a clear development-time error (they must not silently render empty UI)

### How future admin pages add translations

1. Add keys to both `en.ts` and `ar.ts`
2. Consume strings only through the shared localization helpers
3. Do **not** hardcode user-visible copy in components
4. Do **not** duplicate entire page trees per language

## Consequences

- All new admin UI copy is dictionary-driven
- Document direction always matches locale
- E2E frameworks are not required for foundation locale checks; focused automated tests cover English default and Arabic RTL mapping
