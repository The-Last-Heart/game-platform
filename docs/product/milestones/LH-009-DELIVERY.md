# LH-009 delivery note

## Status

- Implementation commit: `e2b3728439d531f31975cb4df9a47024de05a827`
- Milestone: LH-009 — Advanced Challenge Pack (mobile-first; Studio paused)
- Formal gate close: **pending operator device/LAN confirmation** — do not advance to LH-010 until journeys below are confirmed

## What shipped

- All 11 launch engines marked `live` in contracts with mobile widgets + backend evaluators
- Shared mobile fixes: wait-for-signal-only early-miss overlay; hold `final:false` progress does not lock input
- Memory preview sequence from server config during `preview` phase
- LH-009 engines: `motion.shake`, `motion.tilt_balance`, `audio.cue`, `social.pair_sync`, `tactical.risk_choice`
  - Pair sync: odd seat / missing partner → published fair success (`result.pair.fallback`)
  - Risk choice: safe → +1 energy override, risky → +3 (no reconnect reroll of pinned definition)
- Mixed live catalog migration `008_lh009_mixed_challenge_catalog.sql` (replaces wait-for-signal-only current release)
- Dev fixture playlist: one of each live engine
- AR/EN bootstrap strings for new prompts, results, categories, a11y fallbacks

## Checks run

- `pnpm --filter @thelastheart/contracts build`
- Jest: `advanced-evaluators`, `launch-evaluators`, `lh010-engines`, `lh007-pack.simulation`, `content-lifecycle.lh010` — **PASS**
- Flutter: `engine_test` (11-engine registry) + session early-miss / hold-progress cases — **PASS**

## Journeys observed

- Unit/domain coverage for evaluators and session submit rules — **done**
- Device/LAN APK matrix (screens 11–21, pair-sync two seats, shake/tilt/audio fallbacks) — **awaiting operator self-install confirmation**

## Gaps

- Formal LH-009 gate remains open until operator confirms in-scope device journeys
- Risk “follow-up challenge after choice” from LH-009.md is simplified to immediate energy override on successful choice (definition + reward stay pinned for the round; no reconnect reroll)
- After operator close: next milestone = **LH-010** (Studio redesigned from proven mobile controllables)
