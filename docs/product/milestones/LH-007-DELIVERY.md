# LH-007 delivery note

## Close

- Feature commit: `11d7203069b7e6a5ae62e023b16e165f9ed21b19` — `feat(gameplay): ship core challenge engine pack`
- Milestone: LH-007 — Core Challenge Pack and Match Presentation
- Formal gate close: blocked until device/LAN visual evidence matrix is captured

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
- `node scripts/simulate-lh007-pack.cjs`
- `pnpm run db:migrate` → applied `004_lh007_core_challenge_pack`
- Flutter `dart analyze` on new engines / draw / shell

## Journeys observed

- Unit/sim: catalog exhaustion with equal hearts → draw
- Device/LAN visual matrix for all six engines: **pending operator capture** (rebuild APK + Nest restart required)

## Gaps

- Full device visual evidence matrix for intro/every engine/spectator/winner/draw still needs operator capture after APK rebuild against live backend
- Weighted cooldown selection beyond finite ordered playlist is deferred to catalog pin order + cooldown metadata in release entries
