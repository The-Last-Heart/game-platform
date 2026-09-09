# Project Rules — The Last Heart (آخر قلب)

This document defines product and implementation boundaries for the monorepo.
It is authoritative for engineering work unless the Product Owner updates it.

## Product identity

- Product name: **The Last Heart** / **آخر قلب**
- Mobile application: Arabic-first, RTL, real-time online party game for Android and iOS
- Administration web application: English-first and LTR by default
- Administration web must support switching to Arabic; when Arabic is selected, the **complete** interface direction must change to RTL (`lang="ar"` and `dir="rtl"`)

## Localization rules (admin)

- English is the default language on first visit
- New admin text must be added through the localization system (locale dictionaries), **not** hardcoded in individual components
- Do not scatter language conditionals or duplicated translated components throughout the application
- Locale preference must persist across reloads (prefer server-readable persistence such as a cookie)
- Browser-language detection must not override English on the first visit
- Admin shell localization remains independent from the mobile/gameplay translation catalogs it will later manage

## Localization rules (mobile and gameplay)

- Mobile and gameplay translations are **server-managed** (backend is the long-term source of truth)
- User-facing product text must **not** be hardcoded in Flutter widgets, screens, challenge engines, or challenge configuration
- Copy is accessed through stable translation keys and resolved via the project localization layer
- Translation catalogs are versioned, published immutably, downloaded, and cached on device
- Matches **pin** a catalog version for the entire match; catalogs must not change mid-match
- No translation network request is allowed during the critical execution window of a challenge (typically 3–8 seconds)
- Only a **minimal bundled bootstrap** fallback is allowed for recovery (app name, loading, retry, offline, catalog unavailable, mandatory update)
- Fallback order: selected locale in pinned published catalog → Arabic in that catalog → compatible last-known-good cache → bootstrap → safe generic content-unavailable message
- Production users must never see raw translation keys
- Locale direction comes from locale metadata (`ltr` / `rtl`), not an Arabic-only assumption
- Translation values are data only — never executable code or unsanitized HTML
- Catalog replacement must be atomic after validation; corrupt/partial catalogs must not replace last-known-good
- A future admin milestone will provide Translation Management for mobile/gameplay catalogs

## Core game rules (baseline)

- Default match size: six players
- Every player starts with three hearts
- Challenges normally last between three and eight seconds
- Failing or responding too late may remove one heart
- Successful challenges charge the player’s energy
- Energy can unlock defensive or offensive powers
- A player with zero hearts becomes a spectator
- The last player retaining at least one heart wins
- Challenges are data-driven and controlled by the server
- The backend is authoritative for match state and results
- The application contains reusable challenge engines, not independently hardcoded levels
- The game does not use 3D characters or character animation
- Voice challenges are a future milestone and must **not** be implemented until authorized

## Engineering boundaries

Engineers must **not**:

- Invent game mechanics or product features
- Change defined game rules
- Redesign supplied UI references
- Implement future features ahead of the current milestone
- Select paid external services
- Create cloud infrastructure or external resources without explicit approval
- Add premature microservices
- Hardcode challenge-specific screens in a way that prevents server-driven configuration
- Commit secrets or real credentials
- Commit or archive `.env` / `.env.*` files other than `.env.example`
- Alter the real Git index from review/archive tooling
- Use verification commands that rewrite source (format checks must be read-only)
- Pass external command paths through whitespace splitting or shell evaluation; use argv arrays / exact executable paths
- Hardcode mobile/gameplay product copy in widgets (keys + server-managed catalogs are required)

If a product decision is missing, report it as an open question. Do not silently decide it.

## Application identifiers (provisional)

- Android application ID / iOS bundle identifier: `com.thelastheart.game`
- **Must be verified before store registration.** This value is provisional for foundation work only.

## Milestone discipline

Complete only the scope of the active milestone.
Do not continue into gameplay, complete admin pages, mobile UI implementation, or real-time networking unless the milestone explicitly requires it.

## Technology baseline

- Flutter (stable) for `apps/mobile`
- NestJS with strict TypeScript for `apps/backend`
- Next.js with strict TypeScript and App Router for `apps/admin-web`
- PostgreSQL for durable data
- Redis for ephemeral real-time state, presence, and coordination
- Docker Compose for local PostgreSQL and Redis
- pnpm workspaces for Node.js applications and packages
- Shared contracts live in `packages/contracts` and must not be manually divergent across clients
