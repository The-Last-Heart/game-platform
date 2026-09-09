# Mobile — The Last Heart (آخر قلب)

Flutter foundation client (Android + iOS).

## Identity (provisional)

- Application ID / bundle identifier: `com.thelastheart.game`
- **Must be verified before store registration.**

## LH-001 / LH-001A scope

- Arabic-first locale with direction from locale metadata
- Product copy via stable translation keys (`lib/l10n/`)
- Minimal bundled bootstrap catalog (recovery fallback only)
- Strict analyzer settings
- Localization-focused widget and unit tests

Product text must not be hardcoded in widgets. Server catalog sync, admin Translation Management, and translation APIs are future milestones (see ADR-004).

## Verify

```bash
cd apps/mobile
flutter pub get
dart format --set-exit-if-changed .
flutter analyze
flutter test
```
