# LH-007 delivery note

## Close

- Feature commit: `11d7203069b7e6a5ae62e023b16e165f9ed21b19` — `feat(gameplay): ship core challenge engine pack`
- Milestone: LH-007 — Core Challenge Pack and Match Presentation
- Formal gate close: **blocked** — device/LAN visual matrix not yet operator-confirmed (no adb device attached)

## What shipped

- Finite catalog endgame: no playlist cycling; unique top hearts wins; tied hearts → `draw` with AR/EN Equal copy
- Six launch engines (contracts + evaluators + fixtures + Flutter UI): wait-for-signal, no-touch, reverse swipe, precision tap, memory sequence, multitouch hold
- Resolution `reasonKey` / `measureMs`; best-performer on simultaneous final elimination when measures exist
- Inclusive signal/challenge deadlines; memory preview→answer; hold progress submissions
- Migration `004_lh007_core_challenge_pack` publishes six-engine catalog + localization
- Shared play HUD shows hearts + energy; rematch available from draw

## Checks run

- `pnpm --filter @thelastheart/contracts build`
- Backend jest: launch evaluators, completeByStandings/draw, rematch, finite playlist draw
- `pnpm exec jest src/match/domain/engines/lh007-pack.simulation.spec.ts` — **18/18 PASS** (per-engine success/failure/timeout-or-absence + 2-def → draw)
- `node scripts/simulate-lh007-pack.cjs` (delegates to that suite)
- `pnpm run db:migrate` → applied `004_lh007_core_challenge_pack`
- Flutter `dart analyze` on new engines / draw / shell
- LAN APK rebuilt: `apps/mobile/build/app/outputs/flutter-apk/app-release.apk` → `http://192.168.100.74:3000`

## Journeys observed

- Unit/sim matrix: all six engines + finite equal-hearts draw — **done**
- Device/LAN visual: intro, every engine, success, loss, elimination, spectator, winner/draw, memory reconnect, hold reconnect — **pending operator** (install APK; Nest on `:3000`)

## Gaps

- Visual evidence matrix still needs operator capture on a real device/LAN APK
- Weighted cooldown selection beyond finite ordered playlist remains catalog-pin ordered + metadata
