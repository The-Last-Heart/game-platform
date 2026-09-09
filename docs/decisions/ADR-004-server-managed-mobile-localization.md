# ADR-004 — Server-managed mobile localization

## Status

Accepted (LH-001A addendum)

## Context

The Last Heart mobile client is Arabic-first but must support additional languages later. Gameplay challenges are short (typically 3–8 seconds), server-driven, and fairness-sensitive. Hardcoding product copy inside Flutter widgets, challenge engines, or challenge configuration would:

- Prevent centralized translation updates without app store releases
- Force UI/component duplication per language
- Risk inconsistent copy across clients

Admin shell localization (English-first with Arabic/RTL) is a separate concern from the mobile/gameplay translation catalogs that operators will manage.

## Decision

### Why translations are server-managed

Mobile and gameplay user-facing text is keyed (`app.title`, challenge prompts, etc.). The long-term source of truth is the backend: catalogs are authored in admin Translation Management, published as immutable versioned artifacts, downloaded and cached by mobile, and resolved in memory during play.

### Why a minimal bundled fallback is still required

Before a published catalog is available (first launch, offline, corrupt download), the app still needs essential recovery copy: app name, loading, retry, offline, catalog unavailable, mandatory update. A **minimal bootstrap catalog** ships with the app for resilience only. It must not become a complete game translation pack.

Fallback order:

```text
Selected locale in the pinned published catalog
→ Arabic in the same compatible published catalog
→ Compatible last-known-good catalog
→ Minimal bundled bootstrap fallback
→ Safe generic localized content-unavailable message
```

Production users must never see raw translation keys. Catalog replacement must be atomic after full validation; a corrupt or partial catalog must never replace last-known-good.

### Why catalogs are downloaded before matches

Per-string network fetches during rendering or challenges would add latency and couple the UI to continuous connectivity. The client retrieves a complete published catalog, validates it, stores last-known-good, and loads it into memory **before** the player enters a match.

### How catalog version pinning protects fairness

The match handshake identifies the translation catalog version in use. That version remains pinned for the entire match so all players resolve the same keys to the same content. Catalogs must never change mid-match. Enabled challenges must reference valid keys; a player is not match-ready until the required catalog version is available.

### Why admin shell translations remain independent

The administration web app’s own UI uses bundled locale dictionaries (`/en`, `/ar`) so operators can reach Translation Management even if the remote mobile catalog is unavailable. Admin shell copy is not the mobile gameplay catalog.

## Consequences

- Widgets and challenge engines resolve keys through a localization abstraction
- Future milestones add catalog APIs, storage, admin Translation Management, and client sync
- LH-001A implements only the mobile boundary, bootstrap fallback, tests, and documentation
