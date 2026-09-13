# LH-008 delivery note

## Status

- Milestone: LH-008 — Complete Energy and Tactical Powers Loop
- Feature commit: `7be53f2807e29b85028a1cbd1456394dcc0d56b3` — `feat(gameplay): complete energy and tactical powers`
- Formal close: **blocked** on operator device journeys (screens 24–28, reconnect matrix, audit demo)

## What shipped

- Energy threshold 4 → consume meter and grant exactly one weighted power (or explicit `inventory_full`)
- Inventory: max 3 total, max 1 per `danger_pulse` / `shield` / `reflection`
- Between-round phases `power_action` / `power_defense`
- Danger Pulse targeting rules, Shield, one-hop Reflection, protection through next challenge
- Emergency control gate for offensive activation
- Migration `005_lh008_power_configuration` + frozen power config at match create
- Mobile: 4-segment energy meter, unlock/inventory-full on round result, power action/defense views, protocol parity
- Privacy-conscious structured logs for power use / defense / skip (full product analytics remains LH-011/LH-012)

## Checks run

- `pnpm --filter @thelastheart/contracts build`
- `npx jest src/match/domain/engines/lh008-powers.simulation.spec.ts` — **6/6 PASS**
- `npx jest src/match/contracts.server-events.spec.ts` — **9/9 PASS**
- Flutter `contract_parity_test` + `match_reducer_test` — PASS
- Docker `schema_migrations`: `005_lh008_power_configuration` applied
- Docker backend healthy: `0.0.0.0:3012` (`BACKEND_PORT=3012` — host `3010` blocked by Windows portproxy)
- LAN APK built: `apps/mobile/build/app/outputs/flutter-apk/app-release.apk` → `http://192.168.100.74:3012`

## Gaps (in-scope; blocks formal close)

- Operator visual recordings for each power path (screens 24–28)
- Reconnect matrix across power phases on device
- Admin audit demo of power config affecting only new matches
