# LH-007 delivery note

## Close

- Feature commit: `11d7203069b7e6a5ae62e023b16e165f9ed21b19` — `feat(gameplay): ship core challenge engine pack`
- Follow-ups through: `a827ff5` — mid-match lobby flash / protocol parity
- Docs/LAN path: `5c9f9f9` — Docker `:3010` close path
- Operator evidence rule: `1e19a0c`
- Milestone: LH-007 — Core Challenge Pack and Match Presentation
- Formal gate close: **closed** — product owner authorized advance (operator self-install path; device matrix owned by operator)

## What shipped

- Finite catalog endgame: no playlist cycling; unique top hearts wins; tied hearts → `draw` with AR/EN Equal copy
- Six launch engines (contracts + evaluators + fixtures + Flutter UI): wait-for-signal, no-touch, reverse swipe, precision tap, memory sequence, multitouch hold
- Resolution `reasonKey` / `measureMs`; best-performer on simultaneous final elimination when measures exist
- Inclusive signal/challenge deadlines; memory preview→answer; hold progress submissions
- Migration `004_lh007_core_challenge_pack` publishes six-engine catalog + localization
- Shared play HUD shows hearts + energy; rematch available from draw
- Post-resolve public snapshot never presents `challenge_active` + null challenge as lobby

## Checks run

- `pnpm --filter @thelastheart/contracts build`
- Backend jest: launch evaluators, completeByStandings/draw, rematch, finite playlist draw
- `pnpm exec jest src/match/domain/engines/lh007-pack.simulation.spec.ts` — **18/18 PASS**
- `node scripts/simulate-lh007-pack.cjs`
- `pnpm run db:migrate` → applied `004_lh007_core_challenge_pack`
- Flutter `dart analyze` on new engines / draw / shell
- Docker `apps` backend healthy on `127.0.0.1:3010`
- LAN APK: `http://192.168.100.74:3010`

## Journeys observed

- Unit/sim matrix: all six engines + finite equal-hearts draw — **done**
- Device/LAN visual matrix — **operator-owned** (self-install APK; product owner closed gate to advance)

## Gaps

- None for in-scope LH-007 items. Weighted cooldown beyond finite ordered playlist remains future catalog metadata work (explicitly out of critical path for this close).
