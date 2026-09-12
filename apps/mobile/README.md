# The Last Heart — آخر قلب — Mobile Client

Flutter mobile client for the LH-003 playable realtime slice.

## Prerequisites

- Flutter SDK ≥ 3.12.0
- The Last Heart backend running (see `apps/backend/`)

## Running the Backend

```bash
cd apps/backend
pnpm install
pnpm run start:dev
# Backend starts on http://127.0.0.1:3000
```

## Running the Flutter App

### iOS Simulator

```bash
cd apps/mobile
flutter run --dart-define=LH_BACKEND_URL=http://127.0.0.1:3000
```

### Android Emulator

The Android emulator uses `10.0.2.2` to reach the host machine's localhost:

```bash
cd apps/mobile
flutter run --dart-define=LH_BACKEND_URL=http://10.0.2.2:3000
```

### Physical Device

Replace `<lan-ip>` with your machine's LAN IP address:

```bash
cd apps/mobile
flutter run --dart-define=LH_BACKEND_URL=http://<lan-ip>:3000
```

### Release APK for a real device (LAN backend)

From the repo root on WSL, build a release APK that embeds this machine's
reachable address (prefers the Windows Wi-Fi/LAN IP under WSL):

```bash
./scripts/build-android-lan-apk.sh
```

Overrides:

```bash
LH_BACKEND_URL=http://192.168.1.10:3000 ./scripts/build-android-lan-apk.sh
LH_LAN_HOST=192.168.1.10 LH_BACKEND_PORT=3000 ./scripts/build-android-lan-apk.sh
```

Output: `apps/mobile/build/app/outputs/flutter-apk/app-release.apk`

The phone must reach that URL on the same LAN. Nest must not bind loopback-only.
On WSL2, forward the backend port from Windows to the WSL guest (the script prints
the `netsh` commands). Docker `apps` profile defaults to `BIND_HOST=127.0.0.1` —
set `BIND_HOST=0.0.0.0` in `infra/local/.env` only for intentional LAN access.

### Debug APK Build

```bash
cd apps/mobile
flutter build apk --debug --dart-define=LH_BACKEND_URL=http://10.0.2.2:3000
```

## Development

### Tests

```bash
cd apps/mobile
flutter test
```

### Format Check

```bash
dart format --output=none --set-exit-if-changed .
```

### Static Analysis

```bash
flutter analyze
```

## Architecture

### Realtime Transport

The app connects to the backend via Socket.IO (`socket_io_client`).
Commands are sent on the `command` channel; server events arrive on the `event` channel.

- `lib/features/match/transport/` — abstract transport + Socket.IO implementation + fake for tests
- `lib/features/match/protocol/realtime_messages.dart` — hand-written Dart models matching `packages/contracts` realtime v1

### State Management

- `MatchReducer` processes server envelopes into immutable `MatchViewState`
- Sequence gating: stale/duplicate messages are ignored; gaps trigger snapshot requests
- `MatchSessionController` orchestrates the dev-match flow and exposes a `ValueNotifier<MatchViewState>`

### Session Persistence

- `flutter_secure_storage` stores matchId, playerId, and resumeToken for reconnection
- Token rotation on successful resume

### Challenge Engines

- `ChallengeEngineRegistry` maps `engineId` → engine widget builder
- `reaction.wait_for_signal`: red heart → blue on signal → one-tap submit
- Unrecognized engines fall back to `UnknownEngine` (content-unavailable UI)
- All prompt text comes from l10n keys — no hardcoded strings in engines

### Localization

- Arabic-first RTL throughout
- Bootstrap catalog includes all challenge instruction keys for offline operation
- `TranslationResolver` handles fallback chain: published → cached → bootstrap

### Design Tokens

- `lib/theme/lh_tokens.dart` — colors, radii, and theme builder from brand style guide
