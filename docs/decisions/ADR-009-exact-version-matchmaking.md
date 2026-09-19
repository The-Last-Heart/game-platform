# ADR-009 — Exact-Version Matchmaking and Additive Challenge Compatibility

## Status

Accepted (implementation in progress / Stage 1 additive)

## Context

Players on incompatible Flutter builds must not share an online match or receive challenge engines their installed application cannot execute. The same player may run different versions across devices. Challenge content is additive: newer application releases retain older engines.

## Decision

1. **Exact-version rooms.** Quick Survival, private rooms, reconnect, spectators that render gameplay, and rematch require identical normalized `major.minor.patch` application versions. Build numbers are diagnostic only.
2. **Session vs last-seen.** Session/socket runtime metadata is authoritative for admission. Player last-seen version is telemetry for administration.
3. **Immutable `gameplayVersion`.** Pinned when a room/match is created; never mutated by reconnects, updates, or policy edits.
4. **Mandatory update policy.** Administrators configure `minimumSupportedVersion` and store URLs. Versions below the minimum cannot enter new online play. Running matches finish (active-match grace); rematch is blocked.
5. **Challenge compatibility.** `minAppVersion` is a lower bound. Playlist filtering also enforces required capabilities and the engine compatibility registry. Unknown-engine fallback is not a compatibility strategy.
6. **Staged rollout.** Runtime metadata is additive/optional until `APP_VERSION_STRICT_ENFORCEMENT` and a store-available version-aware client are ready.

## Consequences

- Matchmaking partition key includes application version (capacity 6 unchanged).
- Private-room joiners receive older/newer typed errors after mandatory-update checks.
- Challenge Studio cannot publish below the engine floor.
- Legacy clients that never send metadata remain in the migration cohort until enforcement is activated.
