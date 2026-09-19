# Application version compatibility

## Exact-version matchmaking

Players may share a Quick Survival lobby, private room, rematch, or resumed match only when their normalized application versions are **exactly equal** (`major.minor.patch`). Build numbers (Android versionCode / iOS CFBundleVersion) are stored for diagnostics and must not be used as the matchmaking key.

Session-level runtime metadata on the live connection is authoritative. Player last-seen version on the account record is administration/telemetry only.

Each match stores an immutable `gameplayVersion` at create time.

## Challenge compatibility (additive)

Newer application releases retain older challenge engines. A challenge is eligible when:

```text
match.gameplayVersion >= challenge.minAppVersion
AND release supports all requiredCapabilities
AND the engine schema is registered for that release
```

`minAppVersion` is a **lower bound**, not exact equality.

## Mandatory updates

Administrators set `minimumSupportedVersion` (and store URLs) on the System page. Clients below the minimum receive `APP_UPDATE_REQUIRED` and a non-dismissible update screen. Raising the minimum:

- Cancels waiting Quick Survival tickets and waiting lobbies for older versions (no heart loss).
- Does **not** eject active running matches (active-match grace).
- Blocks rematch / new rooms after the match ends.

## Engine vs content

Flutter engines/renderers require an app release. Server challenge definition data for an already-shipped engine does not automatically require a new app version.

## Rollout

1. Additive backend + optional metadata (current Stage 1; `APP_VERSION_STRICT_ENFORCEMENT=false`).
2. Ship version-aware mobile clients.
3. Verify cohorts, playlists, store URLs.
4. Raise `minimumSupportedVersion` only after store availability.

See [ADR-009](../decisions/ADR-009-exact-version-matchmaking.md).
