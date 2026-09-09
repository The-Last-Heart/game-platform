# Future translation contracts

Home for server-managed mobile and gameplay translation catalog contracts.

## Planned schemas (not implemented in LH-001)

| Document | Purpose |
| --- | --- |
| Catalog manifest | Locale list, direction, version, integrity metadata |
| Catalog payload | Immutable published translation entries by locale and key |
| Locale metadata | Locale code, display name, `ltr` / `rtl` direction |
| Translation key schema | Stable keys, namespaces, named interpolation parameters |
| Version compatibility | Which catalog versions are compatible within a match |

## Rules (future)

- Each catalog has a unique version and published versions are immutable.
- Draft changes do not affect mobile users.
- Publishing creates a new catalog version; rollback restores a previous published version.
- Clients apply a downloaded catalog atomically only after complete validation.
- A partial or corrupt catalog must never replace the last-known-good catalog.
- Match handshake pins a catalog version for the entire match; incompatible catalogs must not be used as silent fallbacks.
- Real-time challenge events carry translation keys and interpolation parameters — not resolved prose.
- No translation network request may occur on the critical path of a 3–8 second challenge.
- Admin shell localization remains independent from the mobile/gameplay catalogs.

## LH-001 / LH-001A scope

Document ownership only. Do **not** define final OpenAPI endpoints or database models here yet.
