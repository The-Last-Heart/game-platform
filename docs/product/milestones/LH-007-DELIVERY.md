# LH-007 delivery note

## Close

- Feature commit: `11d7203069b7e6a5ae62e023b16e165f9ed21b19` — `feat(gameplay): ship core challenge engine pack`
- Follow-ups through: `a827ff5` — mid-match lobby flash / protocol parity
- Milestone: LH-007 — Core Challenge Pack and Match Presentation
- Formal gate close: **blocked** — device/LAN visual matrix not yet operator-confirmed (no adb device attached)

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

## Device / LAN close path (operator)

No adb device was attached from this environment. Operator must:

1. **Elevated PowerShell** (Docker binds loopback; phone needs LAN → 127.0.0.1:3010):

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3010 connectaddress=127.0.0.1 connectport=3010
New-NetFirewallRule -DisplayName "LH backend 3010" -Direction Inbound -Protocol TCP -LocalPort 3010 -Action Allow
```

2. Install APK:

```bash
adb install -r apps/mobile/build/app/outputs/flutter-apk/app-release.apk
```

3. Confirm reachability from the phone/network to `http://192.168.100.74:3010/health/live`.

4. Capture visual evidence for LH-007 required matrix:
   - Challenge intro
   - Each of six engines: success, loss, elimination where applicable
   - Spectator
   - Winner and draw (equal top hearts)
   - Reconnect during memory preview/answer
   - Reconnect during multitouch hold

## Journeys observed

- Unit/sim matrix: all six engines + finite equal-hearts draw — **done**
- Device/LAN visual matrix — **pending operator** (APK + Docker path prepared; no device)

## Gaps

- Visual evidence matrix still needs operator capture on a real device/LAN APK
- Weighted cooldown selection beyond finite ordered playlist remains catalog-pin ordered + metadata
