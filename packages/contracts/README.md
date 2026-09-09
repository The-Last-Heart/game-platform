# Contracts package

Language-neutral contract foundation for The Last Heart.

## Rules

1. Every future real-time event **must** have a schema version.
2. The backend **must** validate incoming events against the contracts.
3. Mobile and admin clients **must not** maintain manually divergent copies of contracts.
4. Generated code **must not** be edited manually — regenerate from sources instead.

## Layout

| Path | Purpose |
| --- | --- |
| `rest/` | Future REST / OpenAPI documents |
| `realtime/` | Future real-time event schemas |
| `challenges/` | Future challenge-definition schemas |
| `translations/` | Future translation catalog / locale / key contracts |
| `generated/dart/` | Generated Dart clients (do not hand-edit) |
| `generated/typescript/` | Generated TypeScript clients (do not hand-edit) |
| `src/` | Package TypeScript entry used by the monorepo build |

## LH-001 / LH-001A scope

Do **not** define speculative gameplay events or final translation API/database models in this milestone.
Only the directory ownership and package scaffolding are in place.
