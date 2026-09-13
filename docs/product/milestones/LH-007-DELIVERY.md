# LH-007 delivery note

## Close

- Feature commit: `11d7203069b7e6a5ae62e023b16e165f9ed21b19` — `feat(gameplay): ship core challenge engine pack`
- Follow-ups through: `a827ff5` — mid-match lobby flash / protocol parity
- Docs/LAN path: `5c9f9f9` — Docker `:3010` close path
- Milestone: LH-007 — Core Challenge Pack and Match Presentation
- Formal gate close: **awaiting operator confirmation** of the device/LAN visual matrix (self-install; adb attachment to the agent is not required)

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
- `pnpm exec jest src/match/domain/engines/lh007-pack.simulation.spec.ts` — **18/18 PASS** (per-engine success/failure/timeout-or-absence + 2-def → draw)
- `node scripts/simulate-lh007-pack.cjs` (delegates to that suite)
- `pnpm run db:migrate` → applied `004_lh007_core_challenge_pack`
- Flutter `dart analyze` on new engines / draw / shell
- Docker `apps` backend rebuilt healthy on `127.0.0.1:3010` (`lh-local-backend`)
- LAN APK rebuilt for Docker publish port: `http://192.168.100.74:3010`

## Device / LAN close path (operator self-install)

Install however you prefer (sideload, Files, `adb`, etc.). Agent does not need an attached device.

1. Ensure Docker backend is up (`pnpm run apps:up` / healthy on `:3010`).
2. If the phone cannot reach the PC, elevated PowerShell once (Docker publishes loopback):

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3010 connectaddress=127.0.0.1 connectport=3010
New-NetFirewallRule -DisplayName "LH backend 3010" -Direction Inbound -Protocol TCP -LocalPort 3010 -Action Allow
```

3. APK: `apps/mobile/build/app/outputs/flutter-apk/app-release.apk` → backend `http://192.168.100.74:3010`
4. Confirm phone can hit `http://192.168.100.74:3010/health/live`
5. Walk the visual matrix and confirm (pass/fail notes are enough; screenshots optional unless a bug):
   - Challenge intro
   - Each of six engines: success, loss, elimination where applicable
   - Spectator
   - Winner and draw (equal top hearts)
   - Reconnect during memory preview/answer
   - Reconnect during multitouch hold

## Journeys observed

- Unit/sim matrix: all six engines + finite equal-hearts draw — **done**
- Device/LAN visual matrix — **pending operator confirmation** (APK + Docker path ready)

## Gaps

- Operator confirmation of the device/LAN visual matrix (not an adb tooling gap)
- Weighted cooldown selection beyond finite ordered playlist remains catalog-pin ordered + metadata
