# RC1 delivery status

Updated: 2026-09-14

## Last closed milestone

**LH-008 — Complete Energy and Tactical Powers Loop**

Previously closed: **LH-001 → LH-007**.

## Current milestone

**LH-009 — Advanced Challenge Pack** — implementation landed; **awaiting operator device/LAN confirmation** before formal close (see [LH-009-DELIVERY.md](./LH-009-DELIVERY.md)).

Includes hardening remaining LH-007 engines for real-device play and a mixed eleven-engine live catalog.

## Side delivery (not a milestone close)

**Quick Survival leaderboard** (migrations `035_player_leaderboard`, `037_player_leaderboard_stats`): after pull, run `pnpm --filter @thelastheart/backend db:migrate` and **rebuild/restart the baked backend container** before LAN/device APK tests so `GET /v1/leaderboard`, QS scoring, and challenge/playlist counters are live.

## Deferred

**LH-010 — Full Challenge Studio and Content Operations** — deferred until LH-009 is formally closed; Studio code remains in-tree but is not the current delivery focus.

## LH-008 close summary

- Feature commit: `7be53f2807e29b85028a1cbd1456394dcc0d56b3`
- Follow-ups through: `3eed4d7d51d9506ae82a3a06ceb70a472c8fc950`
- Evidence: [LH-008-DELIVERY.md](./LH-008-DELIVERY.md)
- Close authorized by product owner (operator self-install path)

## Closure rule (product owner lock)

After every milestone: acceptance on the real path, verification bugs fixed, required evidence, focused commit, **clean tree** — then advance.
