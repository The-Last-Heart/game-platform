# LH-008 delivery note

## Close

- Feature commit: `7be53f2807e29b85028a1cbd1456394dcc0d56b3` — `feat(gameplay): complete energy and tactical powers`
- Follow-ups through: `3eed4d7d51d9506ae82a3a06ceb70a472c8fc950` — rematch Start now + wait_for_signal-only live catalog
- Milestone: LH-008 — Complete Energy and Tactical Powers Loop
- Formal gate close: **closed** — product owner authorized advance (operator self-install path; device matrix owned by operator)

## What shipped

- Energy threshold 4 → consume meter and grant exactly one weighted power (or explicit `inventory_full`)
- Inventory: max 3 total, max 1 per `danger_pulse` / `shield` / `reflection`
- Between-round phases `power_action` / `power_defense`
- Danger Pulse targeting rules, Shield, one-hop Reflection, protection through next challenge
- Emergency control gate for offensive activation
- Migration `005_lh008_power_configuration` + frozen power config at match create
- Mobile: 4-segment energy meter, unlock/inventory-full on round result, power action/defense views, protocol parity
- Privacy-conscious structured logs for power use / defense / skip (full product analytics remains LH-011/LH-012)
- Rematch quick lobby arms fill deadline so host **Start now / ابدأ الآن** appears
- Live catalog pinned to red/blue heart (`wait_for_signal`) only for local testing until Challenge Studio (LH-010); other engines remain in repo/DB

## Checks run

- `pnpm --filter @thelastheart/contracts build`
- `npx jest src/match/domain/engines/lh008-powers.simulation.spec.ts` — **6/6 PASS**
- `npx jest src/match/contracts.server-events.spec.ts` — **9/9 PASS**
- `npx jest src/match/services/match.service.spec.ts -t 'rematch party'` — PASS
- Flutter `contract_parity_test` + `match_reducer_test` — PASS
- Docker `schema_migrations`: `005_lh008_power_configuration`, `006_local_wait_for_signal_only_catalog`
- Docker backend healthy: `0.0.0.0:3012`
- LAN APK: `http://192.168.100.74:3012`

## Journeys observed

- Domain sims: grant, inventory full, hit/shield/reflect, no-loop, illegal targets — **done**
- Device/LAN visual matrix (screens 24–28, reconnect, audit) — **operator-owned** (self-install APK; product owner closed gate to advance)

## Gaps

- None for in-scope LH-008 items. Full product analytics warehouse remains LH-011/LH-012. Additional launch engines beyond wait_for_signal remain Challenge Studio / LH-009–LH-010 work.
